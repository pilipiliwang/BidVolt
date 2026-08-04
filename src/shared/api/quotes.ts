import { z } from 'zod';

import { apiClient, type ApiClient } from './client';
import { decimalStringSchema, entityIdSchema, isoDateTimeSchema } from './schema';

export const historyPriceQuerySchema = z
  .object({
    material_name: z.string().optional(),
    material_code: z.string().optional(),
    spec: z.string().optional(),
    tenderer: z.string().optional(),
    region: z.string().optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    page: z.number().int().positive().optional(),
    size: z.number().int().positive().max(100).optional(),
  })
  .strict();

export const historyPriceSampleSchema = z
  .object({
    sample_id: entityIdSchema,
    material_name: z.string().min(1),
    material_code: z.string().nullable(),
    spec: z.string().nullable(),
    tenderer: z.string().nullable(),
    region: z.string().nullable(),
    win_price: decimalStringSchema,
    currency: z.string().length(3),
    tax_included: z.boolean(),
    unit: z.string().min(1),
    win_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    supplier: z.string().nullable(),
    source_ref: z.string().min(1),
  })
  .strict();

export const historyQuerySnapshotSchema = z
  .object({
    read_only: z.literal(true),
    provider_id: entityIdSchema,
    provider_version: z.string().min(1),
    query_snapshot_id: entityIdSchema,
    source_updated_at: isoDateTimeSchema,
    samples: z.array(historyPriceSampleSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    size: z.number().int().positive(),
    normalization_warnings: z.array(z.string()),
  })
  .strict();

export const quoteCalculationInputSchema = z
  .object({
    project_snapshot_id: entityIdSchema,
    material_ref: z.string().min(1),
    cost: decimalStringSchema,
    min_profit_rate: decimalStringSchema,
    currency: z.string().length(3),
    tax_included: z.boolean(),
    unit: z.string().min(1),
  })
  .strict();

export const quoteStrategySchema = z
  .object({
    strategy_id: entityIdSchema,
    strategy: z.enum(['win', 'balance', 'profit']),
    suggested_price: decimalStringSchema,
    score: decimalStringSchema.nullable(),
    gross_margin: decimalStringSchema,
    risk_level: z.enum(['low', 'medium', 'high']),
    basis: z.array(z.string()),
  })
  .strict();

const quoteCalculationBase = {
  calc_id: entityIdSchema,
  project_snapshot_id: entityIdSchema,
  algorithm_version: z.string().min(1),
  created_at: isoDateTimeSchema,
};

export const calculatedQuoteSchema = z
  .object({
    ...quoteCalculationBase,
    status: z.literal('calculated'),
    sample_snapshot_id: entityIdSchema,
    confidence_interval: z
      .object({ min: decimalStringSchema, max: decimalStringSchema })
      .strict(),
    normalized_input: z
      .object({
        currency: z.string().length(3),
        tax_included: z.boolean(),
        unit: z.string().min(1),
      })
      .strict(),
    excluded_sample_count: z.number().int().nonnegative(),
    strategies: z.array(quoteStrategySchema).length(3),
  })
  .strict();

export const quoteNeedsInputSchema = z
  .object({
    ...quoteCalculationBase,
    status: z.literal('needs_input'),
    missing_fields: z.array(z.string()).min(1),
    message: z.string().min(1),
  })
  .strict();

export const quoteInsufficientDataSchema = z
  .object({
    ...quoteCalculationBase,
    status: z.literal('insufficient_data'),
    observed_sample_count: z.number().int().nonnegative(),
    required_sample_count: z.number().int().positive(),
    message: z.string().min(1),
  })
  .strict();

export const quoteConstraintViolationSchema = z
  .object({
    ...quoteCalculationBase,
    status: z.literal('constraint_violation'),
    violations: z.array(z.string()).min(1),
    message: z.string().min(1),
  })
  .strict();

export const quoteCalculationSchema = z.discriminatedUnion('status', [
  calculatedQuoteSchema,
  quoteNeedsInputSchema,
  quoteInsufficientDataSchema,
  quoteConstraintViolationSchema,
]);

export const applyQuoteInputSchema = z
  .object({
    strategy_id: entityIdSchema,
    expected_version_id: entityIdSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const applyQuoteResultSchema = z
  .object({
    deliverable_id: entityIdSchema,
    new_version_id: entityIdSchema,
    audit_log_id: entityIdSchema,
  })
  .strict();

export type HistoryPriceQuery = z.infer<typeof historyPriceQuerySchema>;
export type HistoryQuerySnapshot = z.infer<typeof historyQuerySnapshotSchema>;
export type QuoteCalculationInput = z.infer<typeof quoteCalculationInputSchema>;
export type QuoteCalculation = z.infer<typeof quoteCalculationSchema>;

export const createQuotesApi = (client: ApiClient = apiClient) => ({
  listHistory: (query: HistoryPriceQuery = {}) => {
    const parsedQuery = historyPriceQuerySchema.parse(query);
    const search = new URLSearchParams();
    Object.entries(parsedQuery).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, String(value));
    });
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return client.request(`/quotes/history${suffix}`, { schema: historyQuerySnapshotSchema });
  },

  getHistorySample: (sampleId: string) =>
    client.request(`/quotes/history/${sampleId}`, { schema: historyPriceSampleSchema }),

  calculate: (input: QuoteCalculationInput, idempotencyKey: string) =>
    client.request('/quotes/calculations', {
      method: 'POST',
      body: quoteCalculationInputSchema.parse(input),
      idempotencyKey,
      schema: quoteCalculationSchema,
    }),

  getCalculation: (calculationId: string) =>
    client.request(`/quotes/calculations/${calculationId}`, {
      schema: quoteCalculationSchema,
    }),

  apply: (
    calculationId: string,
    input: z.infer<typeof applyQuoteInputSchema>,
    idempotencyKey: string,
  ) =>
    client.request(`/quotes/calculations/${calculationId}/apply`, {
      method: 'POST',
      body: applyQuoteInputSchema.parse(input),
      idempotencyKey,
      schema: applyQuoteResultSchema,
    }),
});

export const quotesApi = createQuotesApi();
