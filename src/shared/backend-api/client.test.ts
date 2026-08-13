import { describe, expect, it, vi } from 'vitest';

import { BackendApiError, createBackendApiClient } from './client';

describe('backend API client', () => {
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

  it('returns binary downloads as Blob', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const client = createBackendApiClient({ fetchImpl });
    const blob = await client.requestBlob('/files/1/download');
    expect(blob.size).toBe(3);
  });
});
