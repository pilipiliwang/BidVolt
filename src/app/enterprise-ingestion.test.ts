import { describe, expect, it } from 'vitest';

import type { EnterpriseIngestion } from '../shared/backend-api';
import { adaptEnterpriseIngestion } from './enterprise-ingestion';

const ingestion = (status: number): EnterpriseIngestion => ({
  asset_ids: [],
  created_at: null,
  ingest_id: 17,
  status,
  task_id: 23,
});

describe('enterprise ingestion status mapping', () => {
  it.each([
    [1, 'classifying'],
    [2, 'pending_confirmation'],
    [3, 'completed'],
    [4, 'failed'],
  ] as const)('maps backend status %s without inventing a processing phase', (status, expected) => {
    expect(adaptEnterpriseIngestion(ingestion(status)).status).toBe(expected);
  });
});
