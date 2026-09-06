import { describe, expect, it, vi } from 'vitest';
import { createArtifactsApi, type AgentArtifactSummary } from './artifacts';
import { BackendApiError, createBackendApiClient, type BackendApiClient } from './client';

const artifact = (id = 91): AgentArtifactSummary => ({
  artifact_id: id, project_id: 7, task_id: 8, kind: 'item_docx',
  name: '商务文件/响应文件.docx', group: '商务文件', filename: '响应文件.docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  bytes: 100, version_no: 1, is_internal: false, status: 'ready',
  created_at: '2026-09-06T10:00:00Z', updated_at: '2026-09-06T10:00:00Z',
  download_url: `/api/v1/projects/7/agent-artifact/${id}/download`,
});
const clientWith = (request: BackendApiClient['request']): BackendApiClient => ({
  request, requestBlob: vi.fn(), requestResponse: vi.fn(), requestStream: vi.fn(), requestVoid: vi.fn(),
});

describe('formal artifact API', () => {
  it('reads all pages from artifacts, preserves task filter and propagates cancellation', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ artifacts: [artifact(91), artifact(90)], total: 3, page: 1, size: 2 })
      .mockResolvedValueOnce({ artifacts: [artifact(89)], total: 3, page: 2, size: 2 });
    const signal = new AbortController().signal;
    await expect(createArtifactsApi(clientWith(request)).listAll(7, 8, { pageSize: 2, signal }))
      .resolves.toEqual([artifact(91), artifact(90), artifact(89)]);
    expect(request).toHaveBeenNthCalledWith(1, '/projects/7/assembly/artifacts?task_id=8&page=1&size=2', { signal });
    expect(request).toHaveBeenNthCalledWith(2, '/projects/7/assembly/artifacts?task_id=8&page=2&size=2', { signal });
  });

  it('omits task scope when listing all project artifacts and handles an empty directory', async () => {
    const request = vi.fn().mockResolvedValue({ artifacts: [], total: 0, page: 1, size: 100 });
    await expect(createArtifactsApi(clientWith(request)).listAll(7)).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith('/projects/7/assembly/artifacts?page=1&size=100', { signal: undefined });
  });

  it.each([
    { artifacts: [], total: 2, page: 2, size: 1 },
    { artifacts: [artifact(91)], total: 2, page: 2, size: 1 },
    { artifacts: [artifact(90)], total: 3, page: 2, size: 1 },
  ])('never presents incomplete, duplicate, or changing pages as success', async (secondPage) => {
    const request = vi.fn()
      .mockResolvedValueOnce({ artifacts: [artifact()], total: 2, page: 1, size: 1 })
      .mockResolvedValueOnce(secondPage);
    await expect(createArtifactsApi(clientWith(request)).listAll(7, undefined, { pageSize: 1 }))
      .rejects.toBeInstanceOf(BackendApiError);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not treat uploaded file IDs or another project as valid artifact metadata', async () => {
    for (const wrong of [{ ...artifact(), artifact_id: undefined, file_id: 91 }, { ...artifact(), project_id: 9 }]) {
      const request = vi.fn().mockResolvedValue({ artifacts: [wrong], total: 1, page: 1, size: 100 });
      await expect(createArtifactsApi(clientWith(request)).listAll(7)).rejects.toMatchObject({ status: 502 });
    }
  });

  it('preserves 401 rather than returning an empty artifact directory', async () => {
    const onAuthExpired = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '登录已过期' }), { status: 401 }));
    const api = createArtifactsApi(createBackendApiClient({ baseUrl: '/api/v1', tokenProvider: () => 'access', fetchImpl, onAuthExpired }));
    await expect(api.listAll(7)).rejects.toMatchObject({ status: 401, message: '登录已过期' });
    expect(new Headers(fetchImpl.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer access');
  });

  it('loads inspect metadata and downloads only the authenticated artifact route', async () => {
    const request = vi.fn().mockResolvedValue({ ...artifact(), pending_count: 2 });
    const client = clientWith(request);
    const download = new Blob(['binary']);
    vi.mocked(client.requestBlob).mockResolvedValue(download);
    const api = createArtifactsApi(client);
    await expect(api.inspect(7, 91)).resolves.toMatchObject({ artifact_id: 91, pending_count: 2 });
    await expect(api.download(7, 91)).resolves.toBe(download);
    expect(request).toHaveBeenCalledWith('/projects/7/assembly/artifacts/91/inspect', { signal: undefined });
    expect(client.requestBlob).toHaveBeenCalledWith('/projects/7/agent-artifact/91/download', { signal: undefined });
    request.mockResolvedValue(artifact(92));
    await expect(api.inspect(7, 91)).rejects.toMatchObject({ status: 502 });
  });

  it.each(['new', 'overwrite'] as const)('sends explicit %s mode and binary multipart without inventing version semantics', async (mode) => {
    const response = {
      artifact_id: mode === 'new' ? 92 : 91, mode, name: '商务文件/响应文件.docx',
      bytes: 3, version_no: mode === 'new' ? 1 : 2,
      download_url: `/api/v1/projects/7/agent-artifact/${mode === 'new' ? 92 : 91}/download`,
    };
    const request = vi.fn().mockResolvedValue(response);
    const file = new File(['doc'], '响应文件.docx', { type: 'application/octet-stream' });
    await expect(createArtifactsApi(clientWith(request)).save(7, 91, { file, mode })).resolves.toEqual(response);
    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/projects/7/assembly/artifacts/91/save');
    expect(options.method).toBe('POST');
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('mode')).toBe(mode);
    expect(options.body.get('file')).toMatchObject({ name: '响应文件.docx', size: 3 });
  });

  it('never defaults an omitted save choice to overwrite', async () => {
    const request = vi.fn();
    const options = { file: new Blob(['file']) };
    await expect(createArtifactsApi(clientWith(request)).save(7, 91,
      options as Parameters<ReturnType<typeof createArtifactsApi>['save']>[2]))
      .rejects.toThrow('请选择另存为新版本或覆盖当前版本');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects oversized saves without a write request and does not impose browser MIME restrictions', async () => {
    const request = vi.fn();
    const file = new Blob(['data']);
    Object.defineProperty(file, 'size', { value: 60 * 1024 * 1024 + 1 });
    await expect(createArtifactsApi(clientWith(request)).save(7, 91, { file, mode: 'new' }))
      .rejects.toThrow('60 MiB');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not automatically retry a save with an uncertain receipt', async () => {
    const request = vi.fn().mockResolvedValue({ artifact_id: 91, mode: 'new' });
    await expect(createArtifactsApi(clientWith(request)).save(7, 91, { file: new Blob(['data']), mode: 'new' }))
      .rejects.toThrow('勿重复提交');
    expect(request).toHaveBeenCalledOnce();
  });
});
