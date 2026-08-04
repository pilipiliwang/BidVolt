import { z } from 'zod';

import { apiClient, type ApiClient } from './client';
import { createPageSchema, entityIdSchema, isoDateTimeSchema } from './schema';

export const projectSnapshotManifestSchema = z
  .object({
    project_material_revision_ids: z.array(entityIdSchema),
    requirement_revision_ids: z.array(entityIdSchema),
    enterprise_asset_revision_ids: z.array(entityIdSchema),
    deliverable_version_ids: z.array(entityIdSchema),
    quote_sample_snapshot_id: entityIdSchema.nullable(),
  })
  .strict();

export const projectSnapshotSchema = z
  .object({
    snapshot_id: entityIdSchema,
    project_id: entityIdSchema,
    status: z.literal('frozen'),
    reason: z.enum(['task', 'review', 'check', 'export', 'manual']),
    manifest: projectSnapshotManifestSchema,
    content_hash: z.string().regex(/^[a-f0-9]{64}$/i),
    created_at: isoDateTimeSchema,
  })
  .strict();

export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;

export const createProjectSnapshotsApi = (client: ApiClient = apiClient) => ({
  list: (projectId: string, query: { page?: number; size?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, String(value));
    });
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return client.request(`/projects/${projectId}/snapshots${suffix}`, {
      schema: createPageSchema(projectSnapshotSchema),
    });
  },

  get: (projectId: string, snapshotId: string) =>
    client.request(`/projects/${projectId}/snapshots/${snapshotId}`, {
      schema: projectSnapshotSchema,
    }),
});

export const projectSnapshotsApi = createProjectSnapshotsApi();
