export type TokenProvider = () => string | null | undefined;
export type BackendRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown | FormData;
  headers?: HeadersInit; signal?: AbortSignal; skipAuthRefresh?: boolean;
};
export type RefreshHandler = () => Promise<boolean>;
export class BackendApiError extends Error {
  readonly status: number; readonly detail: unknown; readonly retryable: boolean;
  readonly accessToken?: string | null;
  constructor(
    status: number,
    message: string,
    detail?: unknown,
    options?: ErrorOptions & { accessToken?: string | null },
  ) {
    super(message, options); this.name = 'BackendApiError'; this.status = status; this.detail = detail;
    this.retryable = status === 0 || status >= 500;
    this.accessToken = options?.accessToken;
  }
}
export type BackendApiClient = {
  request<T>(path: string, options?: BackendRequestOptions): Promise<T>;
  requestVoid(path: string, options?: BackendRequestOptions): Promise<void>;
  requestBlob(path: string, options?: BackendRequestOptions): Promise<Blob>;
};
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const parseTextAsJson = (text: string): unknown => {
  if (!text) return undefined;
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
};
const validationMessage = (detail: unknown): string => {
  if (typeof detail === 'string') return detail;
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message;
  if (Array.isArray(detail)) {
    const messages = detail.map((entry) => isRecord(entry) && typeof entry.msg === 'string' ? entry.msg : null)
      .filter((entry): entry is string => entry !== null);
    if (messages.length > 0) return messages.join('；');
  }
  return '后端请求失败';
};
const errorFromResponse = async (
  response: Response,
  accessToken?: string | null,
): Promise<BackendApiError> => {
  const payload = parseTextAsJson(await response.text());
  const detail = isRecord(payload) && 'detail' in payload ? payload.detail : payload;
  return new BackendApiError(
    response.status,
    validationMessage(detail) || response.statusText,
    detail,
    { accessToken },
  );
};
const buildRequest = (
  options: BackendRequestOptions,
  tokenProvider?: TokenProvider,
): { accessToken: string | null; init: RequestInit } => {
  const headers = new Headers(options.headers); const token = tokenProvider?.() ?? null;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(options.body); }
  return {
    accessToken: token,
    init: { method: options.method ?? 'GET', headers, body, signal: options.signal },
  };
};
export const createBackendApiClient = ({
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  tokenProvider,
  fetchImpl = fetch,
  onAuthExpired,
  refreshHandler,
}: {
  baseUrl?: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
  onAuthExpired?: (accessToken: string | null) => void;
  refreshHandler?: RefreshHandler;
} = {}): BackendApiClient => {
  let refreshFlight: Promise<boolean> | null = null;
  let refreshedTokenTransition: { from: string; to: string } | null = null;
  const call = async (path: string, options: BackendRequestOptions = {}) => {
    const request = buildRequest(options, tokenProvider);
    try {
      return {
        accessToken: request.accessToken,
        response: await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, request.init),
      };
    }
    catch (cause) {
      throw new BackendApiError(0, '无法连接后端服务', cause, {
        accessToken: request.accessToken,
        cause,
      });
    }
  };

  const recoverUnauthorized = async (
    path: string,
    options: BackendRequestOptions,
    failedAccessToken: string | null,
  ) => {
    if (options.skipAuthRefresh || !refreshHandler || !failedAccessToken) return null;

    const latestAccessToken = tokenProvider?.() ?? null;
    let expectedReplayToken: string;
    if (latestAccessToken !== failedAccessToken) {
      const wasRotatedByThisClient = refreshedTokenTransition?.from === failedAccessToken
        && refreshedTokenTransition.to === latestAccessToken;
      if (!wasRotatedByThisClient) return null;
      expectedReplayToken = latestAccessToken;
    } else {
      if (!refreshFlight) {
        refreshFlight = Promise.resolve()
          .then(refreshHandler)
          .then((refreshed) => {
            const nextAccessToken = tokenProvider?.() ?? null;
            if (refreshed && nextAccessToken && nextAccessToken !== failedAccessToken) {
              refreshedTokenTransition = { from: failedAccessToken, to: nextAccessToken };
            }
            return refreshed;
          })
          .catch(() => false)
          .finally(() => { refreshFlight = null; });
      }
      if (!await refreshFlight) return null;
      const transition = refreshedTokenTransition;
      if (!transition || transition.from !== failedAccessToken) return null;
      expectedReplayToken = transition.to;
    }

    // Switching accounts after refresh but before replay must never send the old
    // operation with the new tenant's bearer token.
    if (!expectedReplayToken || tokenProvider?.() !== expectedReplayToken) return null;
    const replay = await call(path, options);
    if (replay.response.status === 401) onAuthExpired?.(replay.accessToken);
    return replay;
  };

  const execute = async (path: string, options: BackendRequestOptions = {}) => {
    const first = await call(path, options);
    if (first.response.status !== 401) return first;
    const recovered = await recoverUnauthorized(path, options, first.accessToken);
    return recovered ?? first;
  };

  return {
    async request<T>(path: string, options: BackendRequestOptions = {}): Promise<T> {
      const result = await execute(path, options); const { response } = result;
      if (!response.ok) throw await errorFromResponse(response, result.accessToken);
      const text = await response.text(); if (!text) return undefined as T;
      const payload = parseTextAsJson(text);
      if (payload === undefined) {
        throw new BackendApiError(502, '后端返回了无法解析的 JSON', undefined, {
          accessToken: result.accessToken,
        });
      }
      return payload as T;
    },
    async requestVoid(path: string, options: BackendRequestOptions = {}): Promise<void> {
      const result = await execute(path, options); const { response } = result;
      if (!response.ok) throw await errorFromResponse(response, result.accessToken);
    },
    async requestBlob(path: string, options: BackendRequestOptions = {}): Promise<Blob> {
      const result = await execute(path, options); const { response } = result;
      if (!response.ok) throw await errorFromResponse(response, result.accessToken);
      return response.blob();
    },
  };
};
export const idPath = (id: number | string) => encodeURIComponent(String(id));
export const queryString = (params: Record<string, boolean | number | string | null | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null) query.set(key, String(value)); });
  const value = query.toString(); return value ? `?${value}` : '';
};
