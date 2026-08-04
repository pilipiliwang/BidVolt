import { describe, expect, it } from 'vitest';
import openapiTS, { astToString } from 'openapi-typescript';

import openApiSource from '../../../docs/api/openapi.yaml?raw';

const openApi = openApiSource.replace(/\r\n/g, '\n');

const operations = [
  ['/enterprise-assets', 'get', 'listEnterpriseAssets'],
  ['/enterprise-assets/uploads', 'post', 'uploadEnterpriseAssets'],
  ['/enterprise-assets/{asset_id}', 'get', 'getEnterpriseAsset'],
  ['/enterprise-assets/{asset_id}/revisions', 'get', 'listEnterpriseAssetRevisions'],
  [
    '/enterprise-assets/{asset_id}/classification',
    'patch',
    'correctEnterpriseAssetClassification',
  ],
  ['/enterprise-assets/{asset_id}/facts/{fact_id}', 'patch', 'correctEnterpriseFact'],
  ['/projects/{project_id}/materials', 'get', 'listProjectMaterials'],
  ['/projects/{project_id}/materials/uploads', 'post', 'uploadProjectMaterials'],
  [
    '/project-materials/{material_id}/revisions/{revision_id}/blocks',
    'get',
    'listProjectMaterialBlocks',
  ],
  ['/projects/{project_id}/requirements', 'get', 'listProjectRequirements'],
  [
    '/projects/{project_id}/requirements/{requirement_id}',
    'patch',
    'mutateProjectRequirement',
  ],
  ['/projects/{project_id}/snapshots', 'get', 'listProjectSnapshots'],
  ['/projects/{project_id}/snapshots/{snapshot_id}', 'get', 'getProjectSnapshot'],
  ['/tasks/{task_id}', 'get', 'getTask'],
  ['/tasks/{task_id}/stream', 'get', 'streamTaskEvents'],
  ['/review-providers', 'get', 'listReviewProviders'],
  ['/projects/{project_id}/review-runs', 'post', 'createReviewRun'],
  ['/review-runs/{review_run_id}', 'get', 'getReviewRun'],
  ['/quotes/history', 'get', 'listHistoryPrices'],
  ['/quotes/history/{sample_id}', 'get', 'getHistoryPriceSample'],
  ['/quotes/calculations', 'post', 'createQuoteCalculation'],
  ['/quotes/calculations/{calculation_id}', 'get', 'getQuoteCalculation'],
  ['/quotes/calculations/{calculation_id}/apply', 'post', 'applyQuoteCalculation'],
] as const;

const getPathSection = (path: string) => {
  const marker = `  ${path}:\n`;
  const start = openApi.indexOf(marker);
  if (start < 0) return '';
  const nextPath = openApi.indexOf('\n  /', start + marker.length);
  return openApi.slice(start, nextPath < 0 ? openApi.length : nextPath);
};

describe('OpenAPI and TypeScript contract parity', () => {
  it('documents every public operation with a stable and unique operationId', () => {
    for (const [path, method, operationId] of operations) {
      const section = getPathSection(path);
      expect(section, `missing OpenAPI path ${path}`).not.toBe('');
      expect(section).toContain(`    ${method}:\n`);
      expect(section).toContain(`      operationId: ${operationId}\n`);
    }

    const documentedOperationIds = Array.from(
      openApi.matchAll(/^\s{6}operationId:\s*(\S+)\s*$/gm),
      (match) => match[1],
    );
    expect(documentedOperationIds).toHaveLength(operations.length);
    expect(new Set(documentedOperationIds).size).toBe(documentedOperationIds.length);
  });

  it('requires idempotency and optimistic concurrency on mutable enterprise operations', () => {
    const upload = getPathSection('/enterprise-assets/uploads');
    expect(upload).toContain("#/components/parameters/IdempotencyKey");
    expect(upload).toContain("required: ['files[]']");
    expect(upload).not.toContain('\n                target:');
    expect(upload).not.toContain('\n                project_id:');

    const correction = getPathSection('/enterprise-assets/{asset_id}/classification');
    expect(correction).toContain("#/components/parameters/IdempotencyKey");
    expect(correction).toContain('CorrectEnterpriseAssetClassificationInput');
    expect(openApi).toContain('required: [category, expected_revision_id]');

    const factCorrection = getPathSection('/enterprise-assets/{asset_id}/facts/{fact_id}');
    expect(factCorrection).toContain("#/components/parameters/IdempotencyKey");
    expect(openApi).toContain('required: [value, expected_revision_id]');
  });

  it('requires idempotency, frozen snapshots, and version CAS on workflow writes', () => {
    const projectUpload = getPathSection('/projects/{project_id}/materials/uploads');
    expect(projectUpload).toContain("#/components/parameters/IdempotencyKey");
    expect(projectUpload).toContain("required: ['files[]', event_type]");
    expect(projectUpload).not.toContain('\n                target:');

    const review = getPathSection('/projects/{project_id}/review-runs');
    expect(review).toContain("#/components/parameters/IdempotencyKey");
    expect(openApi).toContain(
      'required: [provider_id, provider_version, project_snapshot_id, deliverable_version_ids]',
    );

    const calculate = getPathSection('/quotes/calculations');
    expect(calculate).toContain("#/components/parameters/IdempotencyKey");
    expect(openApi).toContain(
      'required: [project_snapshot_id, material_ref, cost, min_profit_rate, currency, tax_included, unit]',
    );

    const apply = getPathSection('/quotes/calculations/{calculation_id}/apply');
    expect(apply).toContain("#/components/parameters/IdempotencyKey");
    expect(openApi).toContain('required: [strategy_id, expected_version_id, confirmed]');

    const requirement = getPathSection(
      '/projects/{project_id}/requirements/{requirement_id}',
    );
    expect(requirement).toContain("#/components/parameters/IdempotencyKey");
    expect(openApi).toContain('required: [action, expected_revision_id]');
  });

  it('does not document generic target upload, AI pricing, or history mutations', () => {
    expect(openApi).not.toContain('  /files/upload:');
    expect(openApi).not.toContain('  /quotes/ai-suggest:');

    const history = getPathSection('/quotes/history');
    expect(history).toContain('    get:\n');
    expect(history).not.toMatch(/^\s{4}(post|put|patch|delete):/m);
  });

  it('generates the same four quote status literals used by runtime Zod schemas', async () => {
    const generated = astToString(await openapiTS(openApi, { silent: true }));

    expect(generated).toContain('status: "calculated";');
    expect(generated).toContain('status: "needs_input";');
    expect(generated).toContain('status: "insufficient_data";');
    expect(generated).toContain('status: "constraint_violation";');
    expect(generated).not.toContain('status: "CalculatedQuote";');
    expect(generated).not.toContain('status: "QuoteNeedsInput";');
  });
});
