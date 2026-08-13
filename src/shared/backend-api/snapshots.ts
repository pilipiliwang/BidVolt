import { idPath, type BackendApiClient } from './client';
import type { BackendId, SnapshotDetail, SnapshotSummary } from './types';

export const createSnapshotsApi = (client: BackendApiClient) => ({
  list: (projectId: BackendId) =>
    client.request<{ items: SnapshotSummary[] }>(`/projects/${idPath(projectId)}/snapshots`),
  get: (projectId: BackendId, snapshotId: BackendId) =>
    client.request<SnapshotDetail>(`/projects/${idPath(projectId)}/snapshots/${idPath(snapshotId)}`),
});
