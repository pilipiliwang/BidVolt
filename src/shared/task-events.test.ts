import { describe, expect, it } from 'vitest';

import { parseAgentRunStreamEvent } from './backend-api/agent-stream';
import {
  applyAgentStreamEnd,
  agentRunToPublicTaskEvent,
  createAgentRunViewModel,
  getAgentQuestionWindow,
  isAgentRunTerminal,
  mergeAgentConversationMessages,
  mergeAgentStreamMessage,
  normalizeAgentQuestions,
  normalizeAgentRunStatus,
  resolveAgentRunCompletion,
} from './task-events';

describe('Agent run view state', () => {
  it('captures an action-list boundary at stream end and preserves it across later chat and repeated end events', () => {
    const active = createAgentRunViewModel({ task_id: 1773, status: 2 }, { projectId: 53,
      conversation: [{ seq: 10, kind: 'hermes', content: '成果生成完成。' }],
    });
    const ended = applyAgentStreamEnd(active, { status: 3, outcome: 'complete', action_list: ['请盖章'] });
    expect(ended.actionListAfterSequence).toBe(10);
    const chatting = mergeAgentStreamMessage(ended, { seq: 15, kind: 'hermes', content: '后续聊天回复。' });
    expect(chatting.actionListAfterSequence).toBe(10);
    expect(applyAgentStreamEnd(chatting, { status: 3, outcome: 'complete' }).actionListAfterSequence).toBe(10);
    expect(applyAgentStreamEnd(chatting, { status: 3, outcome: 'complete', action_list: ['请盖章'] }).actionListAfterSequence).toBe(10);
    expect(applyAgentStreamEnd(chatting, { status: 3, outcome: 'complete', action_list: ['新提示'] }).actionListAfterSequence).toBe(15);
  });

  it('preserves an unchanged action-list anchor on same-task status refreshes only', () => {
    const source = { task_id: 1773, status: 3, result: { action_list: ['请盖章'] } };
    const initial = createAgentRunViewModel(source, { projectId: 53,
      conversation: [{ seq: 10, kind: 'hermes', content: '完成' }],
    });
    const conversation = [...initial.conversation, { seq: 15, kind: 'hermes', content: '后续回复' }];
    const refreshed = createAgentRunViewModel(source, { projectId: 53, conversation, previousRun: initial });
    expect(refreshed.actionListAfterSequence).toBe(10);
    const changed = createAgentRunViewModel({ ...source, result: { action_list: ['新提示'] } }, {
      projectId: 53, conversation, previousRun: refreshed,
    });
    expect(changed.actionListAfterSequence).toBe(15);
    const otherTask = createAgentRunViewModel({ ...source, task_id: 1774 }, {
      projectId: 53, conversation: [{ seq: 2, kind: 'hermes', content: '新任务' }], previousRun: refreshed,
    });
    expect(otherTask.actionListAfterSequence).toBe(2);
  });

  it('waits for loaded history before fixing an action-list sequence and ignores invalid sequences', () => {
    const source = { task_id: 1773, status: 3, result: { action_list: ['请盖章'] } };
    const unloaded = createAgentRunViewModel(source, { projectId: 53 });
    expect(unloaded.actionListAfterSequence).toBeNull();
    const loaded = createAgentRunViewModel(source, { projectId: 53, previousRun: unloaded,
      conversation: [{ seq: Number.NaN, kind: 'hermes', content: 'bad' }, { seq: 12, kind: 'hermes', content: '完成' }],
    });
    expect(loaded.actionListAfterSequence).toBe(12);
    expect(createAgentRunViewModel({ task_id: 1773 }, { projectId: 53, previousRun: loaded }).actionListAfterSequence).toBeNull();
  });

  it('keeps the Agent numeric status contract separate from legacy retrying tasks', () => {
    expect(normalizeAgentRunStatus(1)).toBe('queued');
    expect(normalizeAgentRunStatus(2)).toBe('running');
    expect(normalizeAgentRunStatus(3)).toBe('succeeded');
    expect(normalizeAgentRunStatus(4)).toBe('failed_retryable');
    expect(normalizeAgentRunStatus(5)).toBe('cancelled');
    expect(normalizeAgentRunStatus(6)).toBe('failed');
    expect(isAgentRunTerminal('failed_retryable')).toBe(true);
    expect(resolveAgentRunCompletion('succeeded', null)).toBe('unknown_terminal');
    expect(resolveAgentRunCompletion('succeeded', 'complete')).toBe('complete');
    expect(resolveAgentRunCompletion('succeeded', 'incomplete')).toBe('incomplete');
  });

  it('builds a truthful, clamped view model from the latest status and customer state', () => {
    const run = createAgentRunViewModel({
      task_id: 1773,
      status: 3,
      progress: {
        phase: 'package_response',
        percent: 104.8,
        current_work: '响应文件包已落库',
      },
      result: {
        outcome: 'incomplete',
        reason: '企业授权资料尚未补齐',
        session_id: 'session-20260830',
        action_list: ['在授权委托书加盖公章'],
      },
      customer: {
        asks: [{
          ask_id: 13,
          kind: 'question',
          items: [{ q: '被授权人是谁？', need: '填写授权书', checked: '企业资料未找到' }],
          answered: false,
          answer: null,
          created_at: '2026-08-30T07:21:55Z',
          window_minutes: 20,
          timeout_notified: false,
        }],
      },
    }, {
      projectId: 53,
      streamState: 'connected',
      conversation: [{ seq: 2, kind: 'hermes', content: '已完成材料核验' }],
    });

    expect(run).toMatchObject({
      actionList: ['在授权委托书加盖公章'],
      completion: 'incomplete',
      message: '响应文件包已落库',
      outcome: 'incomplete',
      percent: 100,
      phase: 'package_response',
      projectId: '53',
      reason: '企业授权资料尚未补齐',
      sessionId: 'session-20260830',
      status: 'succeeded',
      streamState: 'connected',
      taskId: '1773',
    });
    expect(run.questions[0]).toMatchObject({
      askId: '13',
      answered: false,
      items: [{
        question: '被授权人是谁？',
        need: '填写授权书',
        checked: '企业资料未找到',
      }],
    });

    expect(agentRunToPublicTaskEvent(run)).toMatchObject({
      task_id: '1773',
      task_type: 'agent_pipeline',
      phase: 'package_response',
      status: 'succeeded',
      percent: 100,
      public_message: '响应文件包已落库',
    });
  });

  it('normalizes multiple question groups and preserves answered responses', () => {
    const questions = normalizeAgentQuestions([
      {
        ask_id: 13,
        kind: 'question',
        items: ['开户行是什么？', { q: '开户账号是什么？' }],
        answered: 1,
        answer: ['XX银行', '123456'],
      },
      { ask_id: 14, kind: 'action', items: ['加盖公章'] },
      { legacy: true, items: [{ q: '联系人是谁？' }] },
    ]);

    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({
      answer: ['XX银行', '123456'],
      answered: true,
      askId: '13',
    });
    expect(questions[1]).toMatchObject({ askId: '14', kind: 'action', legacy: false });
    expect(questions[2]).toMatchObject({ askId: 'legacy-3', legacy: true });
  });

  it('reports open and expired question windows without disabling late answers', () => {
    const [question] = normalizeAgentQuestions([{
      ask_id: 13,
      items: ['请确认联系人'],
      answered: false,
      created_at: '2026-09-01T00:00:00Z',
      window_minutes: 20,
    }]);

    expect(getAgentQuestionWindow(question, Date.parse('2026-09-01T00:05:30Z'))).toMatchObject({
      label: '剩余 14 分 30 秒，超时后主会话将自行决定',
      state: 'open',
    });
    expect(getAgentQuestionWindow(question, Date.parse('2026-09-01T00:21:00Z'))).toMatchObject({
      state: 'expired',
    });
  });

  it('deduplicates and sorts replayed SSE messages while keeping the newest window', () => {
    const messages = mergeAgentConversationMessages(
      [
        { seq: 1, kind: 'service', content: '开始' },
        { seq: 2, kind: 'hermes', content: '旧内容' },
      ],
      [
        { seq: 2, kind: 'hermes', content: '已更新内容' },
        { seq: 3, kind: 'tool', content: '委派分析任务' },
      ],
      2,
    );

    expect(messages).toEqual([
      { seq: 2, kind: 'hermes', content: '已更新内容' },
      { seq: 3, kind: 'tool', content: '委派分析任务' },
    ]);
  });

  it('preserves whitespace-only SSE fragments while filtering empty and invalid records', () => {
    const messages = mergeAgentConversationMessages(
      [{ seq: 1, kind: 'hermes', content: 'Review' }],
      [
        { seq: 5, kind: 'hermes', content: 'print("ok")' },
        { seq: 3, kind: 'hermes', content: 'completed.' },
        { seq: 2, kind: 'hermes', content: ' ' },
        { seq: 4, kind: 'hermes', content: '\n\t    ' },
        { seq: 6, kind: 'hermes', content: '' },
        { seq: Number.NaN, kind: 'hermes', content: 'invalid' },
      ],
    );

    expect(messages.map((message) => message.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(messages.map((message) => message.content).join(''))
      .toBe('Review completed.\n\t    print("ok")');
  });

  it('keeps parsed stream whitespace through live merge, replay, polling, and completion', () => {
    const source = ['Review', ' ', 'completed.', '\n\n', '```python\n', '    ', 'print("ok")\n```'];
    let run = createAgentRunViewModel({ task_id: 1773, status: 2 }, { projectId: 53 });

    const events = source.map((content, index) => parseAgentRunStreamEvent('message', JSON.stringify({
      seq: index + 1,
      kind: 'hermes',
      content,
    })));
    for (const event of events) {
      if (event.type !== 'message') throw new Error('Expected a message event');
      run = mergeAgentStreamMessage(run, event);
    }
    const replay = events[1];
    if (replay.type !== 'message') throw new Error('Expected a message event');
    run = mergeAgentStreamMessage(run, replay);
    run = createAgentRunViewModel({ task_id: 1773, status: 2 }, {
      projectId: 53,
      conversation: run.conversation,
      streamState: run.streamState,
    });
    run = applyAgentStreamEnd(run, { status: 3, outcome: 'complete' });

    expect(run.conversation.map((message) => message.content)).toEqual(source);
    expect(run.conversation.map((message) => message.content).join('')).toBe(source.join(''));
    expect(run.conversation).toHaveLength(source.length);
    expect(run.completion).toBe('complete');
    expect(run.streamState).toBe('ended');
  });

  it('applies message and end events immediately while preserving backend outcome semantics', () => {
    const active = createAgentRunViewModel({
      task_id: 1773,
      status: 2,
      progress: { phase: 'agent_pipeline', percent: 70, current_work: '正在成文' },
    }, { projectId: 53, streamState: 'connecting' });
    const withMessage = mergeAgentStreamMessage(active, {
      seq: 51,
      kind: 'hermes',
      content: '完成技术卷初稿',
    });
    const ended = applyAgentStreamEnd(withMessage, {
      status: 3,
      outcome: 'incomplete',
      reason: '报价授权仍需人工确认',
      session_id: 'session-53',
      action_list: ['确认最终报价并盖章'],
    });

    expect(withMessage.streamState).toBe('connected');
    expect(withMessage.conversation).toEqual([
      { seq: 51, kind: 'hermes', content: '完成技术卷初稿' },
    ]);
    expect(ended).toMatchObject({
      actionList: ['确认最终报价并盖章'],
      completion: 'incomplete',
      message: '报价授权仍需人工确认',
      outcome: 'incomplete',
      percent: 100,
      reason: '报价授权仍需人工确认',
      sessionId: 'session-53',
      status: 'succeeded',
      streamState: 'ended',
    });
  });
});
