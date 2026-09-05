import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AgentMessageQueueResponse, useAgentMessageQueue } from './useAgentMessageQueue';

function deferred() {
  let resolve!: (value: AgentMessageQueueResponse) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<AgentMessageQueueResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.useRealTimers());

describe('useAgentMessageQueue', () => {
  it('dispatches the first message immediately, then drains normal messages FIFO', async () => {
    const first = deferred();
    const second = deferred();
    const onSend = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue({});
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 'project-1', onSend }));
    act(() => {
      expect(result.current.send('first', { summary: 'short', afterSequence: 17 })?.queued).toBe(false);
      expect(result.current.send('second')?.queued).toBe(true);
      result.current.send('third');
    });
    expect(onSend.mock.calls).toEqual([['first', 'queue']]);
    expect(result.current.localMessages).toEqual([expect.objectContaining({
      content: 'short', echoContent: 'first', role: 'user', status: 'waiting', afterSequence: 17,
    })]);
    expect(result.current.queuedMessages.map((message) => message.content)).toEqual(['second', 'third']);
    await act(async () => first.resolve({ reply: 'first reply' }));
    expect(onSend.mock.calls).toEqual([['first', 'queue'], ['second', 'queue']]);
    expect(result.current.localMessages.find((message) => message.role === 'agent')?.content).toBe('first reply');
    await act(async () => second.resolve({ queued: true }));
    expect(onSend.mock.calls).toEqual([['first', 'queue'], ['second', 'queue'], ['third', 'queue']]);
    expect(result.current.queuedMessages).toEqual([]);
    expect(result.current.localMessages.filter((message) => message.role === 'user').map((message) => message.status)).toEqual(['sent', 'accepted', 'accepted']);
    expect(result.current.hasInFlight).toBe(false);
  });

  it('deletes only unsent local entries, and never submits or revives them', async () => {
    const request = deferred();
    const onSend = vi.fn().mockReturnValue(request.promise);
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    let submitted = '';
    let deleted = '';
    act(() => {
      submitted = result.current.send('submitted')!.id;
      deleted = result.current.send('never submit')!.id;
    });
    act(() => {
      expect(result.current.deleteQueued(submitted)).toBe(false);
      expect(result.current.deleteQueued(result.current.queuedMessages[0])).toBe(true);
      expect(result.current.deleteQueued(deleted)).toBe(false);
    });
    await act(async () => request.resolve({ reply: 'late result' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.localMessages.some((message) => message.id === deleted)).toBe(false);
    expect(result.current.queuedMessages).toHaveLength(0);
  });

  it('dispatches a queued steer once and blocks normal dispatch until every active request settles', async () => {
    const first = deferred();
    const steering = deferred();
    const onSend = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(steering.promise).mockResolvedValue({});
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    let steerId = '';
    act(() => {
      result.current.send('first');
      steerId = result.current.send('steering')!.id;
      result.current.send('normal');
      expect(result.current.steer(steerId)).toBe(true);
      expect(result.current.steer(steerId)).toBe(false);
      expect(result.current.deleteQueued(steerId)).toBe(false);
    });
    expect(onSend.mock.calls).toEqual([['first', 'queue'], ['steering', 'steer']]);
    await act(async () => first.resolve({}));
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(result.current.hasInFlight).toBe(true);
    await act(async () => steering.resolve({ reply: 'changed' }));
    expect(onSend.mock.calls).toEqual([['first', 'queue'], ['steering', 'steer'], ['normal', 'queue']]);
  });

  it('keeps a slow open request waiting, without retrying or submitting queued messages until its reply', async () => {
    vi.useFakeTimers();
    const first = deferred();
    const failure = vi.fn();
    const onSend = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({});
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend, timeoutMs: 100 }));
    act(() => {
      result.current.send('slow', { onFailure: failure });
      result.current.send('next');
      vi.advanceTimersByTime(100);
    });
    expect(result.current.localMessages[0]).toMatchObject({
      status: 'waiting', error: null, notice: '处理时间较长，仍在等待 BidVolt 回复。',
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.hasInFlight).toBe(true);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.queuedMessages.map((message) => message.content)).toEqual(['next']);
    await act(async () => first.resolve({ reply: 'late reply' }));
    expect(result.current.localMessages[0].status).toBe('sent');
    expect(result.current.localMessages[0].error).toBeNull();
    expect(result.current.localMessages[0].notice).toBeNull();
    expect(result.current.localMessages.filter((message) => message.role === 'agent')).toHaveLength(1);
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers from rejected requests, invokes attachment recovery, and continues FIFO', async () => {
    const first = deferred();
    const onFailure = vi.fn();
    const onSend = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({});
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    act(() => {
      result.current.send('first', { onFailure });
      result.current.send('next');
    });
    const error = new Error('offline');
    await act(async () => first.reject(error));
    expect(onFailure).toHaveBeenCalledWith(error);
    expect(result.current.localMessages[0]).toMatchObject({ status: 'failed', error: 'offline' });
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(result.current.hasInFlight).toBe(false);
  });

  it('handles synchronous errors and backend nonzero return codes as failed', async () => {
    const onFailure = vi.fn();
    const onSend = vi.fn()
      .mockImplementationOnce(() => { throw new Error('sync failure'); })
      .mockResolvedValue({ returncode: 1, message: 'backend failure', queued: true });
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    act(() => result.current.send('sync', { onFailure }));
    await act(async () => { result.current.send('backend', { onFailure }); });
    expect(result.current.localMessages.map((message) => message.status)).toEqual(['failed', 'failed']);
    expect(result.current.localMessages[1].error).toBe('backend failure');
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(false);
  });

  it.each([
    Object.assign(new Error('connection lost'), { status: 0 }),
    Object.assign(new Error('gateway failure'), { status: 503 }),
    Object.assign(new Error('request timed out'), { status: 408 }),
    new DOMException('aborted', 'AbortError'),
    new DOMException('timed out', 'TimeoutError'),
    new TypeError('Failed to fetch'),
  ])('keeps uncertain request errors unconfirmed without attachment recovery or resubmitting the same job: %s', async (error) => {
    const first = deferred();
    const onFailure = vi.fn();
    const onSend = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({});
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    act(() => {
      result.current.send('uncertain original', { onFailure });
      result.current.send('different next');
    });
    await act(async () => first.reject(error));
    expect(result.current.localMessages[0]).toMatchObject({ status: 'unconfirmed' });
    expect(result.current.localMessages[0].notice).toContain('请勿重复发送');
    expect(result.current.localMessages[0].error).toBe(error.message);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSend.mock.calls).toEqual([['uncertain original', 'queue'], ['different next', 'queue']]);
    expect(result.current.hasInFlight).toBe(false);
    expect(result.current.queuedMessages).toHaveLength(0);
  });

  it.each([
    undefined, {}, { queued: false }, { queued: true }, { reply: null }, { returncode: 0, reply: '  \n' },
  ])('does not claim a completed reply or create an Agent output for an acknowledgement: %j', async (response) => {
    const onSend = vi.fn().mockResolvedValue(response);
    const onFailure = vi.fn();
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    await act(async () => { result.current.send('需要真实回复', { onFailure }); });
    expect(result.current.localMessages).toHaveLength(1);
    expect(result.current.localMessages[0]).toMatchObject({ role: 'user', status: 'accepted', error: null });
    expect(result.current.hasInFlight).toBe(false);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('keeps a raw runtime-only HTTP response waiting instead of rendering it as an Agent reply', async () => {
    const onSend = vi.fn().mockResolvedValue({
      returncode: 0,
      reply: '┌─ Reasoning ─────\n│ 不应该出现在会话中的内部分析\n│ python build.py\n',
    });
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    await act(async () => { result.current.send('请整理结果'); });
    expect(result.current.localMessages).toHaveLength(1);
    expect(result.current.localMessages[0].status).toBe('accepted');
    expect(JSON.stringify(result.current.localMessages)).not.toContain('内部分析');
  });

  it('emits only the public HTTP reply with its originating message id', async () => {
    const onSend = vi.fn().mockResolvedValue({
      returncode: 0,
      reply: '┌─ Reasoning ─────\n│ 内部处理过程\n╭─ Hermes ─────\n│ 已完成核对，请查看清单。\n╰─────────',
    });
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    await act(async () => { result.current.send('请核对'); });
    expect(result.current.localMessages).toHaveLength(2);
    expect(result.current.localMessages[0].status).toBe('sent');
    expect(result.current.localMessages[1]).toMatchObject({
      role: 'agent', content: '已完成核对，请查看清单。',
      replyToMessageId: result.current.localMessages[0].id,
    });
    expect(JSON.stringify(result.current.localMessages)).not.toContain('内部处理过程');
  });

  it('replaces only the slow waiting notice with a definitive failure and keeps its details', async () => {
    vi.useFakeTimers();
    const request = deferred();
    const onFailure = vi.fn();
    const onSend = vi.fn().mockReturnValue(request.promise);
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend, timeoutMs: 100 }));
    act(() => {
      result.current.send('slow rejected', { onFailure });
      vi.advanceTimersByTime(100);
    });
    await act(async () => request.reject(Object.assign(new Error('任务不存在'), { status: 404 })));
    expect(result.current.localMessages[0]).toMatchObject({ status: 'failed', error: '任务不存在', notice: null });
    expect(result.current.hasInFlight).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('treats an explicit client rejection as failed and permits attachment recovery', async () => {
    const error = Object.assign(new Error('not authorized'), { status: 403 });
    const onSend = vi.fn().mockRejectedValue(error);
    const onFailure = vi.fn();
    const { result } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    await act(async () => { result.current.send('rejected', { onFailure }); });
    expect(result.current.localMessages[0]).toMatchObject({ status: 'failed', error: 'not authorized' });
    expect(onFailure).toHaveBeenCalledWith(error);
  });

  it('uses the latest callback for delayed queue dispatch', async () => {
    const first = deferred();
    const oldSend = vi.fn().mockReturnValue(first.promise);
    const newSend = vi.fn().mockResolvedValue({ reply: 'new callback' });
    const { result, rerender } = renderHook(({ onSend }) => useAgentMessageQueue({ scopeKey: 1, onSend }), {
      initialProps: { onSend: oldSend },
    });
    act(() => {
      result.current.send('first');
      result.current.send('second');
    });
    rerender({ onSend: newSend });
    await act(async () => first.resolve({}));
    expect(oldSend).toHaveBeenCalledTimes(1);
    expect(newSend).toHaveBeenCalledWith('second', 'queue');
  });

  it('does not send an old project queue or apply late replies after scope changes', async () => {
    vi.useFakeTimers();
    const old = deferred();
    const recovery = vi.fn();
    const onSend = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ reply: 'current' });
    const { result, rerender } = renderHook(({ scopeKey }) => useAgentMessageQueue({ scopeKey, onSend }), {
      initialProps: { scopeKey: 1 },
    });
    act(() => {
      result.current.send('old active', { onFailure: recovery });
      result.current.send('old queued');
    });
    rerender({ scopeKey: 2 });
    expect(result.current.localMessages).toHaveLength(0);
    expect(result.current.queuedMessages).toHaveLength(0);
    expect(result.current.hasInFlight).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { result.current.send('new'); });
    await act(async () => old.reject(new Error('late old failure')));
    expect(onSend.mock.calls).toEqual([['old active', 'queue'], ['new', 'queue']]);
    expect(recovery).not.toHaveBeenCalled();
    expect(result.current.localMessages.map((message) => message.content)).toEqual(['new', 'current']);
  });

  it('cleans up timers and never drains or invokes callbacks after unmount', async () => {
    vi.useFakeTimers();
    const request = deferred();
    const onFailure = vi.fn();
    const onSend = vi.fn().mockReturnValue(request.promise);
    const { result, unmount } = renderHook(() => useAgentMessageQueue({ scopeKey: 1, onSend }));
    act(() => {
      result.current.send('active', { onFailure });
      result.current.send('queued');
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => request.reject(new Error('after unmount')));
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
