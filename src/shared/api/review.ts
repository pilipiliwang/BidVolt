import { z } from 'zod';

import { apiClient, type ApiClient } from './client';
import { entityIdSchema, evidenceRefSchema, isoDateTimeSchema } from './schema';

export const reviewProviderTypeSchema = z.enum([
  'api',
  'sandbox_code',
  'rule_engine',
  'document_rule',
]);

export const reviewProviderSchema = z
  .object({
    provider_id: entityIdSchema,
    name: z.string().min(1),
    type: reviewProviderTypeSchema,
    version: z.string().min(1),
    status: z.enum(['available', 'degraded', 'unavailable']),
    capabilities: z.array(z.enum(['score', 'risk', 'evidence', 'suggestion'])),
    allowed_data_scope: z.array(
      z.enum(['requirements', 'deliverables', 'enterprise_facts', 'quote_snapshot']),
    ),
    can_execute: z.boolean(),
  })
  .strict();

export const reviewFindingSchema = z
  .object({
    finding_id: entityIdSchema,
    rule_id: entityIdSchema,
    rule_version: z.string().min(1),
    outcome: z.enum(['pass', 'fail', 'risk', 'unknown', 'abstain']),
    score: z.number().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    message: z.string().min(1),
    suggestion: z.string().nullable(),
    evidence_refs: z.array(evidenceRefSchema),
  })
  .strict();

export const reviewSummarySchema = z
  .object({
    total_finding_count: z.number().int().nonnegative(),
    category_counts: z.array(
      z
        .object({
          category_key: z.string().min(1),
          label: z.string().min(1),
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    current_score: z.number().min(0).max(100),
    predicted_score: z.number().min(0).max(100),
    total_lift: z.number().nonnegative(),
    section_lifts: z
      .object({
        business: z.number().nonnegative(),
        technical: z.number().nonnegative(),
        pricing: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const reviewRunSchema = z
  .object({
    review_run_id: entityIdSchema,
    project_id: entityIdSchema,
    project_snapshot_id: entityIdSchema,
    provider_id: entityIdSchema,
    provider_version: z.string().min(1),
    deliverable_version_ids: z.array(entityIdSchema).min(1),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'invalid_response', 'timed_out']),
    raw_response_hash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
    findings: z.array(reviewFindingSchema),
    review_summary: reviewSummarySchema.optional(),
    created_at: isoDateTimeSchema,
    finished_at: isoDateTimeSchema.nullable(),
  })
  .strict();

export const createReviewRunInputSchema = z
  .object({
    provider_id: entityIdSchema,
    provider_version: z.string().min(1),
    project_snapshot_id: entityIdSchema,
    deliverable_version_ids: z.array(entityIdSchema).min(1),
  })
  .strict();

export const createReviewRunResultSchema = z
  .object({
    review_run_id: entityIdSchema,
    task_id: entityIdSchema,
    project_snapshot_id: entityIdSchema,
    status: z.literal('queued'),
  })
  .strict();

export type ReviewProvider = z.infer<typeof reviewProviderSchema>;
export type ReviewRun = z.infer<typeof reviewRunSchema>;
export type CreateReviewRunInput = z.infer<typeof createReviewRunInputSchema>;

export const createReviewApi = (client: ApiClient = apiClient) => ({
  listProviders: () => client.request('/review-providers', { schema: z.array(reviewProviderSchema) }),

  createRun: (
    projectId: string,
    input: CreateReviewRunInput,
    idempotencyKey: string,
  ) =>
    client.request(`/projects/${projectId}/review-runs`, {
      method: 'POST',
      body: createReviewRunInputSchema.parse(input),
      idempotencyKey,
      schema: createReviewRunResultSchema,
    }),

  getRun: (reviewRunId: string) =>
    client.request(`/review-runs/${reviewRunId}`, { schema: reviewRunSchema }),
});

export const reviewApi = createReviewApi();
