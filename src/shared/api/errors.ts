import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'PERMISSION_DENIED',
  'RESOURCE_NOT_FOUND',
  'EDIT_LOCKED',
  'VERSION_CONFLICT',
  'SNAPSHOT_STALE',
  'IDEMPOTENCY_CONFLICT',
  'TASK_SUPERSEDED',
  'FILE_TOO_LARGE',
  'FILE_TYPE_UNSUPPORTED',
  'FILE_QUARANTINED',
  'PARSE_FAILED',
  'LOW_CONFIDENCE_NEEDS_REVIEW',
  'QUOTE_INPUT_MISSING',
  'QUOTE_INSUFFICIENT_DATA',
  'QUOTE_CONSTRAINT_VIOLATION',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'REVIEW_INVALID_RESPONSE',
  'REVIEW_PROVIDER_UNAVAILABLE',
  'REVIEW_PROVIDER_TIMEOUT',
  'HISTORY_PROVIDER_UNAVAILABLE',
  'CONTRACT_INVALID_RESPONSE',
  'NETWORK_ERROR',
  'HTTP_ERROR',
]);

export const apiErrorBodySchema = z
  .object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    request_id: z.string().optional(),
    retryable: z.boolean().default(false),
  })
  .strict();

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(status: number, body: ApiErrorBody, options?: ErrorOptions) {
    super(body.message, options);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.request_id;
    this.retryable = body.retryable;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
