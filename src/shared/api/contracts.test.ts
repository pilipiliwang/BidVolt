import { describe, expect, it } from 'vitest';

import {
  enterpriseAssetSchema,
  enterpriseAssetUploadMetadataSchema,
  historyQuerySnapshotSchema,
  parsePublicTaskEvent,
  projectMaterialSchema,
  projectMaterialUploadMetadataSchema,
  publicTaskEventSchema,
  quoteInsufficientDataSchema,
  quotesApi,
  reviewProviderSchema,
} from '.';
import {
  enterpriseAssetFixture,
  historyQueryFixture,
  insufficientQuoteFixture,
  projectMaterialFixture,
  publicTaskEventFixture,
  reviewProvidersFixture,
} from '../../mocks/fixtures';

describe('Contract v0.2 data-domain isolation', () => {
  it('rejects project routing fields at the enterprise upload boundary', () => {
    expect(enterpriseAssetUploadMetadataSchema.safeParse({ category_hint: 'certificate' }).success).toBe(
      true,
    );
    expect(
      enterpriseAssetUploadMetadataSchema.safeParse({
        category_hint: 'certificate',
        target: 'project',
        project_id: 'project_001',
      }).success,
    ).toBe(false);
  });

  it('rejects enterprise routing fields and invalid replacement events at the project boundary', () => {
    expect(
      projectMaterialUploadMetadataSchema.safeParse({
        event_type: 'initial',
        target: 'enterprise',
      }).success,
    ).toBe(false);
    expect(
      projectMaterialUploadMetadataSchema.safeParse({ event_type: 'replacement' }).success,
    ).toBe(false);
  });

  it('keeps enterprise asset and project material response models non-interchangeable', () => {
    expect(enterpriseAssetSchema.safeParse(projectMaterialFixture).success).toBe(false);
    expect(projectMaterialSchema.safeParse(enterpriseAssetFixture).success).toBe(false);
  });
});

describe('PublicTaskEvent whitelist', () => {
  it('accepts the sanitized public event fixture', () => {
    expect(parsePublicTaskEvent(JSON.stringify(publicTaskEventFixture))).toEqual(publicTaskEventFixture);
  });

  it('rejects thought, tool arguments, internal ids, and other undeclared fields', () => {
    const unsafeEvent = {
      ...publicTaskEventFixture,
      thought: 'hidden chain of thought',
      tool_args: { query: 'enterprise secret' },
      internal_profile_id: 'profile_private_001',
    };
    expect(publicTaskEventSchema.safeParse(unsafeEvent).success).toBe(false);
  });
});

describe('review and quote safety contracts', () => {
  it('supports both API and sandbox-code review providers', () => {
    const parsed = reviewProviderSchema.array().parse(reviewProvidersFixture);
    expect(parsed.map((provider) => provider.type)).toEqual(['api', 'sandbox_code']);
  });

  it('requires history snapshots to be explicitly read-only', () => {
    expect(historyQuerySnapshotSchema.parse(historyQueryFixture).read_only).toBe(true);
    expect(
      historyQuerySnapshotSchema.safeParse({ ...historyQueryFixture, read_only: false }).success,
    ).toBe(false);
  });

  it('forbids price fields on insufficient-data quote responses', () => {
    expect(quoteInsufficientDataSchema.parse(insufficientQuoteFixture).status).toBe(
      'insufficient_data',
    );
    expect(
      quoteInsufficientDataSchema.safeParse({
        ...insufficientQuoteFixture,
        suggested_price: '399.00',
        price_range: ['380.00', '420.00'],
      }).success,
    ).toBe(false);
  });

  it('does not expose history mutations or an AI quote method', () => {
    expect(Object.keys(quotesApi).sort()).toEqual(
      ['apply', 'calculate', 'getCalculation', 'getHistorySample', 'listHistory'].sort(),
    );
  });
});
