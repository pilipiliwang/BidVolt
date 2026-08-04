import { z } from 'zod';

export const entityIdSchema = z.string().min(1);
export const isoDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
export const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);

export const requestMetaSchema = z
  .object({
    request_id: entityIdSchema,
    project_snapshot_id: entityIdSchema.optional(),
  })
  .strict();

export const createApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z
    .object({
      code: z.literal('OK'),
      message: z.string(),
      data: dataSchema,
      meta: requestMetaSchema.optional(),
    })
    .strict();

export const createPageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z
    .object({
      items: z.array(itemSchema),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      size: z.number().int().positive(),
    })
    .strict();

export type ApiSuccess<T> = {
  code: 'OK';
  message: string;
  data: T;
  meta?: z.infer<typeof requestMetaSchema>;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
};

export const evidenceRefSchema = z
  .object({
    source_type: z.enum([
      'enterprise_asset',
      'project_material',
      'requirement',
      'deliverable',
      'search',
    ]),
    source_revision_id: entityIdSchema,
    content_hash: z.string().regex(/^[a-f0-9]{64}$/i),
    locator: z
      .object({
        page: z.number().int().positive().optional(),
        block_id: entityIdSchema.optional(),
        node_id: entityIdSchema.optional(),
        cell_range: z.string().min(1).optional(),
      })
      .strict(),
    exact_quote: z.string().optional(),
    claim_id: entityIdSchema.optional(),
  })
  .strict();

export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
