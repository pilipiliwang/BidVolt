export type BackendApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type BackendApiRequestEventStatus =
  | 'started'
  | 'succeeded'
  | 'expected-empty'
  | 'failed';

export type BackendApiRequestEvent = Readonly<{
  requestId: string;
  sequence: number;
  method: BackendApiRequestMethod;
  path: string;
  pathname: string;
  startedAt: string;
  finishedAt: string | null;
  latencyMs: number | null;
  status: BackendApiRequestEventStatus;
}>;

export type BackendApiRequestEventListener = (event: BackendApiRequestEvent) => void;

export type BackendApiRequestLifecycle = {
  succeeded: () => void;
  expectedEmpty: () => void;
  failed: () => void;
};

const listeners = new Set<BackendApiRequestEventListener>();
let nextSequence = 0;

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;
const SENSITIVE_QUERY_KEY = /(?:^|[_-])(?:access|refresh)?token(?:$|[_-])|password|secret|authorization|api[_-]?key|signature|credential/i;

const normalizePathname = (pathname: string) => {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const withoutTrailingSlash = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  return withoutTrailingSlash || '/';
};

const safeQuery = (query: string) => {
  if (!query) return '';
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEY.test(key)) params.set(key, '[REDACTED]');
  }
  const normalized = params.toString();
  return normalized ? `?${normalized}` : '';
};

/**
 * Produces a safe relative path for diagnostics. Business query parameters are
 * retained so callers can distinguish filters, while credential-like values
 * are redacted and fragments are always removed.
 */
export function normalizeBackendRequestPath(path: string): string {
  const safeInput = [...path]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join('')
    .trim();
  let pathname: string;
  let query: string;

  if (ABSOLUTE_URL.test(safeInput)) {
    try {
      const url = new URL(safeInput);
      pathname = url.pathname;
      query = url.search.slice(1);
    } catch {
      pathname = '/';
      query = '';
    }
  } else {
    const withoutFragment = safeInput.split('#', 1)[0];
    const querySeparator = withoutFragment.indexOf('?');
    pathname = querySeparator >= 0
      ? withoutFragment.slice(0, querySeparator)
      : withoutFragment;
    query = querySeparator >= 0 ? withoutFragment.slice(querySeparator + 1) : '';
  }

  return `${normalizePathname(pathname)}${safeQuery(query)}`;
}

export function normalizeBackendRequestPathname(path: string): string {
  return normalizeBackendRequestPath(path).split('?', 1)[0];
}

function publishBackendApiRequestEvent(event: BackendApiRequestEvent) {
  const safeEvent = Object.freeze({ ...event });
  for (const listener of [...listeners]) {
    try {
      listener(safeEvent);
    } catch {
      // Diagnostics must never change request behavior.
    }
  }
}

/** Subscribes to future request lifecycle events. The returned cleanup is idempotent. */
export function subscribeToBackendApiRequests(listener: BackendApiRequestEventListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts one logical client request and returns its one-shot terminal publishers. */
export function startBackendApiRequestLifecycle(
  method: BackendApiRequestMethod,
  path: string,
): BackendApiRequestLifecycle {
  const sequence = ++nextSequence;
  const startedAtEpochMs = Date.now();
  const startedAt = new Date(startedAtEpochMs).toISOString();
  const requestId = `backend-request-${sequence}`;
  const normalizedPath = normalizeBackendRequestPath(path);
  const pathname = normalizedPath.split('?', 1)[0];
  let finished = false;

  publishBackendApiRequestEvent({
    requestId,
    sequence,
    method,
    path: normalizedPath,
    pathname,
    startedAt,
    finishedAt: null,
    latencyMs: null,
    status: 'started',
  });

  const finish = (status: Exclude<BackendApiRequestEventStatus, 'started'>) => {
    if (finished) return;
    finished = true;
    const finishedAtEpochMs = Date.now();
    publishBackendApiRequestEvent({
      requestId,
      sequence,
      method,
      path: normalizedPath,
      pathname,
      startedAt,
      finishedAt: new Date(finishedAtEpochMs).toISOString(),
      latencyMs: Math.max(0, Math.round(finishedAtEpochMs - startedAtEpochMs)),
      status,
    });
  };

  return {
    succeeded: () => finish('succeeded'),
    expectedEmpty: () => finish('expected-empty'),
    failed: () => finish('failed'),
  };
}
