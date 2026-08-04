import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
