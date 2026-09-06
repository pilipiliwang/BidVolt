import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { backendApi } from '../shared/backend-api';
import type { AgentChatResponse, ScoreSummary } from '../shared/backend-api';
import type { AgentArtifactSummary } from '../shared/backend-api/artifacts';
import type { AgentRunStreamEnd } from '../shared/backend-api/agent-stream';
import { App } from './App';
import { BACKEND_SESSION_EXPIRED_EVENT, saveBackendSession } from './backend-session';

type OverviewProps = ComponentProps<typeof import('../domains/projects/ProjectOverviewPage').ProjectOverviewPage>;
type DrawerProps = ComponentProps<typeof import('../shared/ui/TaskProgressDrawer').TaskProgressDrawer>;
const captured = vi.hoisted(() => ({
  overview: undefined as OverviewProps | undefined,
  drawer: undefined as DrawerProps | undefined,
}));

vi.mock('../domains/projects/ProjectOverviewPage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../domains/projects/ProjectOverviewPage')>(),
  ProjectOverviewPage: (props: OverviewProps) => {
    captured.overview = props;
    return <div>Transaction test workspace</div>;
  },
}));
vi.mock('../shared/ui/TaskProgressDrawer', () => ({
  TaskProgressDrawer: (props: DrawerProps) => {
    captured.drawer = props;
    return null;
  },
}));
vi.mock('./api-test-panel-gate', () => ({ shouldShowApiTestPanel: () => false }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const streamEnd: AgentRunStreamEnd = {
  type: 'end', actionList: [], error: null, outcome: 'complete', reason: null, sessionId: 'session-4', status: 3,
};
const project = {
  project_id: 7, name: 'Transaction test project', tender_no: null, buyer: null,
  deadline: null, status: 3, note: null, updated_at: '2026-09-05T00:00:00Z', summary: null,
};
const task = {
  task_id: 4, task_type: 'agent_pipeline', status: 3, retry_count: 0,
  progress: { phase: 'agent_pipeline', percent: 100 }, result: { outcome: 'complete' },
};
const artifact: AgentArtifactSummary = {
  artifact_id: 91, project_id: 7, task_id: 4, kind: 'docx',
  name: '商务文件/商务响应.docx', filename: '商务响应.docx', group: '商务文件',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  bytes: 1024, version_no: 2, is_internal: false, status: 'ready',
  created_at: '2026-09-05T00:00:00Z', updated_at: '2026-09-06T00:00:00Z',
  download_url: 'https://untrusted.example.invalid/not-an-authoritative-download',
};
const score: ScoreSummary = {
  score_id: 101, review_run_id: null, snapshot_id: null, total_score: 60,
  missing_count: 3, improvable: 8, detail: {}, scale: 'score_rules',
  full_marks: 80, got_marks: 60, deliverable_versions: { '25': 2 },
  is_stale: false, stale_reasons: [],
};

beforeEach(() => {
  captured.overview = undefined;
  captured.drawer = undefined;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/projects/7/overview');
  saveBackendSession({ access_token: 'test-access', refresh_token: 'test-refresh' }, { remember: false });
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Unmocked network request is forbidden'))));
  vi.spyOn(backendApi.auth, 'me').mockResolvedValue({
    email: 'test@example.invalid', enterprise_id: 1, enterprise_name: 'Test tenant', user_id: 1, permissions: [],
  });
  vi.spyOn(backendApi.projects, 'listAll').mockResolvedValue([project]);
  vi.spyOn(backendApi.projects, 'get').mockResolvedValue(project);
  vi.spyOn(backendApi.enterprise, 'listAssets').mockResolvedValue([]);
  vi.spyOn(backendApi.enterprise, 'listCategories').mockResolvedValue([]);
  vi.spyOn(backendApi.review, 'listProviders').mockResolvedValue([]);
  vi.spyOn(backendApi.files, 'imageDescribeProgress').mockResolvedValue({} as never);
  vi.spyOn(backendApi.files, 'listAll').mockResolvedValue([]);
  vi.spyOn(backendApi.files, 'projectMaterials').mockResolvedValue([]);
  vi.spyOn(backendApi.requirements, 'list').mockResolvedValue([]);
  vi.spyOn(backendApi.snapshots, 'list').mockResolvedValue({ items: [] } as never);
  vi.spyOn(backendApi.tenderNotices, 'list').mockResolvedValue({ items: [] } as never);
  vi.spyOn(backendApi.tasks, 'list').mockResolvedValue({ items: [task] } as never);
  vi.spyOn(backendApi.deliverables, 'list').mockResolvedValue([]);
  vi.spyOn(backendApi.deliverables, 'listVersions').mockResolvedValue([]);
  vi.spyOn(backendApi.artifacts, 'listAll').mockResolvedValue([]);
  vi.spyOn(backendApi.review, 'listRuns').mockResolvedValue({ items: [] } as never);
  vi.spyOn(backendApi.review, 'latestScore').mockResolvedValue(undefined as never);
  vi.spyOn(backendApi.quotes, 'list').mockResolvedValue({ items: [] } as never);
  vi.spyOn(backendApi.agent, 'status').mockResolvedValue({ ...task, error: null, customer: {} });
  vi.spyOn(backendApi.agent, 'questions').mockResolvedValue({});
  vi.spyOn(backendApi.agent, 'stream').mockImplementation(async (_project, _task, options) => {
    if (!options.since) options.onMessage({ type: 'message', seq: 3, kind: 'final', content: '旧任务已完成' });
    return streamEnd;
  });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:test-package');
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountReady() {
  render(<App />);
  await waitFor(() => expect(captured.overview?.agentRun?.streamState).toBe('ended'));
  expect(fetch).not.toHaveBeenCalled();
}

describe('App Agent request boundaries', () => {
  it('fetches current project details before patching editable fields and preserves notes and unrelated metadata', async () => {
    await mountReady();
    const freshNote = '后端新追加的业务备注\n\n[BidVolt 项目扩展信息 v1]\n'
      + JSON.stringify({ authorName: '陈工', packageNo: '包 01', externalField: { preserve: true } })
      + '\n[/BidVolt 项目扩展信息]\n保留尾部说明';
    const freshProject = { ...project, note: freshNote, tender_no: 'TENDER-2026', buyer: '原招标人' };
    vi.mocked(backendApi.projects.get).mockResolvedValue(freshProject);
    const update = vi.spyOn(backendApi.projects, 'update').mockImplementation(async (_id, body) => ({ ...freshProject, ...body }));
    const readsBeforeSave = vi.mocked(backendApi.projects.get).mock.calls.length;
    await act(async () => {
      await captured.overview!.onUpdateProjectDetails!({ title: '  调整后的项目  ', packageNo: '包 02', deadline: '2026-10-12 16:30' });
    });
    expect(backendApi.projects.get).toHaveBeenCalledTimes(readsBeforeSave + 1);
    const body = update.mock.calls[0]?.[1];
    expect(update).toHaveBeenCalledExactlyOnceWith('7', expect.objectContaining({
      name: '调整后的项目', deadline: new Date('2026-10-12 16:30').toISOString(),
    }));
    expect(body).not.toHaveProperty('tender_no');
    expect(body).not.toHaveProperty('buyer');
    expect(body?.note).toContain('后端新追加的业务备注');
    expect(body?.note).toContain('保留尾部说明');
    expect(body?.note).toContain('"authorName":"陈工"');
    expect(body?.note).toContain('"packageNo":"包 02"');
    expect(body?.note).toContain('"externalField":{"preserve":true}');
    const latestReadOrder = vi.mocked(backendApi.projects.get).mock.invocationCallOrder.at(-1)!;
    expect(latestReadOrder).toBeLessThan(update.mock.invocationCallOrder[0]);
    expect(captured.overview?.project).toMatchObject({ title: '调整后的项目', packageNo: '包 02', buyer: '原招标人' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not patch a project if its latest metadata could not be read', async () => {
    await mountReady();
    const failure = new Error('无法读取最新项目信息');
    vi.mocked(backendApi.projects.get).mockRejectedValue(failure);
    const update = vi.spyOn(backendApi.projects, 'update');
    await act(async () => {
      await expect(captured.overview!.onUpdateProjectDetails!({ packageNo: '包 03' })).rejects.toBe(failure);
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('loads and downloads formal artifacts with their artifact identity rather than file or deliverable IDs', async () => {
    vi.mocked(backendApi.artifacts.listAll).mockResolvedValue([artifact]);
    const blob = new Blob(['real document bytes'], { type: artifact.mime });
    const download = vi.spyOn(backendApi.artifacts, 'download').mockResolvedValue(blob);
    const fileDownload = vi.spyOn(backendApi.files, 'download');
    const versionDownload = vi.spyOn(backendApi.deliverables, 'downloadVersion');
    const versionContent = vi.spyOn(backendApi.deliverables, 'getVersion');
    await mountReady();
    const file = captured.overview!.artifactFiles![0];
    expect(file).toMatchObject({ id: 'artifact:7:91', name: '商务响应.docx', versionLabel: 'v2' });
    expect(file).not.toHaveProperty('fileId');
    let preview: unknown;
    await act(async () => { preview = await captured.overview!.onLoadResourcePreview!(file.id, file.name); });
    expect(preview).toMatchObject({ kind: 'office', blob, mimeType: artifact.mime });
    expect(download).toHaveBeenCalledExactlyOnceWith('7', '91');
    await act(async () => { await captured.overview!.onDownloadArtifact!(file); });
    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenLastCalledWith('7', '91');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(fileDownload).not.toHaveBeenCalled();
    expect(versionDownload).not.toHaveBeenCalled();
    expect(versionContent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects artifact preview and download identities from another project before making a request', async () => {
    vi.mocked(backendApi.artifacts.listAll).mockResolvedValue([artifact]);
    const download = vi.spyOn(backendApi.artifacts, 'download');
    await mountReady();
    const file = captured.overview!.artifactFiles![0];
    await act(async () => {
      await expect(captured.overview!.onLoadResourcePreview!('artifact:8:91', file.name)).rejects.toThrow();
      await expect(captured.overview!.onDownloadArtifact!({ ...file, id: 'artifact:8:91' })).rejects.toThrow();
    });
    expect(download).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('refreshes actual scoring data and the artifact catalog when the user selects a result version', async () => {
    vi.mocked(backendApi.artifacts.listAll).mockResolvedValue([artifact]);
    vi.mocked(backendApi.deliverables.list).mockResolvedValue([{ deliverable_id: 25, project_id: 7, deliverable_type: 1, title: '商务文件', current_version_no: 2 }]);
    vi.mocked(backendApi.review.latestScore).mockResolvedValue(score);
    await mountReady();
    await waitFor(() => expect(captured.overview?.outcomeReview?.score?.total).toBe(60));
    const scoreCalls = vi.mocked(backendApi.review.latestScore).mock.calls.length;
    const artifactCalls = vi.mocked(backendApi.artifacts.listAll).mock.calls.length;
    vi.mocked(backendApi.review.latestScore).mockResolvedValue({ ...score, score_id: 102, total_score: 72, got_marks: 72, missing_count: 1 });
    await act(async () => { await captured.overview!.onRefreshProjectResults!({ reason: 'version-select', version: '2' }); });
    expect(vi.mocked(backendApi.review.latestScore).mock.calls.length).toBeGreaterThan(scoreCalls);
    expect(backendApi.review.latestScore).toHaveBeenLastCalledWith('7');
    expect(vi.mocked(backendApi.artifacts.listAll).mock.calls.length).toBeGreaterThan(artifactCalls);
    expect(captured.overview?.outcomeReview?.score).toMatchObject({ total: 72, fullMarks: 80, scale: 'score_rules', missingMaterials: 1, versionLabel: '成果 #25 · V2' });
    expect(captured.overview?.outcomeReview?.state).toBe('ready');
  });

  it('keeps a score stale after a local Office save even if the backend still calls the old score current', async () => {
    vi.mocked(backendApi.artifacts.listAll).mockResolvedValue([artifact]);
    vi.mocked(backendApi.deliverables.list).mockResolvedValue([{ deliverable_id: 25, project_id: 7, deliverable_type: 1, title: '商务文件', current_version_no: 2 }]);
    vi.mocked(backendApi.review.latestScore).mockResolvedValue(score);
    const remoteSave = vi.spyOn(backendApi.artifacts, 'save');
    await mountReady();
    await waitFor(() => expect(captured.overview?.outcomeReview?.state).toBe('ready'));
    await act(async () => {
      await captured.overview!.onRefreshProjectResults!({ reason: 'office-save', fileId: 'artifact:7:91', version: 3, localOnly: true });
    });
    expect(captured.overview?.outcomeReview).toMatchObject({ state: 'stale', score: { total: 60 } });
    expect(remoteSave).not.toHaveBeenCalled();
    expect(captured.overview?.artifactFiles?.[0]).toHaveProperty('versionLabel', 'v2');
    await act(async () => { await captured.overview!.onRefreshProjectResults!({ reason: 'version-select', version: '2' }); });
    expect(captured.overview?.outcomeReview?.state).toBe('stale');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares the real package Promise across overview, drawer and repeated same-frame clicks', async () => {
    const download = deferred<Blob>();
    const request = vi.spyOn(backendApi.agent, 'responsePackage').mockReturnValue(download.promise);
    await mountReady();
    let first: ReturnType<NonNullable<OverviewProps['onDownloadAllResults']>>;
    let second: ReturnType<NonNullable<DrawerProps['onDownloadResponsePackage']>>;
    act(() => {
      first = captured.overview!.onDownloadAllResults!();
      second = captured.drawer!.onDownloadResponsePackage!();
      expect(captured.overview!.onDownloadAllResults!()).toBe(first);
    });
    expect(first!).toBeInstanceOf(Promise);
    expect(second!).toBe(first!);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(captured.drawer?.downloadingPackage).toBe(true);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    await act(async () => {
      download.resolve(new Blob(['zip']));
      await first;
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(captured.drawer?.downloadingPackage).toBe(false);
  });

  it('propagates a failed package request and allows an explicit later retry', async () => {
    const failure = new Error('无法生成成果包');
    const request = vi.spyOn(backendApi.agent, 'responsePackage')
      .mockRejectedValueOnce(failure).mockResolvedValue(new Blob(['zip']));
    await mountReady();
    await act(async () => {
      await expect(captured.overview!.onDownloadAllResults!()).rejects.toBe(failure);
    });
    expect(captured.drawer?.downloadingPackage).toBe(false);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    await act(async () => { await captured.drawer!.onDownloadResponsePackage!(); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('does not download a stale tenant Blob or resolve that old action as successful', async () => {
    const download = deferred<Blob>();
    vi.spyOn(backendApi.agent, 'responsePackage').mockReturnValue(download.promise);
    await mountReady();
    let completion!: Promise<unknown>;
    act(() => {
      completion = Promise.resolve(captured.overview!.onDownloadAllResults!()).catch((error: unknown) => error);
    });
    await act(async () => { await Promise.resolve(); });
    act(() => window.dispatchEvent(new Event(BACKEND_SESSION_EXPIRED_EVENT)));
    let outcome: unknown;
    await act(async () => {
      download.resolve(new Blob(['old tenant zip']));
      outcome = await completion;
    });
    expect(outcome).toMatchObject({ name: 'AbortError' });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('reopens ended SSE at the last sequence before chat and after an early terminal replay, without another POST', async () => {
    const chat = deferred<AgentChatResponse>();
    const send = vi.spyOn(backendApi.agent, 'chat').mockReturnValue(chat.promise);
    await mountReady();
    expect(backendApi.agent.stream).toHaveBeenCalledTimes(1);
    let completion!: ReturnType<NonNullable<OverviewProps['onAssistantSend']>>;
    act(() => { completion = captured.overview!.onAssistantSend!('继续核对', 'queue'); });
    await waitFor(() => expect(backendApi.agent.stream).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(captured.overview?.agentRun?.streamState).toBe('ended'));
    expect(vi.mocked(backendApi.agent.stream).mock.calls[1][2].since).toBe(3);
    await act(async () => {
      chat.resolve({ reply: '已核对', session_id: 'session-4' });
      await completion;
    });
    await waitFor(() => expect(backendApi.agent.stream).toHaveBeenCalledTimes(3));
    expect(vi.mocked(backendApi.agent.stream).mock.calls[2][2].since).toBe(3);
    expect(send).toHaveBeenCalledExactlyOnceWith('7', '4', { message: '继续核对', mode: 'queue' });
    expect(captured.overview?.agentRun?.completion).toBe('complete');
  });

  it('does not reopen a stale tenant stream when an old chat response settles', async () => {
    const chat = deferred<AgentChatResponse>();
    vi.spyOn(backendApi.agent, 'chat').mockReturnValue(chat.promise);
    await mountReady();
    let completion!: Promise<unknown>;
    act(() => {
      completion = Promise.resolve(captured.overview!.onAssistantSend!('旧企业消息', 'queue'))
        .catch((error: unknown) => error);
    });
    await waitFor(() => expect(backendApi.agent.stream).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new Event(BACKEND_SESSION_EXPIRED_EVENT)));
    let outcome: unknown;
    await act(async () => {
      chat.resolve({ reply: '旧企业回复', session_id: 'session-4' });
      outcome = await completion;
    });
    expect(outcome).toMatchObject({ name: 'AbortError' });
    expect(backendApi.agent.stream).toHaveBeenCalledTimes(2);
  });

  it('refreshes actionable questions while chatting on a completed task', async () => {
    const chat = deferred<AgentChatResponse>();
    vi.spyOn(backendApi.agent, 'chat').mockReturnValue(chat.promise);
    await mountReady();
    // Keep SSE open to prove that question refresh is not dependent on an end event.
    vi.mocked(backendApi.agent.stream).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(backendApi.agent.questions).mockResolvedValue({ asks: [{
      ask_id: 12, kind: 'question', items: [{ q: '请补充授权书', need: '签章证明', checked: '现有资料未包含' }],
      answered: false, answer: null, created_at: '2026-09-06T07:00:00Z',
    }] });
    let completion!: ReturnType<NonNullable<OverviewProps['onAssistantSend']>>;
    act(() => { completion = captured.overview!.onAssistantSend!('继续核对', 'queue'); });
    await waitFor(() => expect(captured.overview?.agentRun?.questions).toEqual([
      expect.objectContaining({ askId: '12', answered: false, items: [expect.objectContaining({ question: '请补充授权书' })] }),
    ]));
    expect(captured.overview?.agentRun?.completion).toBe('complete');
    await act(async () => { chat.resolve({ reply: null, session_id: 'session-4', status: 'processed' }); await completion; });
  });

  it('does not announce a definite send failure when the chat receipt is lost', async () => {
    vi.spyOn(backendApi.agent, 'chat').mockRejectedValue(Object.assign(new Error('后端请求失败'), { status: 503 }));
    await mountReady();
    await act(async () => {
      await expect(captured.overview!.onAssistantSend!('检查一下', 'queue')).rejects.toMatchObject({ status: 503 });
    });
    // Informational receipt uncertainty belongs in the local message timeline;
    // the global banner renders definitive errors only.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('后端请求失败')).not.toBeInTheDocument();
  });

  it('preserves the original action-list boundary across a chat stream and repeated status reloads', async () => {
    const actionList = ['旧任务需要确认的事项'];
    vi.mocked(backendApi.agent.status).mockResolvedValue({
      ...task, result: { outcome: 'complete', action_list: actionList }, error: null, customer: {},
    });
    vi.mocked(backendApi.agent.stream).mockImplementation(async (_project, _task, options) => {
      options.onMessage({
        type: 'message', seq: options.since ? 4 : 3, kind: 'final',
        content: options.since ? '这是一条新回复' : '旧任务已完成',
      });
      return { ...streamEnd, actionList };
    });
    vi.spyOn(backendApi.agent, 'chat').mockResolvedValue({ reply: '这是一条新回复', session_id: 'session-4' });
    await mountReady();
    expect(captured.overview?.agentRun?.actionListAfterSequence).toBe(3);
    const statusCalls = vi.mocked(backendApi.agent.status).mock.calls.length;
    await act(async () => { await captured.overview!.onAssistantSend!('新消息', 'queue'); });
    await waitFor(() => expect(vi.mocked(backendApi.agent.status).mock.calls.length).toBeGreaterThan(statusCalls));
    await waitFor(() => expect(captured.overview?.agentRun?.conversation.at(-1)?.seq).toBe(4));
    expect(captured.overview?.agentRun?.actionListAfterSequence).toBe(3);
  });
});
