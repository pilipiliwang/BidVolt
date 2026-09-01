import { idPath, type BackendApiClient } from './client';
import type { BackendId, FinalCheckResult, ProjectExportJob } from './types';

export const createProjectExportsApi = (client: BackendApiClient) => ({
  check: (projectId: BackendId) =>
    client.request<FinalCheckResult>(`/projects/${idPath(projectId)}/check`, { method: 'POST' }),
  getCheck: (projectId: BackendId, checkId: BackendId) =>
    client.request<FinalCheckResult>(
      `/projects/${idPath(projectId)}/check/${idPath(checkId)}`,
    ),
  create: (projectId: BackendId, body: {
    formats?: string[]; with_manifest?: boolean;
  } = {}) => client.request<ProjectExportJob>(`/projects/${idPath(projectId)}/export`, {
    method: 'POST', body,
  }),
  status: (projectId: BackendId, jobId: BackendId) =>
    client.request<ProjectExportJob>(
      `/projects/${idPath(projectId)}/export/${idPath(jobId)}`,
    ),
  deliveryPackage: (projectId: BackendId) =>
    client.requestBlob(`/projects/${idPath(projectId)}/delivery-package`),
});
