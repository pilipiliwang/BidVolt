import { idPath, queryString, type BackendApiClient } from './client';
import type { BackendId, Requirement } from './types';

export const createRequirementsApi = (client: BackendApiClient) => ({
  list: (projectId: BackendId) =>
    client.request<Requirement[]>(`/requirements${queryString({ project_id: projectId })}`),
  get: (requirementId: BackendId) => client.request<Requirement>(`/requirements/${idPath(requirementId)}`),
  upsert: (projectId: BackendId, requirements: Array<Record<string, unknown>>) =>
    client.request<{ created: number[]; count: number }>(`/projects/${idPath(projectId)}/requirements/upsert`, {
      method: 'POST', body: { requirements },
    }),
});
