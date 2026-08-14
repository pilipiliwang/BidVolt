import { idPath, type BackendApiClient } from './client';
import type { BackendId, TenderNoticeImportJob } from './types';

export const createTenderNoticesApi = (client: BackendApiClient) => ({
  importFromUrl: (projectId: BackendId, url: string) =>
    client.request<TenderNoticeImportJob>(
      `/projects/${idPath(projectId)}/tender-notices/import-url`,
      { method: 'POST', body: { url } },
    ),
  listImports: (projectId: BackendId) =>
    client.request<{ items: TenderNoticeImportJob[] }>(
      `/projects/${idPath(projectId)}/tender-notices/imports`,
    ),
  getImport: (projectId: BackendId, importId: BackendId) =>
    client.request<TenderNoticeImportJob>(
      `/projects/${idPath(projectId)}/tender-notices/imports/${idPath(importId)}`,
    ),
});
