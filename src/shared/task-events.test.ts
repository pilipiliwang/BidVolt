import { describe, expect, it } from 'vitest';

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

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      answer: ['XX银行', '123456'],
      answered: true,
      askId: '13',
    });
    expect(questions[1]).toMatchObject({ askId: 'legacy-3', legacy: true });
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
