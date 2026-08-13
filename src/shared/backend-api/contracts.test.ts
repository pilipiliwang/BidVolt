import { describe, expect, it, vi } from 'vitest';

import { createBackendApi } from './index';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(payload), { status });

describe('real backend endpoint contracts', () => {
  it('uploads repeated files with the backend target and project_id multipart fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ files: [] }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });
    const first = new File(['doc'], '招标文件.docx');
    const second = new File(['sheet'], '报价单.xlsx');

    await api.files.upload({ target: 'project', project_id: 42, files: [first, second] });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/files/upload');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    const form = init?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) throw new Error('expected multipart form');
    expect(form.get('target')).toBe('project');
    expect(form.get('project_id')).toBe('42');
    expect(form.getAll('files')).toHaveLength(2);
  });

  it('uses backend auth bodies without frontend-only remember fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      user_id: 1, enterprise_id: 2, access_token: 'a', refresh_token: 'r', token_type: 'bearer',
    }));
    const api = createBackendApi({ fetchImpl });

    await api.auth.login({ email: 'user@example.com', password: 'secret123' });

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'user@example.com', password: 'secret123' });
  });

  it('builds project archive and requirement query paths with numeric ids', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
      .mockResolvedValueOnce(jsonResponse([]));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.projects.archive(17);
    await api.requirements.list(17);

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/projects/17/archive');
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/requirements?project_id=17');
  });

  it('sends suggestion overrides to the score item path and exact body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ item_id: 9 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.review.updateSuggestion(3, 5, 9, '补充技术参数证据');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/projects/3/scores/5/items/9/suggestion');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ suggestion: '补充技术参数证据' });
  });

  it('passes the selected provider to the backend review endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ run_id: 6 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.review.evaluate(3, { provider_id: 12 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/projects/3/evaluate');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ provider_id: 12 });
  });

  it('addresses deliverable versions by backend version_no', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ version_no: 6, model: {} }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });
    await api.deliverables.getVersion('12', 6);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/deliverables/12/versions/6');
  });

  it('sends editor checkpoints to the deliverable-scoped session path', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      session_id: 4, checkpoint_saved: true, lease_expires_at: '2026-08-14T02:00:00Z',
    }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.editor.checkpoint(12, 4, { lease_token: 'lease', content: { nodes: [] } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/deliverables/12/editor-sessions/4/checkpoint');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ lease_token: 'lease', content: { nodes: [] } });
  });

  it('submits tender notice URLs to the project-scoped server importer', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      import_id: 21,
      project_id: 8,
      source_url: 'https://bidding.example.gov.cn/notices/21',
      status: 'queued',
    }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.tenderNotices.importFromUrl(
      8,
      'https://bidding.example.gov.cn/notices/21',
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/projects/8/tender-notices/import-url');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      url: 'https://bidding.example.gov.cn/notices/21',
    });
  });
});
