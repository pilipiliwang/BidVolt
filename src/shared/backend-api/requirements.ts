import { idPath, queryString, type BackendApiClient } from './client';
import type {
  BackendId, ConfirmRequirementRequest, CorrectRequirementRequest, Requirement,
} from './types';

export const createRequirementsApi = (client: BackendApiClient) => ({
  list: (projectId: BackendId) =>
    client.request<Requirement[]>(`/requirements${queryString({ project_id: projectId })}`),
  get: (requirementId: BackendId) => client.request<Requirement>(`/requirements/${idPath(requirementId)}`),
  upsert: (projectId: BackendId, requirements: Array<Record<string, unknown>>) =>
    client.request<{ created: number[]; count: number }>(`/projects/${idPath(projectId)}/requirements/upsert`, {
      method: 'POST', body: { requirements },
    }),
  confirm: (
    projectId: BackendId,
    requirementId: BackendId,
    body: ConfirmRequirementRequest,
  ) => client.request<Requirement>(
    `/projects/${idPath(projectId)}/requirements/${idPath(requirementId)}/confirm`,
    { method: 'PUT', body },
  ),
  correct: (
    projectId: BackendId,
    requirementId: BackendId,
    body: CorrectRequirementRequest,
  ) => client.request<Requirement>(
    `/projects/${idPath(projectId)}/requirements/${idPath(requirementId)}/correct`,
    { method: 'PUT', body },
  ),
});
