import { idPath, queryString, type BackendApiClient } from './client';
import type { BackendId, Page, ProjectResponse, ProjectWrite } from './types';

export const createProjectsApi = (client: BackendApiClient) => ({
  list: (params: { page?: number; size?: number; status_filter?: number } = {}) =>
    client.request<Page<ProjectResponse>>(`/projects${queryString(params)}`),
  get: (projectId: BackendId) => client.request<ProjectResponse>(`/projects/${idPath(projectId)}`),
  create: (body: ProjectWrite & { name: string }) =>
    client.request<ProjectResponse>('/projects', { method: 'POST', body }),
  update: (projectId: BackendId, body: ProjectWrite) =>
    client.request<ProjectResponse>(`/projects/${idPath(projectId)}`, { method: 'PATCH', body }),
  archive: (projectId: BackendId) =>
    client.requestVoid(`/projects/${idPath(projectId)}/archive`, { method: 'POST' }),
  updateStatus: (projectId: BackendId, status: number) =>
    client.request<ProjectResponse>(`/projects/${idPath(projectId)}/status`, {
      method: 'PUT', body: { status },
    }),
});
