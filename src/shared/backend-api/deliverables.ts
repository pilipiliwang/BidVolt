import { idPath, queryString, type BackendApiClient } from './client';
import type { BackendId, Deliverable, DeliverableContent, DeliverableVersion, JsonObject } from './types';

export const createDeliverablesApi = (client: BackendApiClient) => ({
  list: (projectId: BackendId) =>
    client.request<Deliverable[]>(`/deliverables${queryString({ project_id: projectId })}`),
  get: (deliverableId: BackendId) => client.request<Deliverable>(`/deliverables/${idPath(deliverableId)}`),
  create: (body: { project_id: BackendId; deliverable_type: number; title: string }) =>
    client.request<Deliverable>('/deliverables', { method: 'POST', body }),
  listVersions: (deliverableId: BackendId) =>
    client.request<DeliverableVersion[]>(`/deliverables/${idPath(deliverableId)}/versions`),
  getVersion: (deliverableId: BackendId, versionNo: BackendId) =>
    client.request<DeliverableContent>(`/deliverables/${idPath(deliverableId)}/versions/${idPath(versionNo)}`),
  getContent: (deliverableId: BackendId) =>
    client.request<DeliverableContent>(`/deliverables/${idPath(deliverableId)}/content`),
  saveContent: (deliverableId: BackendId, body: {
    content: JsonObject; expected_version_no?: number; idempotency_key?: string;
  }) => client.request<{ version_no: number; version_id: number; milestone: boolean }>(
    `/deliverables/${idPath(deliverableId)}/content`, { method: 'PUT', body },
  ),
  downloadVersion: (deliverableId: BackendId, versionNo: BackendId) =>
    client.requestBlob(`/deliverables/${idPath(deliverableId)}/versions/${idPath(versionNo)}/download`),
});
