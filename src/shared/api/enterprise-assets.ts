import { z } from 'zod';

import { apiClient, type ApiClient } from './client';
import {
  createPageSchema,
  entityIdSchema,
  evidenceRefSchema,
  isoDateTimeSchema,
} from './schema';

export const enterpriseAssetCategorySchema = z.enum([
  'certificate',
  'qualification',
  'performance',
  'personnel',
  'product',
  'inspection_report',
  'finance',
  'other',
]);

export const enterpriseAssetStatusSchema = z.enum([
  'ingesting',
  'needs_review',
  'active',
  'expired',
  'failed',
]);

export const enterpriseFactSchema = z
  .object({
    fact_id: entityIdSchema,
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.unknown(),
    confidence: z.number().min(0).max(1),
    status: z.enum(['extracted', 'confirmed', 'corrected', 'conflict', 'low_confidence']),
    evidence_refs: z.array(evidenceRefSchema).min(1),
  })
  .strict();

export const enterpriseAssetRevisionSchema = z
  .object({
    revision_id: entityIdSchema,
    version_no: z.number().int().positive(),
    original_name: z.string().min(1),
    mime_type: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    created_at: isoDateTimeSchema,
  })
  .strict();

export const enterpriseAssetSchema = z
  .object({
    asset_id: entityIdSchema,
    name: z.string().min(1),
    category: enterpriseAssetCategorySchema,
    status: enterpriseAssetStatusSchema,
    current_revision_id: entityIdSchema,
    classification_confidence: z.number().min(0).max(1),
    expires_at: isoDateTimeSchema.nullable().optional(),
    facts: z.array(enterpriseFactSchema),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict();

export const enterpriseAssetUploadMetadataSchema = z
  .object({
    category_hint: enterpriseAssetCategorySchema.optional(),
  })
  .strict();

export const enterpriseIngestionTaskSchema = z
  .object({
    task_id: entityIdSchema,
    asset_ids: z.array(entityIdSchema),
    status: z.enum(['queued', 'running', 'waiting_user', 'succeeded', 'failed']),
  })
  .strict();

export type EnterpriseAsset = z.infer<typeof enterpriseAssetSchema>;
export type EnterpriseAssetUploadMetadata = z.infer<typeof enterpriseAssetUploadMetadataSchema>;
export type EnterpriseIngestionTask = z.infer<typeof enterpriseIngestionTaskSchema>;

export const createEnterpriseAssetsApi = (client: ApiClient = apiClient) => ({
  list: (query: { category?: string; status?: string; page?: number; size?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, String(value));
    });
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return client.request(`/enterprise-assets${suffix}`, {
      schema: createPageSchema(enterpriseAssetSchema),
    });
  },

  get: (assetId: string) =>
    client.request(`/enterprise-assets/${assetId}`, { schema: enterpriseAssetSchema }),

  upload: (files: readonly File[], metadata: EnterpriseAssetUploadMetadata = {}) => {
    const parsedMetadata = enterpriseAssetUploadMetadataSchema.parse(metadata);
    const body = new FormData();
    files.forEach((file) => body.append('files[]', file));
    if (parsedMetadata.category_hint) body.set('category_hint', parsedMetadata.category_hint);
    return client.request('/enterprise-assets/uploads', {
      method: 'POST',
      body,
      schema: enterpriseIngestionTaskSchema,
    });
  },

  listRevisions: (assetId: string) =>
    client.request(`/enterprise-assets/${assetId}/revisions`, {
      schema: z.array(enterpriseAssetRevisionSchema),
    }),

  correctClassification: (
    assetId: string,
    input: { category: z.infer<typeof enterpriseAssetCategorySchema> },
  ) =>
    client.request(`/enterprise-assets/${assetId}/classification`, {
      method: 'PATCH',
      body: z.object({ category: enterpriseAssetCategorySchema }).strict().parse(input),
      schema: enterpriseAssetSchema,
    }),
});

export const enterpriseAssetsApi = createEnterpriseAssetsApi();
