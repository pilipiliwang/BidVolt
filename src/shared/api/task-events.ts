import { z } from 'zod';

import { entityIdSchema, isoDateTimeSchema } from './schema';

export const taskStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_user',
  'retrying',
  'cancel_requested',
  'cancelled',
  'superseded',
  'succeeded',
  'failed',
  'dead_letter',
]);

export const publicTaskResultRefsSchema = z
  .object({
    deliverable_ids: z.array(entityIdSchema).optional(),
    requirement_revision_ids: z.array(entityIdSchema).optional(),
    review_run_id: entityIdSchema.optional(),
    quote_calculation_id: entityIdSchema.optional(),
    check_id: entityIdSchema.optional(),
    export_job_id: entityIdSchema.optional(),
  })
  .strict();

export const publicTaskEventSchema = z
  .object({
    schema_version: z.literal('1'),
    event_id: entityIdSchema,
    sequence: z.number().int().nonnegative(),
    task_id: entityIdSchema,
    project_id: entityIdSchema,
    phase: z.string().min(1).max(64),
    status: taskStatusSchema,
    percent: z.number().int().min(0).max(100).nullable(),
    public_message: z.string().max(500),
    error_code: z.string().max(100).nullable(),
    occurred_at: isoDateTimeSchema,
    result_refs: publicTaskResultRefsSchema.optional(),
  })
  .strict();

export type PublicTaskEvent = z.infer<typeof publicTaskEventSchema>;

export const parsePublicTaskEvent = (input: string | unknown): PublicTaskEvent => {
  const value = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  return publicTaskEventSchema.parse(value);
};
