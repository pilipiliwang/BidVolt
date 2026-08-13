import type { BackendApiClient } from './client';
import type { MeResponse, TokenPair } from './types';

export const createAuthApi = (client: BackendApiClient) => ({
  register: (body: { email: string; password: string; enterprise_name: string }) =>
    client.request<TokenPair>('/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    client.request<TokenPair>('/auth/login', { method: 'POST', body }),
  refresh: (refreshToken: string) =>
    client.request<TokenPair>('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }),
  logout: (refreshToken: string) =>
    client.requestVoid('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } }),
  me: () => client.request<MeResponse>('/auth/me'),
});
