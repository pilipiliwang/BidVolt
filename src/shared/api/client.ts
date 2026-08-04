import { z } from 'zod';

import { ApiError, apiErrorBodySchema } from './errors';
import { createApiSuccessSchema } from './schema';

type TokenProvider = () => string | null | undefined;

export type ApiRequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown | FormData;
  headers?: HeadersInit;
  idempotencyKey?: string;
  signal?: AbortSignal;
  schema: z.ZodType<T>;
};

export type ApiClient = {
  request<T>(path: string, options: ApiRequestOptions<T>): Promise<T>;
};

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

export const createApiClient = ({
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  tokenProvider,
  fetchImpl = fetch,
}: {
  baseUrl?: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
} = {}): ApiClient => ({
  async request<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
    const headers = new Headers(options.headers);
    const token = tokenProvider?.();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.idempotencyKey) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }

    let body: BodyInit | undefined;
    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
        method: options.method ?? 'GET',
        body,
        credentials: 'include',
        headers,
        signal: options.signal,
      });
    } catch (cause) {
      throw new ApiError(
        0,
        {
          code: 'NETWORK_ERROR',
          message: '网络连接失败，请稍后重试',
          retryable: true,
        },
        { cause },
      );
    }

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      const parsedError = apiErrorBodySchema.safeParse(payload);
      throw new ApiError(
        response.status,
        parsedError.success
          ? parsedError.data
          : {
              code: 'HTTP_ERROR',
              message: response.statusText || '请求失败',
              retryable: response.status >= 500,
            },
      );
    }

    const parsedEnvelope = createApiSuccessSchema(options.schema).safeParse(payload);
    if (!parsedEnvelope.success) {
      throw new ApiError(502, {
        code: 'CONTRACT_INVALID_RESPONSE',
        message: '服务端响应不符合 Contract v0.2',
        details: { issues: parsedEnvelope.error.issues },
        retryable: false,
      });
    }

    return parsedEnvelope.data.data;
  },
});

export const apiClient = createApiClient();
