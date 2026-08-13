export type TokenProvider = () => string | null | undefined;
export type BackendRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown | FormData;
  headers?: HeadersInit; signal?: AbortSignal;
};
export class BackendApiError extends Error {
  readonly status: number; readonly detail: unknown; readonly retryable: boolean;
  constructor(status: number, message: string, detail?: unknown, options?: ErrorOptions) {
    super(message, options); this.name = 'BackendApiError'; this.status = status; this.detail = detail;
    this.retryable = status === 0 || status >= 500;
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
  if (Array.isArray(detail)) {
    const messages = detail.map((entry) => isRecord(entry) && typeof entry.msg === 'string' ? entry.msg : null)
      .filter((entry): entry is string => entry !== null);
    if (messages.length > 0) return messages.join('；');
  }
  return '后端请求失败';
};
const errorFromResponse = async (response: Response): Promise<BackendApiError> => {
  const payload = parseTextAsJson(await response.text());
  const detail = isRecord(payload) && 'detail' in payload ? payload.detail : payload;
  return new BackendApiError(response.status, validationMessage(detail) || response.statusText, detail);
};
const buildRequest = (options: BackendRequestOptions, tokenProvider?: TokenProvider): RequestInit => {
  const headers = new Headers(options.headers); const token = tokenProvider?.();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(options.body); }
  return { method: options.method ?? 'GET', headers, body, signal: options.signal };
};
export const createBackendApiClient = ({
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1', tokenProvider, fetchImpl = fetch,
}: { baseUrl?: string; tokenProvider?: TokenProvider; fetchImpl?: typeof fetch } = {}): BackendApiClient => {
  const call = async (path: string, options: BackendRequestOptions = {}) => {
    try { return await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, buildRequest(options, tokenProvider)); }
    catch (cause) { throw new BackendApiError(0, '无法连接后端服务', cause, { cause }); }
  };
  return {
    async request<T>(path: string, options: BackendRequestOptions = {}): Promise<T> {
      const response = await call(path, options); if (!response.ok) throw await errorFromResponse(response);
      const text = await response.text(); if (!text) return undefined as T;
      const payload = parseTextAsJson(text);
      if (payload === undefined) throw new BackendApiError(502, '后端返回了无法解析的 JSON');
      return payload as T;
    },
    async requestVoid(path: string, options: BackendRequestOptions = {}): Promise<void> {
      const response = await call(path, options); if (!response.ok) throw await errorFromResponse(response);
    },
    async requestBlob(path: string, options: BackendRequestOptions = {}): Promise<Blob> {
      const response = await call(path, options); if (!response.ok) throw await errorFromResponse(response);
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
