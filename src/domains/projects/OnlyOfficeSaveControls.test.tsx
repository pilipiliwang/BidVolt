import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlyOfficeSaveControls, type OfficeSaveStatus } from './OnlyOfficeSaveControls';

describe('OnlyOfficeSaveControls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function setup(initial: OfficeSaveStatus = {}) {
    let status = initial;
    const onSaved = vi.fn(); const onDraftAvailable = vi.fn();
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit): Promise<{
      ok: boolean; status?: number; json: () => Promise<OfficeSaveStatus & { error?: string }>;
    }> => ({
      ok: true, json: async () => options?.method === 'POST'
        ? { ...status, pendingSave: JSON.parse(String(options.body)) }
        : status,
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<OnlyOfficeSaveControls bridgeUrl="http://localhost:8081" sessionId="s1" fileId="f1"
      displayName="合同.docx" onSaved={onSaved} onDraftAvailable={onDraftAvailable} />);
    return { fetchMock, onSaved, onDraftAvailable,
      requestId: () => JSON.parse(String(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]?.body)).requestId as string,
      update: (next: OfficeSaveStatus) => { status = next; } };
  }

  it('requires an explicit new-version or overwrite choice; opening the dialog does not save', async () => {
    const { fetchMock, onSaved, update, requestId } = setup();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '另存为新版本' }));
    await act(async () => {});
    const writes = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ strategy: 'new-version', requestId: expect.any(String) });
    expect(onSaved).not.toHaveBeenCalled();
    update({ savedVersion: 1, savedRevision: 1, status: 'saved', lastSaveRequestId: requestId() });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onSaved).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps autosave as draft and opens a decision only after a native user save', async () => {
    const { update, fetchMock } = setup({ draftRevision: 1, needsDecision: false });
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    update({ draftRevision: 2, needsDecision: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('recognizes successive overwrites of the same version using savedRevision', async () => {
    const { onSaved, update, fetchMock, requestId } = setup({ savedVersion: 1, savedRevision: 1, status: 'saved' });
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '覆盖当前版本' }));
    await act(async () => {});
    expect(JSON.parse(String(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]?.body)).strategy).toBe('overwrite');
    update({ savedVersion: 1, savedRevision: 2, status: 'saved', lastSaveRequestId: requestId() });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onSaved.mock.calls).toEqual([[1], [1]]);
  });

  it('shows a version conflict without claiming success or discarding the draft', async () => {
    const { update, onSaved, requestId } = setup();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '覆盖当前版本' }));
    await act(async () => {});
    update({ saveError: { code: 'version-conflict', message: '该版本已被其他会话修改，请创建新版本。', requestId: requestId() } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('alert')).toHaveTextContent('该版本已被其他会话修改');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeEnabled();
  });

  it('reopens a new native save decision for the same draft using decisionRevision', async () => {
    const { update } = setup({ draftRevision: 1, decisionRevision: 1, needsDecision: true });
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    update({ draftRevision: 1, decisionRevision: 2, needsDecision: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not retry a 5xx or lost HTTP receipt with a different save request', async () => {
    const { fetchMock, update, requestId, onSaved } = setup();
    await act(async () => {});
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 502, json: async () => ({ error: 'gateway failure' }) }));
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '另存为新版本' }));
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('保存结果待确认');
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '覆盖当前版本' })).toBeDisabled();
    update({ savedVersion: 2, savedRevision: 2, lastSaveRequestId: requestId(), status: 'saved' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onSaved).toHaveBeenCalledWith(2);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });

  it('an old saved state or old failure does not unlock a new save', async () => {
    const { update, requestId, onSaved } = setup({ savedVersion: 1, savedRevision: 1, lastSaveRequestId: 'old', status: 'saved' });
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '另存为新版本' }));
    await act(async () => {});
    update({ savedVersion: 1, savedRevision: 1, lastSaveRequestId: 'old', status: 'save-failed',
      saveError: { code: 'old-error', message: '旧请求失败', requestId: 'old' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeDisabled();
    expect(screen.queryByText('旧请求失败')).not.toBeInTheDocument();
    update({ savedVersion: 2, savedRevision: 2, lastSaveRequestId: requestId(), status: 'saved' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onSaved.mock.calls).toEqual([[1], [2]]);
  });

  it('disables all choices when a restored session already has a pending save', async () => {
    const { fetchMock } = setup({ pendingSave: { requestId: 'restored', strategy: 'overwrite' }, needsDecision: true, draftRevision: 1 });
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存文档' })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('clears transient poll errors after pending state can be confirmed again', async () => {
    const { fetchMock, update, requestId } = setup();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '另存为新版本' }));
    await act(async () => {});
    fetchMock.mockRejectedValueOnce(new TypeError('network unavailable'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    update({ pendingSave: { requestId: requestId(), strategy: 'new-version' }, status: 'saving' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeDisabled();
  });

  it('does not report an old saved version as clean when a newer draft is awaiting a choice', async () => {
    const { onSaved, onDraftAvailable } = setup({ savedVersion: 1, savedRevision: 1, lastSaveRequestId: 'old', status: 'draft', needsDecision: true, draftRevision: 2 });
    await act(async () => {});
    expect(onDraftAvailable).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ignores a late pre-save GET and a late POST receipt after a newer successful poll', async () => {
    let resolveInitial!: (value: { ok: boolean; json: () => Promise<OfficeSaveStatus> }) => void;
    let resolvePost!: (value: { ok: boolean; json: () => Promise<OfficeSaveStatus> }) => void;
    let requestId = '';
    const onSaved = vi.fn();
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        requestId = JSON.parse(String(options.body)).requestId;
        return new Promise<{ ok: boolean; json: () => Promise<OfficeSaveStatus> }>((resolve) => { resolvePost = resolve; });
      }
      if (!resolveInitial) return new Promise<{ ok: boolean; json: () => Promise<OfficeSaveStatus> }>((resolve) => { resolveInitial = resolve; });
      return Promise.resolve({ ok: true, json: async () => ({ savedVersion: 2, savedRevision: 2, lastSaveRequestId: requestId, status: 'saved' }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<OnlyOfficeSaveControls bridgeUrl="http://localhost:8081" sessionId="s1" fileId="f1" displayName="合同.docx" onSaved={onSaved} onDraftAvailable={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '另存为新版本' }));
    await act(async () => {
      resolveInitial({ ok: true, json: async () => ({ savedVersion: 1, savedRevision: 1, lastSaveRequestId: 'old', status: 'saved' }) });
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onSaved).toHaveBeenCalledWith(2);
    await act(async () => {
      resolvePost({ ok: true, json: async () => ({ pendingSave: { requestId, strategy: 'new-version' }, status: 'saving' }) });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存文档' })).toBeEnabled();
  });

  it('keeps a manually opened second save dialog across unchanged saved-state polls', async () => {
    const { fetchMock, onSaved } = setup({ savedVersion: 1, savedRevision: 1, lastSaveRequestId: 'completed', status: 'saved' });
    await act(async () => {});
    expect(onSaved).toHaveBeenCalledTimes(1);
    // Further typing may still live only in Office; the bridge keeps the old saved state.
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeEnabled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('handles a late explicit 4xx rejection for the current request after a newer GET', async () => {
    const { fetchMock } = setup({ savedVersion: 1, savedRevision: 1, lastSaveRequestId: 'completed', status: 'saved' });
    await act(async () => {});
    let rejectSave!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
      rejectSave = () => resolve({ ok: false, status: 409, json: async () => ({ error: '该版本已变化，请创建新版本。' }) });
    }));
    fireEvent.click(screen.getByRole('button', { name: '保存文档' }));
    fireEvent.click(screen.getByRole('button', { name: '覆盖当前版本' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeDisabled();
    await act(async () => { rejectSave(); });
    expect(screen.getByRole('button', { name: '另存为新版本' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('该版本已变化');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('该版本已变化');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });
});
