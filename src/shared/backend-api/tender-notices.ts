import { idPath, type BackendApiClient } from './client';
import type { BackendId, TenderNoticeImportJob } from './types';

export const createTenderNoticesApi = (client: BackendApiClient) => ({
  importFromUrl: (projectId: BackendId, url: string) =>
    client.request<TenderNoticeImportJob>(
      `/projects/${idPath(projectId)}/tender-notices/import-url`,
      { method: 'POST', body: { url } },
    ),
  list: (projectId: BackendId) =>
    client.request<{ items: TenderNoticeImportJob[] }>(
      `/projects/${idPath(projectId)}/tender-notices`,
    ),
  get: (projectId: BackendId, noticeId: BackendId) =>
    client.request<TenderNoticeImportJob>(
      `/projects/${idPath(projectId)}/tender-notices/${idPath(noticeId)}`,
    ),
  /** @deprecated Use list. Kept while page call sites migrate from the old importer naming. */
  listImports: (projectId: BackendId) =>
    client.request<{ items: TenderNoticeImportJob[] }>(
      `/projects/${idPath(projectId)}/tender-notices`,
    ),
  /** @deprecated Use get. */
  getImport: (projectId: BackendId, noticeId: BackendId) =>
    client.request<TenderNoticeImportJob>(
      `/projects/${idPath(projectId)}/tender-notices/${idPath(noticeId)}`,
    ),
});
