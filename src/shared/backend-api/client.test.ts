import { describe, expect, it, vi } from 'vitest';

import { BackendApiError, createBackendApiClient } from './client';

describe('backend API client', () => {
  it('preserves caller cancellation instead of reporting the backend as unreachable', async () => {
    const abortError = new DOMException('request cancelled', 'AbortError');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abortError);
    const client = createBackendApiClient({ fetchImpl });

    const error = await client.request('/projects').catch((cause: unknown) => cause);

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(BackendApiError);
  });

  it('returns raw JSON and sends bearer plus JSON body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ project_id: 7 }), { status: 201 }),
    );
    const client = createBackendApiClient({
      baseUrl: 'https://api.example.test/api/v1/',
      tokenProvider: () => 'access-token',
      fetchImpl,
    });

    await expect(client.request<{ project_id: number }>('/projects', {
      method: 'POST', body: { name: '海上平台采购' },
    })).resolves.toEqual({ project_id: 7 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/v1/projects');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ name: '海上平台采购' }));
  });

  it('accepts an empty 204 response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createBackendApiClient({ baseUrl: '/api/v1', fetchImpl });
    await expect(client.requestVoid('/projects/2/archive', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('surfaces FastAPI string detail', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: '邮箱或密码错误' }), { status: 401 }),
    );
    const client = createBackendApiClient({ fetchImpl });

    const error = await client.request('/auth/login', { method: 'POST', body: {} }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BackendApiError);
    expect(error).toMatchObject({ status: 401, message: '邮箱或密码错误', retryable: false });
  });

  it('joins FastAPI validation detail messages', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: [{ loc: ['body', 'name'], msg: 'Field required', type: 'missing' }] }), {
        status: 422,
      }),
    );
    const client = createBackendApiClient({ fetchImpl });

    await expect(client.request('/projects')).rejects.toMatchObject({
      status: 422, message: 'Field required',
    });
  });

  it('surfaces the message from a structured FastAPI detail', async () => {
    const detail = { code: 'FILE_TYPE_NOT_ALLOWED', message: '不支持该文件类型' };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail }), { status: 400 }),
    );
    const client = createBackendApiClient({ fetchImpl });

    await expect(client.request('/files/upload')).rejects.toMatchObject({
      detail,
      message: '不支持该文件类型',
      status: 400,
    });
  });

  it('returns binary downloads as Blob', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const client = createBackendApiClient({ fetchImpl });
    const blob = await client.requestBlob('/files/1/download');
    expect(blob.size).toBe(3);
  });

  it('returns an unconsumed streaming response with bearer auth and one 401 refresh replay', async () => {
    let accessToken = 'expired-access';
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization');
      if (authorization === 'Bearer expired-access') {
        return new Response(JSON.stringify({ detail: '令牌已过期' }), { status: 401 });
      }
      return new Response('event: snapshot\ndata: {}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    const refreshHandler = vi.fn(async () => {
      accessToken = 'fresh-access';
      return true;
    });
    const client = createBackendApiClient({
      baseUrl: '/api/v1',
      fetchImpl,
      refreshHandler,
      tokenProvider: () => accessToken,
    });

    const response = await client.requestResponse('/tasks/5/stream', {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });

    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(await response.text()).toContain('event: snapshot');
    expect(refreshHandler).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization')))
      .toEqual(['Bearer expired-access', 'Bearer fresh-access']);
    expect(fetchImpl.mock.calls[1][1]?.signal).toBe(controller.signal);
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get('Accept')).toBe('text/event-stream');
  });

  it('single-flights concurrent 401 refreshes and replays both requests with the new token', async () => {
    let accessToken = 'expired-access';
    let resolveRefresh: (refreshed: boolean) => void = () => undefined;
    const refreshHandler = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveRefresh = resolve;
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization');
      if (authorization === 'Bearer expired-access') {
        return new Response(JSON.stringify({ detail: '令牌无效或已过期' }), { status: 401 });
      }
      return new Response(JSON.stringify({ authorization }), { status: 200 });
    });
    const client = createBackendApiClient({
      baseUrl: '/api/v1',
      fetchImpl,
      refreshHandler,
      tokenProvider: () => accessToken,
    });

    const first = client.request<{ authorization: string }>('/projects');
    const second = client.request<{ authorization: string }>('/enterprise/assets');
    await vi.waitFor(() => expect(refreshHandler).toHaveBeenCalledOnce());
    accessToken = 'fresh-access';
    resolveRefresh(true);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { authorization: 'Bearer fresh-access' },
      { authorization: 'Bearer fresh-access' },
    ]);
    expect(refreshHandler).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('replays at most once and never refreshes an auth endpoint marked to skip', async () => {
    let accessToken = 'expired-access';
    const refreshHandler = vi.fn(async () => {
      accessToken = 'fresh-access';
      return true;
    });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify({ detail: '未认证' }), { status: 401 }));
    const client = createBackendApiClient({
      fetchImpl,
      refreshHandler,
      tokenProvider: () => accessToken,
    });

    await expect(client.request('/projects')).rejects.toMatchObject({ status: 401 });
    expect(refreshHandler).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fetchImpl.mockClear();
    refreshHandler.mockClear();
    await expect(client.request('/auth/login', {
      method: 'POST', body: {}, skipAuthRefresh: true,
    })).rejects.toMatchObject({ status: 401 });
    expect(refreshHandler).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses an already-rotated token for a late 401 without refreshing again', async () => {
    let accessToken = 'expired-access';
    let releaseOldRequest: (() => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization');
      if (String(url).endsWith('/late') && authorization === 'Bearer expired-access') {
        await new Promise<void>((resolve) => { releaseOldRequest = resolve; });
      }
      if (authorization === 'Bearer expired-access') {
        return new Response(JSON.stringify({ detail: '未认证' }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const refreshHandler = vi.fn(async () => {
      accessToken = 'fresh-access';
      return true;
    });
    const client = createBackendApiClient({ fetchImpl, refreshHandler, tokenProvider: () => accessToken });

    const late = client.request('/late');
    await vi.waitFor(() => expect(releaseOldRequest).toBeTypeOf('function'));
    await expect(client.request('/first')).resolves.toEqual({ ok: true });
    releaseOldRequest?.();
    await expect(late).resolves.toEqual({ ok: true });

    expect(refreshHandler).toHaveBeenCalledOnce();
  });

  it('does not replay an old request after the browser switched to another account', async () => {
    let accessToken = 'enterprise-a-access';
    let releaseRequest: (() => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization');
      if (authorization === 'Bearer enterprise-a-access') {
        await new Promise<void>((resolve) => { releaseRequest = resolve; });
        return new Response(JSON.stringify({ detail: '未认证' }), { status: 401 });
      }
      return new Response(JSON.stringify({ tenant: 'b' }), { status: 200 });
    });
    const refreshHandler = vi.fn(async () => true);
    const client = createBackendApiClient({ fetchImpl, refreshHandler, tokenProvider: () => accessToken });

    const oldRequest = client.request('/projects/enterprise-a');
    await vi.waitFor(() => expect(releaseRequest).toBeTypeOf('function'));
    accessToken = 'enterprise-b-access';
    releaseRequest?.();

    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(refreshHandler).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not replay when the account switches after refresh resolves', async () => {
    let accessToken = 'enterprise-a-access';
    let releaseRefresh: (refreshed: boolean) => void = () => undefined;
    const refreshHandler = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseRefresh = resolve;
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: '未认证' }), { status: 401 }),
    );
    const tokenProvider = vi.fn(() => {
      if (accessToken !== 'enterprise-a-refreshed') return accessToken;
      const refreshedAccessToken = accessToken;
      accessToken = 'enterprise-b-access';
      return refreshedAccessToken;
    });
    const client = createBackendApiClient({ fetchImpl, refreshHandler, tokenProvider });

    const oldRequest = client.request('/projects/enterprise-a');
    await vi.waitFor(() => expect(refreshHandler).toHaveBeenCalledOnce());
    accessToken = 'enterprise-a-refreshed';
    releaseRefresh(true);

    await expect(oldRequest).rejects.toMatchObject({
      accessToken: 'enterprise-a-access',
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
