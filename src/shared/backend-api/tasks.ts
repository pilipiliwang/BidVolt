import { idPath, queryString, type BackendApiClient } from './client';
import type { BackendId, BackendTask, CreatedTask } from './types';

export const createTasksApi = (client: BackendApiClient) => ({
  list: (projectId: BackendId, statusFilter?: number) =>
    client.request<{ items: BackendTask[] }>(
      `/projects/${idPath(projectId)}/tasks${queryString({ status_filter: statusFilter })}`,
    ),
  create: (projectId: BackendId, body: {
    task_type: string; idempotency_key: string; payload?: Record<string, unknown>;
  }) => client.request<CreatedTask>(`/projects/${idPath(projectId)}/tasks`, { method: 'POST', body }),
  get: (taskId: BackendId) => client.request<BackendTask>(`/tasks/${idPath(taskId)}`),
  interrupt: (projectId: BackendId, taskId: BackendId) =>
    client.request<{ task_id: number; generation: number }>(
      `/projects/${idPath(projectId)}/tasks/${idPath(taskId)}/interrupt`, { method: 'POST' },
    ),
  streamUrl: (taskId: BackendId, baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1') =>
    `${baseUrl.replace(/\/+$/, '')}/tasks/${idPath(taskId)}/stream`,
});
