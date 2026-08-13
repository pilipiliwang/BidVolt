import { idPath, type BackendApiClient } from './client';
import type {
  BackendId, EnterpriseAsset, EnterpriseAssetDetail, EnterpriseAssetRevision, EnterpriseCategory,
  EnterpriseFact, EnterpriseIngestion,
} from './types';

export const createEnterpriseApi = (client: BackendApiClient) => ({
  listCategories: () => client.request<EnterpriseCategory[]>('/enterprise/categories'),
  createCategory: (body: { name: string; parent_id?: BackendId | null }) =>
    client.request<EnterpriseCategory>('/enterprise/categories', { method: 'POST', body }),
  listAssets: () => client.request<EnterpriseAsset[]>('/enterprise/assets'),
  getAsset: (assetId: BackendId) =>
    client.request<EnterpriseAssetDetail>(`/enterprise/assets/${idPath(assetId)}`),
  updateCategory: (assetId: BackendId, categoryId: BackendId) =>
    client.request<{ asset_id: number; category_id: number }>(`/enterprise/assets/${idPath(assetId)}/category`, {
      method: 'PATCH', body: { category_id: categoryId },
    }),
  ingest: (assetIds: BackendId[]) =>
    client.request<Record<string, unknown>>('/enterprise/ingest', { method: 'POST', body: { asset_ids: assetIds } }),
  listRevisions: (assetId: BackendId) =>
    client.request<{ items: EnterpriseAssetRevision[] }>(`/enterprise/assets/${idPath(assetId)}/revisions`),
  listFacts: (assetId: BackendId) =>
    client.request<{ items: EnterpriseFact[] }>(`/enterprise/assets/${idPath(assetId)}/facts`),
  updateFact: (factId: BackendId, body: { fact_value?: unknown; confirmed?: boolean; note?: string }) =>
    client.request<Record<string, unknown>>(`/enterprise/facts/${idPath(factId)}`, { method: 'PUT', body }),
  listIngestions: () => client.request<{ items: EnterpriseIngestion[] }>('/enterprise/ingest'),
  getIngestion: (taskId: BackendId) =>
    client.request<Record<string, unknown>>(`/enterprise/ingest/${idPath(taskId)}`),
});
