import { describe, expect, it, vi } from 'vitest';

import { createBackendApi } from './index';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

describe('latest backend contract d3ee772 (API-compatible with b0eab472)', () => {
  it('starts and steers the project-scoped agent main session', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ task_id: 31 }))
      .mockResolvedValueOnce(jsonResponse({ queued: true, mode: 'steer', reply: null }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.agent.start(7, {
      idempotency_key: 'agent-7-v1', payload: { mode: 'generate' }, model: 'deepseek-v4-pro',
    });
    await api.agent.chat(7, 31, { message: '先核对评分细则', mode: 'steer' });

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/projects/7/agent-run');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      idempotency_key: 'agent-7-v1', payload: { mode: 'generate' }, model: 'deepseek-v4-pro',
    });
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/projects/7/agent-run/31/chat');
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      message: '先核对评分细则', mode: 'steer',
    });
  });

  it('subscribes to the resumable agent stream without using the legacy task parser', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      'event: end\ndata: {"status":3,"session_id":"s1","outcome":"complete","reason":null,"action_list":[],"error":null}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await expect(api.agent.stream(7, 31, { since: 8, onMessage: vi.fn() }))
      .resolves.toMatchObject({ type: 'end', status: 3, sessionId: 's1' });

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/projects/7/agent-run/31/stream?since=8');
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('Accept')).toBe('text/event-stream');
  });

  it('connects agent questions, answers, pre-chat, status and artifact download', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ task_id: 31, status: 2, progress: {} }))
      .mockResolvedValueOnce(jsonResponse({ asks: [], action_list: [] }))
      .mockResolvedValueOnce(jsonResponse({ ask_id: 4, answered: true, queued: true, reply: null }))
      .mockResolvedValueOnce(jsonResponse({ reply: '已读取项目材料', session_id: 'pre-1', returncode: 0 }))
      .mockResolvedValueOnce(new Response('artifact', { status: 200 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.agent.status(7, 31);
    await api.agent.questions(7, 31);
    await api.agent.answer(7, 31, 4, ['已提供原件']);
    await api.agent.preChat(7, '检查目前材料');
    await api.agent.downloadArtifact(7, 12);

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/projects/7/agent-run/31',
      '/api/v1/projects/7/agent-run/31/questions',
      '/api/v1/projects/7/agent-run/31/asks/4/answer',
      '/api/v1/projects/7/pre-chat',
      '/api/v1/projects/7/agent-artifact/12/download',
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toEqual({
      answer: ['已提供原件'],
    });
  });

  it('uses the latest tender notice collection and detail paths', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ tender_notice_id: 18, status: 2 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.tenderNotices.list(7);
    await api.tenderNotices.get(7, 18);

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/projects/7/tender-notices');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/projects/7/tender-notices/18');
  });

  it('sends document_role with upload and exposes image-description endpoints', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ queued: 0, running: 0, done: 2, remaining: 0 }))
      .mockResolvedValueOnce(jsonResponse({ file_id: 9, items: [] }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.files.upload({
      target: 'project', project_id: 7, document_role: 'current_tender',
      files: [new File(['doc'], 'tender.docx')],
    });
    await api.files.imageDescribeProgress();
    await api.files.imageDescriptions(9);

    const form = fetchImpl.mock.calls[0][1]?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) throw new Error('expected multipart form');
    expect(form.get('document_role')).toBe('current_tender');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/files/image-describe-progress');
    expect(fetchImpl.mock.calls[2][0]).toBe('/api/v1/files/9/image-descriptions');
  });

  it('loads every project-file page before material roles are adapted', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        items: [{ file_id: 1, name: '第一页.docx' }, { file_id: 2, name: '第一页.zip' }],
        total: 3,
        page: 1,
        size: 2,
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{ file_id: 3, name: '第二页.docx', document_role: 'supplemental' }],
        total: 3,
        page: 2,
        size: 2,
      }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await expect(api.files.listAll({ target: 'project', project_id: 7 }, 2)).resolves.toEqual([
      { file_id: 1, name: '第一页.docx' },
      { file_id: 2, name: '第一页.zip' },
      { file_id: 3, name: '第二页.docx', document_role: 'supplemental' },
    ]);

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/files?target=project&project_id=7&page=1&size=2',
      '/api/v1/files?target=project&project_id=7&page=2&size=2',
    ]);
  });

  it('uses CAS bodies for requirement confirmation and correction', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ req_id: 4 }))
      .mockResolvedValueOnce(jsonResponse({ req_id: 5 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.requirements.confirm(7, 4, { expected_revision: 2, confirmed: true });
    await api.requirements.correct(7, 4, {
      expected_revision: 2, content: '更正后的技术要求', coordinates: [{ page: 8 }],
    });

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/projects/7/requirements/4/confirm');
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('PUT');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/projects/7/requirements/4/correct');
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      expected_revision: 2, content: '更正后的技术要求', coordinates: [{ page: 8 }],
    });
  });

  it('passes provider_id only when selected', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ run_id: 4 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.review.evaluate(7, { provider_id: 3 });

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ provider_id: 3 });
  });

  it('uses current quote history, sample, trend and AI suggestion contracts', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({}));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.quotes.history({ category: '电缆', scope: 'public', limit: 20 });
    await api.quotes.sampleDetail(9);
    await api.quotes.trend('YJV-95');
    await api.quotes.aiSuggest(3, '冻结样本与成本测算');

    expect(fetchImpl.mock.calls[0][0]).toBe(
      '/api/v1/quotes/history?category=%E7%94%B5%E7%BC%86&scope=public&limit=20',
    );
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/quotes/history/samples/9');
    expect(fetchImpl.mock.calls[2][0]).toBe('/api/v1/quotes/history/YJV-95/trend');
    expect(fetchImpl.mock.calls[3][0]).toBe('/api/v1/quotes/ai-suggest');
  });

  it('imports an xlsx into the selected real history-library scope', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      imported: 2, skipped: 0, scope: 'private', parsed_total: 2, skipped_rows: 0,
      skipped_reasons: [],
    }, 201));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.quotes.importHistory(new File(['xlsx'], 'history.xlsx'), 'private');

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/quotes/history/import');
    const form = fetchImpl.mock.calls[0][1]?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) throw new Error('expected multipart form');
    expect(form.get('target')).toBe('private');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('exposes final check, export and package download paths', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ check_id: 2, passed: true, issues: [] }))
      .mockResolvedValueOnce(jsonResponse({ job_id: 3, status: 2, files: [] }))
      .mockResolvedValueOnce(new Response('zip', { status: 200 }));
    const api = createBackendApi({ baseUrl: '/api/v1', fetchImpl });

    await api.exports.check(7);
    await api.exports.create(7, { formats: ['docx'], with_manifest: true });
    await api.agent.responsePackage(7);

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/projects/7/check');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/projects/7/export');
    expect(fetchImpl.mock.calls[2][0]).toBe('/api/v1/projects/7/response-package');
  });
});
