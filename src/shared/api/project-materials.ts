import { z } from 'zod';

import { apiClient, type ApiClient } from './client';
import {
  createPageSchema,
  entityIdSchema,
  evidenceRefSchema,
  isoDateTimeSchema,
} from './schema';

export const projectMaterialEventTypeSchema = z.enum([
  'initial',
  'supplement',
  'clarification',
  'replacement',
]);

export const projectMaterialUploadMetadataSchema = z
  .object({
    event_type: projectMaterialEventTypeSchema,
    supersedes_revision_id: entityIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.event_type === 'replacement' && !value.supersedes_revision_id) {
      context.addIssue({
        code: 'custom',
        path: ['supersedes_revision_id'],
        message: '替换材料必须指定被替代的版本',
      });
    }
  });

export const projectMaterialRevisionSchema = z
  .object({
    revision_id: entityIdSchema,
    material_id: entityIdSchema,
    project_id: entityIdSchema,
    event_id: entityIdSchema,
    event_type: projectMaterialEventTypeSchema,
    version_no: z.number().int().positive(),
    original_name: z.string().min(1),
    mime_type: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    parse_status: z.enum(['uploaded', 'parsing', 'parsed', 'needs_review', 'failed']),
    supersedes_revision_id: entityIdSchema.nullable().optional(),
    created_at: isoDateTimeSchema,
  })
  .strict();

export const projectMaterialSchema = z
  .object({
    material_id: entityIdSchema,
    project_id: entityIdSchema,
    name: z.string().min(1),
    current_revision: projectMaterialRevisionSchema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export const documentBlockSchema = z
  .object({
    block_id: entityIdSchema,
    source_revision_id: entityIdSchema,
    type: z.enum(['title', 'paragraph', 'table', 'cell', 'image']),
    page: z.number().int().positive().nullable(),
    index: z.number().int().nonnegative(),
    text: z.string(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const requirementSchema = z
  .object({
    requirement_id: entityIdSchema,
    project_id: entityIdSchema,
    revision_id: entityIdSchema,
    type: z.enum([
      'basic_info',
      'qualification',
      'score_rule',
      'reject_clause',
      'tech_requirement',
      'quote_rule',
      'material_checklist',
      'attachment',
    ]),
    content: z.string().min(1),
    structured: z.record(z.string(), z.unknown()),
    confidence: z.number().min(0).max(1),
    evidence_refs: z.array(evidenceRefSchema).min(1),
  })
  .strict();

export const projectMaterialUploadResultSchema = z
  .object({
    task_id: entityIdSchema,
    project_id: entityIdSchema,
    material_ids: z.array(entityIdSchema),
    status: z.literal('queued'),
  })
  .strict();

export type ProjectMaterial = z.infer<typeof projectMaterialSchema>;
export type ProjectMaterialUploadMetadata = z.infer<typeof projectMaterialUploadMetadataSchema>;

export const createProjectMaterialsApi = (client: ApiClient = apiClient) => ({
  list: (projectId: string, query: { page?: number; size?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, String(value));
    });
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return client.request(`/projects/${projectId}/materials${suffix}`, {
      schema: createPageSchema(projectMaterialSchema),
    });
  },

  upload: (
    projectId: string,
    files: readonly File[],
    metadata: ProjectMaterialUploadMetadata,
    idempotencyKey: string,
  ) => {
    const parsedMetadata = projectMaterialUploadMetadataSchema.parse(metadata);
    const body = new FormData();
    files.forEach((file) => body.append('files[]', file));
    body.set('event_type', parsedMetadata.event_type);
    if (parsedMetadata.supersedes_revision_id) {
      body.set('supersedes_revision_id', parsedMetadata.supersedes_revision_id);
    }
    return client.request(`/projects/${projectId}/materials/uploads`, {
      method: 'POST',
      body,
      idempotencyKey,
      schema: projectMaterialUploadResultSchema,
    });
  },

  listBlocks: (materialId: string, revisionId: string) =>
    client.request(`/project-materials/${materialId}/revisions/${revisionId}/blocks`, {
      schema: createPageSchema(documentBlockSchema),
    }),

  listRequirements: (projectId: string) =>
    client.request(`/projects/${projectId}/requirements`, {
      schema: z.array(requirementSchema),
    }),
});

export const projectMaterialsApi = createProjectMaterialsApi();
