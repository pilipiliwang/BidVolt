import { idPath, type BackendApiClient } from './client';
import type { BackendId, JsonObject } from './types';

export type EditorSession = {
  session_id: number;
  status: number;
  base_version_no: number;
  completed_version_no?: number | null;
  lease_token?: string;
  lease_expires_at?: string | null;
  last_activity_at?: string | null;
  created_at?: string | null;
  checkpoint?: JsonObject | null;
  content?: JsonObject;
  deliverable_id?: number;
};

export const createEditorApi = (client: BackendApiClient) => ({
  createSession: (deliverableId: BackendId) =>
    client.request<EditorSession>(`/deliverables/${idPath(deliverableId)}/editor-sessions`, { method: 'POST' }),
  list: (deliverableId: BackendId) =>
    client.request<{ items: EditorSession[] }>(`/deliverables/${idPath(deliverableId)}/editor-sessions`),
  get: (deliverableId: BackendId, sessionId: BackendId) =>
    client.request<EditorSession>(
      `/deliverables/${idPath(deliverableId)}/editor-sessions/${idPath(sessionId)}`,
    ),
  checkpoint: (deliverableId: BackendId, sessionId: BackendId, body: {
    lease_token: string; content: JsonObject;
  }) => client.request<{ session_id: number; checkpoint_saved: boolean; lease_expires_at: string }>(
    `/deliverables/${idPath(deliverableId)}/editor-sessions/${idPath(sessionId)}/checkpoint`,
    { method: 'PUT', body },
  ),
  complete: (deliverableId: BackendId, sessionId: BackendId, body: {
    lease_token: string; content: JsonObject; expected_version_no?: number; idempotency_key?: string;
  }) => client.request<{ session_id: number; version_no: number; status: number }>(
    `/deliverables/${idPath(deliverableId)}/editor-sessions/${idPath(sessionId)}/complete`,
    { method: 'POST', body },
  ),
  cancel: (deliverableId: BackendId, sessionId: BackendId, leaseToken: string) =>
    client.request<{ session_id: number; status: number }>(
      `/deliverables/${idPath(deliverableId)}/editor-sessions/${idPath(sessionId)}/cancel`,
      { method: 'POST', body: { lease_token: leaseToken } },
    ),
});
