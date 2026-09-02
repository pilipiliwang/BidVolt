import { idPath, queryString, type BackendApiClient } from './client';
import type { BackendId, Page, ProjectResponse, ProjectWrite } from './types';

type ProjectListFilters = { status_filter?: number; q?: string };
type ProjectListParams = ProjectListFilters & { page?: number; size?: number };

export const createProjectsApi = (client: BackendApiClient) => {
  const list = (params: ProjectListParams = {}) =>
    client.request<Page<ProjectResponse>>(`/projects${queryString(params)}`);

  const listAll = async (params: ProjectListFilters = {}, pageSize = 100) => {
    const items: ProjectResponse[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (items.length < total) {
      const response = await list({ ...params, page, size: pageSize });
      total = Math.max(0, response.total);
      items.push(...response.items);
      if (response.items.length === 0) break;
      page += 1;
    }

    return items;
  };

  return {
    list,
    listAll,
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
  };
};
