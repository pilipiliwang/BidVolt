import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const idempotencyHeaders = {
  'Idempotency-Key': '00000000-0000-4000-8000-000000000001',
};

const expectNotFound = async (response: Response) => {
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
};

describe('MSW upload boundary handlers', () => {
  it('rejects project_id on the enterprise upload route', async () => {
    const body = new FormData();
    body.set('files[]', new File(['asset'], 'asset.pdf', { type: 'application/pdf' }));
    body.set('project_id', 'project_001');

    const response = await fetch('http://localhost/api/v1/enterprise-assets/uploads', {
      method: 'POST',
      body,
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('rejects enterprise routing on the project material route', async () => {
    const body = new FormData();
    body.set('files[]', new File(['tender'], 'tender.pdf', { type: 'application/pdf' }));
    body.set('event_type', 'initial');
    body.set('target', 'enterprise');

    const response = await fetch(
      'http://localhost/api/v1/projects/project_001/materials/uploads',
      { method: 'POST', body },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

describe('MSW object ownership and IDOR boundaries', () => {
  it('returns 404 for unknown asset, material, and revision ids', async () => {
    await expectNotFound(
      await fetch('http://localhost/api/v1/enterprise-assets/asset_from_other_tenant'),
    );
    await expectNotFound(
      await fetch(
        'http://localhost/api/v1/project-materials/material_001/revisions/pmr_other/blocks',
      ),
    );
    await expectNotFound(
      await fetch(
        'http://localhost/api/v1/project-materials/material_other/revisions/pmr_001/blocks',
      ),
    );
  });

  it('returns 404 for an unknown project and refuses upload to it', async () => {
    await expectNotFound(
      await fetch('http://localhost/api/v1/projects/project_other/materials'),
    );

    const body = new FormData();
    body.set('files[]', new File(['tender'], 'tender.pdf', { type: 'application/pdf' }));
    body.set('event_type', 'initial');
    await expectNotFound(
      await fetch('http://localhost/api/v1/projects/project_other/materials/uploads', {
        method: 'POST',
        body,
        headers: idempotencyHeaders,
      }),
    );
  });

  it('requires a snapshot to belong to the project in the request path', async () => {
    await expectNotFound(
      await fetch(
        'http://localhost/api/v1/projects/project_other/snapshots/snapshot_001',
      ),
    );
    await expectNotFound(
      await fetch(
        'http://localhost/api/v1/projects/project_001/snapshots/snapshot_other',
      ),
    );

    const response = await fetch(
      'http://localhost/api/v1/projects/project_001/snapshots/snapshot_001',
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { snapshot_id: 'snapshot_001', project_id: 'project_001' },
    });
  });

  it('returns 404 instead of a default review run or quote calculation', async () => {
    await expectNotFound(
      await fetch('http://localhost/api/v1/review-runs/review_run_other'),
    );
    await expectNotFound(
      await fetch('http://localhost/api/v1/quotes/calculations/calc_other'),
    );
  });
});

describe('MSW correction workflows', () => {
  it('corrects an enterprise fact only from the expected asset revision', async () => {
    const response = await fetch(
      'http://localhost/api/v1/enterprise-assets/asset_001/facts/fact_001',
      {
        method: 'PATCH',
        headers: { ...idempotencyHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'YJV22-8.7/15kV 3x300', expected_revision_id: 'ear_001' }),
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { asset_id: 'asset_001', new_revision_id: 'ear_002', fact: { status: 'corrected' } },
    });

    const conflict = await fetch(
      'http://localhost/api/v1/enterprise-assets/asset_001/facts/fact_001',
      {
        method: 'PATCH',
        headers: { ...idempotencyHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'stale', expected_revision_id: 'ear_stale' }),
      },
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('confirms a requirement and rejects the same id through another project', async () => {
    const response = await fetch(
      'http://localhost/api/v1/projects/project_001/requirements/requirement_001',
      {
        method: 'PATCH',
        headers: { ...idempotencyHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', expected_revision_id: 'req_rev_001' }),
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { revision_id: 'req_rev_002', status: 'confirmed' },
    });

    await expectNotFound(
      await fetch(
        'http://localhost/api/v1/projects/project_other/requirements/requirement_001',
        {
          method: 'PATCH',
          headers: { ...idempotencyHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm', expected_revision_id: 'req_rev_001' }),
        },
      ),
    );
  });
});
