import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBackendApiClient } from './client';
import {
  normalizeBackendRequestPath,
  normalizeBackendRequestPathname,
  startBackendApiRequestLifecycle,
  subscribeToBackendApiRequests,
  type BackendApiRequestEvent,
} from './request-monitor';

const cleanups: Array<() => void> = [];

function collectEvents() {
  const events: BackendApiRequestEvent[] = [];
  const unsubscribe = subscribeToBackendApiRequests((event) => events.push(event));
  cleanups.push(unsubscribe);
  return { events, unsubscribe };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

describe('backend API request monitor', () => {
  it('normalizes relative diagnostics paths and redacts credential-like query values', () => {
    const path = normalizeBackendRequestPath(
      'https://api.example.test//api/v1/projects/?project_id=7&page=2&access_token=secret#private',
    );

    expect(path).toBe(
      '/api/v1/projects?project_id=7&page=2&access_token=%5BREDACTED%5D',
    );
    expect(normalizeBackendRequestPathname(path)).toBe('/api/v1/projects');
    expect(path).not.toContain('secret');
  });

  it('publishes a one-shot started and terminal lifecycle with deterministic timing', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_042);
    const { events } = collectEvents();

    const lifecycle = startBackendApiRequestLifecycle('GET', '/projects/7?view=overview');
    lifecycle.succeeded();
    lifecycle.failed();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      method: 'GET',
      path: '/projects/7?view=overview',
      pathname: '/projects/7',
      status: 'started',
      finishedAt: null,
      latencyMs: null,
    });
    expect(events[1]).toMatchObject({
      requestId: events[0].requestId,
      sequence: events[0].sequence,
      status: 'succeeded',
      startedAt: '1970-01-01T00:00:01.000Z',
      finishedAt: '1970-01-01T00:00:01.042Z',
      latencyMs: 42,
    });
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it('supports unsubscribe and isolates subscriber errors from API behavior', async () => {
    const throwingCleanup = subscribeToBackendApiRequests(() => {
      throw new Error('diagnostic consumer failed');
    });
    cleanups.push(throwingCleanup);
    const { events, unsubscribe } = collectEvents();
    const client = createBackendApiClient({
      fetchImpl: vi.fn<typeof fetch>().mockImplementation(async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 })),
    });

    await expect(client.request('/projects')).resolves.toEqual({ ok: true });
    expect(events.map((event) => event.status)).toEqual(['started', 'succeeded']);

    unsubscribe();
    await expect(client.request('/projects')).resolves.toEqual({ ok: true });
    expect(events).toHaveLength(2);
  });

  it('never publishes tokens, bodies, response payloads, or raw HTTP errors', async () => {
    const { events } = collectEvents();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: 'response-secret' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'raw-error-secret' }), { status: 400 }));
    const client = createBackendApiClient({
      baseUrl: '/api/v1',
      tokenProvider: () => 'bearer-secret',
      fetchImpl,
    });

    await client.request('/projects?page=1&size=10#ignored', {
      method: 'POST',
      body: { password: 'body-secret' },
    });
    await expect(client.request('/projects/7', { method: 'PATCH' })).rejects.toMatchObject({
      status: 400,
    });

    expect(events.map(({ method, path, pathname, status }) => ({
      method, path, pathname, status,
    }))).toEqual([
      { method: 'POST', path: '/projects?page=1&size=10', pathname: '/projects', status: 'started' },
      { method: 'POST', path: '/projects?page=1&size=10', pathname: '/projects', status: 'succeeded' },
      { method: 'PATCH', path: '/projects/7', pathname: '/projects/7', status: 'started' },
      { method: 'PATCH', path: '/projects/7', pathname: '/projects/7', status: 'failed' },
    ]);
    const serialized = JSON.stringify(events);
    for (const secret of [
      'bearer-secret', 'body-secret', 'response-secret', 'raw-error-secret', 'ignored',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('tracks concurrent calls to the same endpoint independently and preserves counts', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      pending.push(resolve);
    }));
    const { events } = collectEvents();
    const client = createBackendApiClient({ fetchImpl });

    const first = client.request<{ call: number }>('/projects?page=1');
    const second = client.request<{ call: number }>('/projects?page=1');

    expect(events.filter((event) => event.status === 'started')).toHaveLength(2);
    const started = events.filter((event) => event.status === 'started');
    expect(new Set(started.map((event) => event.requestId)).size).toBe(2);
    expect(new Set(started.map((event) => event.sequence)).size).toBe(2);

    pending[1](new Response(JSON.stringify({ call: 2 }), { status: 200 }));
    await expect(second).resolves.toEqual({ call: 2 });
    pending[0](new Response(JSON.stringify({ call: 1 }), { status: 200 }));
    await expect(first).resolves.toEqual({ call: 1 });

    expect(events).toHaveLength(4);
    for (const requestId of new Set(events.map((event) => event.requestId))) {
      expect(events.filter((event) => event.requestId === requestId)).toHaveLength(2);
    }
  });

  it('monitors JSON, void, and blob client methods', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
    const { events } = collectEvents();
    const client = createBackendApiClient({ fetchImpl });

    await client.request('/json');
    await client.requestVoid('/void', { method: 'DELETE' });
    await client.requestBlob('/blob');

    expect(events.filter((event) => event.status === 'started')).toHaveLength(3);
    expect(events.filter((event) => event.status === 'succeeded')).toHaveLength(3);
    expect(events.filter((event) => event.status === 'failed')).toHaveLength(0);
  });

  it('counts a 401 refresh and replay as one logical client request', async () => {
    let accessToken = 'expired';
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (new Headers(init?.headers).get('Authorization') === 'Bearer expired') {
        return new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const refreshHandler = vi.fn(async () => {
      accessToken = 'fresh';
      return true;
    });
    const { events } = collectEvents();
    const client = createBackendApiClient({
      fetchImpl,
      refreshHandler,
      tokenProvider: () => accessToken,
    });

    await expect(client.request('/projects')).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.status)).toEqual(['started', 'succeeded']);
    expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
  });
});
