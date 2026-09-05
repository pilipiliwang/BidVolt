import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { backendApi } from '../shared/backend-api';
import type { AgentChatResponse } from '../shared/backend-api';
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
