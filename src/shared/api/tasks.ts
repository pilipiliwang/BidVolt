import { z } from 'zod';

import { apiClient, type ApiClient } from './client';
import { entityIdSchema, isoDateTimeSchema } from './schema';
import { taskStatusSchema } from './task-events';

export const taskSchema = z
  .object({
    task_id: entityIdSchema,
    project_id: entityIdSchema,
    project_snapshot_id: entityIdSchema.nullable(),
    phase: z.string().min(1).max(64),
    status: taskStatusSchema,
    percent: z.number().int().min(0).max(100).nullable(),
    public_message: z.string().max(500),
    error_code: z.string().max(100).nullable(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict();

export type Task = z.infer<typeof taskSchema>;

export const createTasksApi = (client: ApiClient = apiClient) => ({
  get: (taskId: string) => client.request(`/tasks/${taskId}`, { schema: taskSchema }),
  streamPath: (taskId: string) => `/api/v1/tasks/${encodeURIComponent(taskId)}/stream`,
});

export const tasksApi = createTasksApi();
