import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBackendApiClient } from './client';
import { consumeAgentRunStream } from './agent-stream';
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
    lifecycle.expectedEmpty();
    lifecycle.failed('response');
    lifecycle.cancelled();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      method: 'GET',
      path: '/projects/7?view=overview',
      pathname: '/projects/7',
      status: 'started',
      finishedAt: null,
      latencyMs: null,
      failureKind: null,
    });
    expect(events[1]).toMatchObject({
      requestId: events[0].requestId,
      sequence: events[0].sequence,
      status: 'succeeded',
      startedAt: '1970-01-01T00:00:01.000Z',
      finishedAt: '1970-01-01T00:00:01.042Z',
      latencyMs: 42,
      failureKind: null,
    });
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it('classifies transport failures separately from HTTP response failures', async () => {
    const { events } = collectEvents();
    const client = createBackendApiClient({
      fetchImpl: vi.fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'temporarily unavailable' }), {
          status: 503,
        })),
    });

    await expect(client.request('/projects')).rejects.toMatchObject({ status: 0 });
    await expect(client.request('/enterprise/assets')).rejects.toMatchObject({ status: 503 });

    expect(events.filter((event) => event.finishedAt)).toMatchObject([
      { status: 'failed', failureKind: 'network' },
      { status: 'failed', failureKind: 'response' },
    ]);
  });

  it('publishes an aborted fetch as cancelled without leaking the abort as a network failure', async () => {
    const abortError = new DOMException('request cancelled', 'AbortError');
    const { events } = collectEvents();
    const client = createBackendApiClient({
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(abortError),
    });

    const error = await client.request('/projects').catch((cause: unknown) => cause);

    expect(error).toBe(abortError);
    expect(events).toMatchObject([
      { status: 'started', failureKind: null },
      { status: 'cancelled', failureKind: null },
    ]);
  });

  it('publishes the exact not-reviewed score response as an expected empty state', async () => {
    const { events } = collectEvents();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: '  尚未评标  ' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: '项目不存在' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: '尚未评标' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: '尚未评标' }), { status: 500 }));
    const client = createBackendApiClient({ fetchImpl });

    await expect(client.request('/projects/7/scores')).rejects.toMatchObject({ status: 404 });
    await expect(client.request('/projects/8/scores')).rejects.toMatchObject({ status: 404 });
    await expect(client.request('/projects/7/reviews')).rejects.toMatchObject({ status: 404 });
    await expect(client.request('/projects/7/scores')).rejects.toMatchObject({ status: 500 });

    expect(events.filter((event) => event.finishedAt).map((event) => event.status)).toEqual([
      'expected-empty',
      'failed',
      'failed',
      'failed',
    ]);
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

  it('monitors JSON, void, blob, and streaming-response client methods', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))
      .mockResolvedValueOnce(new Response('event: snapshot\ndata: {}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    const { events } = collectEvents();
    const client = createBackendApiClient({ fetchImpl });

    await client.request('/json');
    await client.requestVoid('/void', { method: 'DELETE' });
    await client.requestBlob('/blob');
    await client.requestResponse('/tasks/5/stream', { headers: { Accept: 'text/event-stream' } });

    expect(events.filter((event) => event.status === 'started')).toHaveLength(4);
    expect(events.filter((event) => event.status === 'succeeded')).toHaveLength(4);
    expect(events.filter((event) => event.status === 'failed')).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({
      path: '/tasks/5/stream',
      status: 'succeeded',
    });
  });

  it('keeps a streaming request open until a valid Agent end event is consumed', async () => {
    const encoder = new TextEncoder();
    let finishStream: (() => void) | undefined;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: message\ndata: {"seq":1,"kind":"service","content":"生成中"}\n\n',
        ));
        finishStream = () => {
          controller.enqueue(encoder.encode(
            'event: end\ndata: {"status":3,"session_id":"s1","outcome":"complete","reason":null,"action_list":[],"error":null}\n\n',
          ));
          controller.close();
        };
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const client = createBackendApiClient({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    const { events } = collectEvents();
    const onMessage = vi.fn();

    const stream = client.requestStream(
      '/projects/7/agent-run/31/stream?since=0',
      { headers: { Accept: 'text/event-stream' } },
      (streamResponse) => consumeAgentRunStream(streamResponse, { onMessage }),
    );

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledOnce());
    expect(events.map((event) => event.status)).toEqual(['started']);

    finishStream?.();
    await expect(stream).resolves.toMatchObject({ type: 'end', status: 3 });
    expect(events.map((event) => event.status)).toEqual(['started', 'succeeded']);
  });

  it('marks an Agent stream protocol disconnect as failed after successful headers', async () => {
    const response = new Response(
      'event: message\ndata: {"seq":1,"kind":"service","content":"生成中"}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
    const client = createBackendApiClient({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    const { events } = collectEvents();

    await expect(client.requestStream(
      '/projects/7/agent-run/31/stream?since=0',
      { headers: { Accept: 'text/event-stream' } },
      (streamResponse) => consumeAgentRunStream(streamResponse, { onMessage: vi.fn() }),
    )).rejects.toThrow(/end/);

    expect(events.map((event) => event.status)).toEqual(['started', 'failed']);
    expect(events.at(-1)?.failureKind).toBe('response');
  });

  it('preserves AbortError semantics when a streaming consumer is cancelled', async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream<Uint8Array>({
      start() {
        // Keep the connection open until the request signal cancels the reader.
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const client = createBackendApiClient({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
    });
    const { events } = collectEvents();
    const stream = client.requestStream(
      '/projects/7/agent-run/31/stream?since=0',
      { headers: { Accept: 'text/event-stream' }, signal: controller.signal },
      (streamResponse) => consumeAgentRunStream(streamResponse, {
        signal: controller.signal,
        onMessage: vi.fn(),
      }),
    );

    await vi.waitFor(() => expect(events).toHaveLength(1));
    controller.abort();

    await expect(stream).rejects.toMatchObject({ name: 'AbortError' });
    expect(events.map((event) => event.status)).toEqual(['started', 'cancelled']);
    expect(events.at(-1)?.failureKind).toBeNull();
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
