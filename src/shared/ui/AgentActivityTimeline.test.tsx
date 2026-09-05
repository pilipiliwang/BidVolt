import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentRunViewModel } from '../task-events';
import {
  AgentActivityTimeline,
  buildAgentTimelineEntries,
  groupAgentTimelineLogs,
} from './AgentActivityTimeline';

const baseRun: AgentRunViewModel = {
  actionList: [],
  completion: 'active',
  conversation: [],
  errorMessage: null,
  message: '正在生成响应文件',
  outcome: null,
  percent: 38,
  phase: 'assembly',
  projectId: '207',
  questions: [],
  reason: null,
  sessionId: 'session-207',
  status: 'running',
  streamState: 'connected',
  taskId: '904',
};

describe('AgentActivityTimeline', () => {
  it('uses the captured completion boundary instead of an old in-generation user boundary', () => {
    const entries = buildAgentTimelineEntries({ ...baseRun, actionList: ['结束后提示'], actionListAfterSequence: 10,
      conversation: [
        { seq: 5, kind: 'user', content: '生成期间补充' },
        { seq: 10, kind: 'final', content: '成果完成。' },
        { seq: 11, kind: 'final', content: '新的回复。' },
      ],
    }, [
      { id: 'old', afterSequence: 4, content: '生成期间补充' },
      { id: 'new', afterSequence: 10, content: '哈哈' },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([
      'conversation-5', 'conversation-10', 'action-list', 'local-new', 'conversation-11',
    ]);
  });

  it('places the old completion footer before a local user and the next sequenced reply', () => {
    const entries = buildAgentTimelineEntries({
      ...baseRun, completion: 'complete', status: 'succeeded',
      actionList: ['旧任务结束提示：请核对签章。'],
      conversation: [
        { seq: 10, kind: 'final', content: '旧成果已经生成。' },
        { seq: 11, kind: 'final', content: '收到，继续待命。' },
      ],
    }, [{ id: 'new-user', content: '哈哈', afterSequence: 10, status: 'sent', createdAt: '2026-09-05T01:01:00Z' }]);
    expect(entries.map((entry) => entry.id)).toEqual([
      'conversation-10', 'action-list', 'local-new-user', 'conversation-11',
    ]);
  });

  it('keeps an HTTP reply after its user echo when the echo gains a newer stream sequence', () => {
    const entries = buildAgentTimelineEntries({ ...baseRun, actionList: ['旧任务提示'], conversation: [
      { seq: 10, kind: 'final', content: '旧成果已完成。' },
      { seq: 11, kind: 'user', content: '哈哈' },
    ] }, [
      { id: 'request-1', content: '哈哈', afterSequence: 10, status: 'sent', createdAt: '2026-09-05T01:00:00Z' },
      { id: 'request-1:reply', replyToMessageId: 'request-1', role: 'agent', content: '收到。', afterSequence: 10,
        createdAt: '2026-09-05T01:00:02Z' },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([
      'conversation-10', 'action-list', 'conversation-11', 'local-request-1:reply',
    ]);
  });

  it('keeps multiple same-boundary submissions chronological and reconciles an HTTP reply only once', () => {
    const entries = buildAgentTimelineEntries({ ...baseRun, conversation: [
      { seq: 8, kind: 'user', content: '哈哈' },
      { seq: 9, kind: 'final', content: '收到第一条。' },
      { seq: 10, kind: 'user', content: '哈哈' },
    ] }, [
      { id: 'first', afterSequence: 7, content: '哈哈', createdAt: '2026-09-05T01:00:00Z' },
      { id: 'first:reply', afterSequence: 7, role: 'agent', content: '收到第一条。', createdAt: '2026-09-05T01:00:02Z' },
      { id: 'second', afterSequence: 7, content: '哈哈', createdAt: '2026-09-05T01:00:04Z' },
      { id: 'second:reply', afterSequence: 7, role: 'agent', content: '收到第二条。', createdAt: '2026-09-05T01:00:06Z' },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([
      'conversation-8', 'conversation-9', 'conversation-10', 'local-second:reply',
    ]);
  });

  it('uses local array order for equal or absent timestamps rather than lexical message IDs', () => {
    const entries = buildAgentTimelineEntries(baseRun, [
      { id: 'z-user', afterSequence: 0, content: '第一条' },
      { id: 'a-user', afterSequence: 0, content: '第二条' },
      { id: 'a-user:reply', afterSequence: 0, role: 'agent', content: '第二条的回复' },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(['local-z-user', 'local-a-user', 'local-a-user:reply']);
  });

  it('anchors older and later timestamped interactions on the correct side of a local submission', () => {
    const question = { answer: null, answered: false, legacy: false, timeoutNotified: false, windowMinutes: 20,
      items: [{ question: '请补充信息', need: '', checked: '' }] };
    const entries = buildAgentTimelineEntries({ ...baseRun, conversation: [
      { seq: 10, kind: 'final', content: '旧任务完成。' },
      { seq: 11, kind: 'final', content: '新回复。' },
    ], questions: [
      { ...question, askId: 'old', createdAt: '2026-09-05T00:00:00Z' },
      { ...question, askId: 'new', createdAt: '2026-09-05T01:00:02Z' },
    ] }, [{ id: 'user', afterSequence: 10, content: '继续', createdAt: '2026-09-05T01:00:00Z' }]);
    expect(entries.map((entry) => entry.id)).toEqual([
      'conversation-10', 'interaction-old', 'local-user', 'interaction-new', 'conversation-11',
    ]);
  });

  it('sanitizes mixed HTTP output and action_list without leaking raw reasoning through disclosure', async () => {
    const user = userEvent.setup();
    const privateContent = '这里是内部分析，不能暴露给用户。';
    render(<AgentActivityTimeline run={{ ...baseRun, actionList: [
      `<think>${privateContent}</think><final>请核对签章。</final>`,
    ] }} localMessages={[
      { id: 'request', content: '哈哈', role: 'user', afterSequence: 0 },
      { id: 'request:reply', content: `┌─ Reasoning\n${privateContent}\n╭─ ⚕ Hermes ──╮\n│ 收到，继续待命。 │\n╰──╯\n↪ Resumed session private-id`,
        role: 'agent', afterSequence: 0 },
      { id: 'private-only', role: 'agent', content: `┌─ Reasoning\n${privateContent}\n😄 无法确认边界的末行`, afterSequence: 0 },
    ]} />);
    expect(screen.getByText('收到，继续待命。')).toBeInTheDocument();
    expect(screen.getByText('请核对签章。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '展开全部' }));
    const region = screen.getByRole('region', { name: '任务动态' });
    expect(region).not.toHaveTextContent(privateContent);
    expect(region).not.toHaveTextContent('无法确认边界');
    expect(region).not.toHaveTextContent('Resumed session');
    expect(region).not.toHaveTextContent('内部详情已隐藏');
  });

  it('renders slow and accepted requests as normal waiting, reserving details for actual errors', () => {
    render(<AgentActivityTimeline run={baseRun} localMessages={[
      { id: 'slow', content: '慢请求', status: 'waiting', notice: '处理时间较长，仍在等待 BidVolt 回复。' },
      { id: 'accepted', content: '已返回请求', status: 'accepted', notice: '请求已返回，等待 BidVolt 回复。' },
    ]} />);
    expect(screen.getAllByText('等待回复')).toHaveLength(2);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.queryByText('结果待确认')).not.toBeInTheDocument();
    expect(screen.queryByText('后端已排队')).not.toBeInTheDocument();
    expect(screen.queryByText('查看详情')).not.toBeInTheDocument();
  });

  it('shows a completed-session chat reply directly without waiting for a new SSE stream', () => {
    render(<AgentActivityTimeline run={{ ...baseRun, completion: 'complete', status: 'succeeded' }} localMessages={[
      { id: 'request', content: '继续检查', role: 'user', status: 'sent', createdAt: '2026-09-05T01:00:00Z' },
      { id: 'reply', content: '已检查，缺少报价附件。', role: 'agent', createdAt: '2026-09-05T01:00:02Z' },
    ]} />);
    expect(screen.getByText('已检查，缺少报价附件。').closest('article')).toHaveAttribute('data-kind', 'agent');
    expect(screen.getByText('继续检查').closest('article')).toHaveAttribute('data-kind', 'user');
  });

  it('reconciles only fresh SSE echoes one-to-one and keeps uncertain delivery visible', () => {
    const entries = buildAgentTimelineEntries({ ...baseRun, conversation: [
      { seq: 1, kind: 'user', content: '继续' },
      { seq: 8, kind: 'user', content: '继续' },
    ] }, [
      { id: 'first-new', afterSequence: 7, content: '继续', status: 'unconfirmed', error: '回复尚未返回，请勿重复发送。' },
      { id: 'second-new', afterSequence: 7, content: '继续', status: 'waiting' },
    ]);
    const users = entries.filter((entry) => entry.kind === 'user');
    expect(users).toHaveLength(3);
    expect(users[0]).not.toHaveProperty('userStatus');
    expect(users[1]).toMatchObject({ userStatus: 'unconfirmed', error: '回复尚未返回，请勿重复发送。' });
    expect(users[2]).toMatchObject({ userStatus: 'waiting' });
  });

  it('does not label an uncertain response as a failed send', () => {
    render(<AgentActivityTimeline run={baseRun} localMessages={[
      { id: 'pending', content: '继续核对', status: 'unconfirmed', notice: '连接已中断，结果待确认；请勿重复发送。', error: 'fetch failed' },
    ]} />);
    expect(screen.getByText('结果待确认')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('连接已中断，结果待确认');
    expect(screen.getByText('fetch failed').closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByText('发送失败')).not.toBeInTheDocument();
  });

  it('orders sequenced messages and treats unknown kinds as non-public records', () => {
    render(
      <AgentActivityTimeline
        run={{
          ...baseRun,
          conversation: [
            { seq: 3, kind: 'future_backend_kind', content: '后端新增的自主输出' },
            { seq: 1, kind: 'assistant', content: '开始核验材料' },
            { seq: 2, kind: 'user', content: '优先检查技术文件' },
          ],
        }}
      />,
    );

    const timeline = screen.getByRole('region', { name: '任务动态' });
    const messages = within(timeline).getAllByRole('article');
    expect(messages.map((message) => message.textContent)).toEqual([
      expect.stringContaining('开始核验材料'),
      expect.stringContaining('优先检查技术文件'),
      expect.stringContaining('运行记录'),
    ]);
    expect(screen.queryByText('后端新增的自主输出')).not.toBeInTheDocument();
    expect(screen.queryByText('主会话动态')).not.toBeInTheDocument();
    expect(screen.queryByText('主会话')).not.toBeInTheDocument();
  });

  it('compresses consecutive runtime logs and expands safe summaries only', async () => {
    const user = userEvent.setup();
    render(
      <AgentActivityTimeline
        compact
        run={{
          ...baseRun,
          conversation: [
            { seq: 1, kind: 'service', content: '建立任务目录' },
            { seq: 2, kind: 'tool', content: '读取评分规则' },
            { seq: 3, kind: 'progress', content: '生成技术响应章节' },
            { seq: 4, kind: 'assistant', content: '已完成首轮材料核验' },
            { seq: 5, kind: 'log', content: '开始复核报价表' },
          ],
        }}
      />,
    );

    const logGroups = screen.getAllByRole('article', { name: /运行记录，共/ });
    expect(logGroups[0]).toHaveAttribute('data-expanded', 'false');
    expect(logGroups).toHaveLength(2);
    expect(within(logGroups[0]).queryByText('建立任务目录')).not.toBeInTheDocument();
    expect(within(logGroups[0]).queryByText('生成技术响应章节')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '运行摘要' })).not.toBeInTheDocument();
    expect(screen.getByText('· 3 条')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '展开全部' })).toHaveLength(2);

    await user.click(within(logGroups[0]).getByRole('button', { name: '展开全部' }));
    expect(logGroups[0]).toHaveAttribute('data-expanded', 'true');
    expect(within(logGroups[0]).getByText('建立任务目录')).toBeInTheDocument();
    expect(within(logGroups[0]).getByText('读取评分规则')).toBeInTheDocument();
    expect(within(logGroups[0]).getByText('生成技术响应章节')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows typed operational output in logs rather than placeholder rows or chat replies', async () => {
    const user = userEvent.setup();
    render(
      <AgentActivityTimeline
        run={{
          ...baseRun,
          conversation: [
            { seq: 1, kind: 'system', content: '💻 timeout 1800s\n$ npm run build' },
            { seq: 2, kind: 'stdout', content: '构建完成' },
            { seq: 3, kind: 'assistant', content: '$ npm   run   build' },
            { seq: 4, kind: 'assistant', content: 'Preparing terminal…' },
            { seq: 5, kind: 'assistant', content: '成果文件已更新。' },
          ],
        }}
      />,
    );

    const records = screen.getByRole('article', { name: /运行记录，共/ });
    expect(records).not.toHaveTextContent('Preparing terminal');
    expect(within(records).queryByText(/timeout\s+1800s/)).not.toBeInTheDocument();
    expect(screen.getByText('· 4 条')).toBeInTheDocument();
    expect(screen.getByText('成果文件已更新。').closest('article')).toHaveAttribute('data-kind', 'agent');

    await user.click(screen.getByRole('button', { name: '展开全部' }));
    expect(records).not.toHaveTextContent('timeout');
    expect(records).toHaveTextContent('$ npm run build');
    expect(records).toHaveTextContent('构建完成');
    expect(records).not.toHaveTextContent('内部详情已隐藏');
    expect(within(records).getByRole('list', { name: '运行摘要' })).toBeInTheDocument();
  });

  it('collapses a single terminal frame without rendering its markdown or box drawing as a preview', async () => {
    const user = userEvent.setup();
    const frame = `╭─ Reasoning ${'─'.repeat(240)}\n│ # 内部运行分析\n│ **这不是面向用户的结论**\n╰${'─'.repeat(240)}`;
    render(
      <AgentActivityTimeline
        run={{ ...baseRun, conversation: [{ seq: 1, kind: 'reasoning', content: frame }] }}
      />,
    );

    const records = screen.getByRole('article', { name: '运行记录，共 1 条' });
    const toggle = within(records).getByRole('button', { name: '展开全部' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(records.querySelector('pre, .bv-markdown')).not.toBeInTheDocument();
    expect(records).not.toHaveTextContent('内部运行分析');
    expect(records.textContent?.length).toBeLessThan(70);

    await user.click(toggle);
    expect(records).not.toHaveTextContent('这不是面向用户的结论');
    expect(records).not.toHaveTextContent('Reasoning');
    expect(records).not.toHaveTextContent('内部详情已隐藏');
    expect(records).toHaveTextContent('暂无可展示的业务记录');
    expect(records.querySelector('.bv-markdown, h1, h2, strong')).not.toBeInTheDocument();
    await user.click(within(records).getByRole('button', { name: '收起' }));
    expect(records.querySelector('pre')).not.toBeInTheDocument();
  });

  it('preserves the user expansion choice when more live logs join the same group', async () => {
    const user = userEvent.setup();
    const firstRun = {
      ...baseRun,
      conversation: [{ seq: 1, kind: 'tool', content: '读取招标文件' }],
    };
    const { rerender } = render(<AgentActivityTimeline run={firstRun} />);
    const toggle = screen.getByRole('button', { name: '展开全部' });
    const contentId = toggle.getAttribute('aria-controls');
    await user.click(toggle);

    const secondRun = {
      ...firstRun,
      conversation: [...firstRun.conversation, { seq: 2, kind: 'tool', content: '读取企业资料' }],
    };
    rerender(<AgentActivityTimeline run={secondRun} />);
    expect(screen.getByRole('button', { name: '收起' })).toHaveAttribute('aria-controls', contentId);
    expect(screen.getByText('读取招标文件')).toBeInTheDocument();
    expect(screen.getByText('读取企业资料')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '收起' }));
    rerender(
      <AgentActivityTimeline run={{
        ...secondRun,
        conversation: [...secondRun.conversation, { seq: 3, kind: 'tool', content: '校验材料格式' }],
      }} />,
    );
    expect(screen.getByRole('button', { name: '展开全部' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('校验材料格式')).not.toBeInTheDocument();
  });

  it('keeps one oversized system record collapsed and classifies terminal banners as runtime output', async () => {
    const user = userEvent.setup();
    const longInstruction = `内部系统说明 ${'仅供运行时使用 '.repeat(60)}`;
    render(
      <AgentActivityTimeline
        run={{
          ...baseRun,
          conversation: [
            { seq: 1, kind: 'system', content: longInstruction },
            { seq: 2, kind: 'assistant', content: '↻ Resumed session 20260903_104750' },
            { seq: 3, kind: 'assistant', content: '材料核验已完成。' },
          ],
        }}
      />,
    );

    const records = screen.getByRole('article', { name: /运行记录，共/ });
    expect(records.textContent?.length).toBeLessThan(longInstruction.length);
    expect(within(records).queryByText(/内部系统说明/)).not.toBeInTheDocument();
    expect(within(records).queryByText(/Resumed session/)).not.toBeInTheDocument();
    expect(screen.getByText('材料核验已完成。').closest('article')).toHaveAttribute('data-kind', 'agent');

    await user.click(screen.getByRole('button', { name: '展开全部' }));
    expect(within(records).getByText(/内部系统说明/)).toBeInTheDocument();
    expect(records).not.toHaveTextContent('Resumed session');
  });

  it('joins streamed BidVolt fragments, renders markdown and keeps execution traces in logs', async () => {
    const user = userEvent.setup();
    render(
      <AgentActivityTimeline
        run={{
          ...baseRun,
          conversation: [
            { seq: 1, kind: 'assistant', content: '**材料核验**已经完' },
            { seq: 2, kind: 'assistant', content: '成。\n\n- 招标文件完整' },
            { seq: 3, kind: 'assistant', content: 'import json; print("debug")' },
          ],
        }}
      />,
    );

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(screen.getByText('材料核验').tagName).toBe('STRONG');
    expect(screen.getByText('招标文件完整').tagName).toBe('LI');
    expect(screen.getByText(/已经完成/)).toBeInTheDocument();
    expect(screen.queryByText(/import json/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.getByRole('list', { name: '运行摘要' })).not.toHaveTextContent('import json');
  });

  it('compresses code fragments whose backend kind is incorrectly marked as BidVolt output', async () => {
    const user = userEvent.setup();
    render(
      <AgentActivityTimeline
        run={{
          ...baseRun,
          conversation: [
            {
              seq: 1,
              kind: 'assistant',
              content: "f and '合同' in f: print(f[:80]) + 2 commands (0.0s)",
            },
            {
              seq: 2,
              kind: 'assistant',
              content: "g['pics'] for g in pg; json.dump(plan_map, open('/data/hermes/work/plan.json', 'w'))",
            },
            { seq: 3, kind: 'assistant', content: '成果文件已完成核验。' },
          ],
        }}
      />,
    );

    expect(screen.queryByRole('list', { name: '运行摘要' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.queryByText("f and '合同'", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: '运行摘要' })).not.toHaveTextContent('内部详情已隐藏');
    expect(screen.getByText('成果文件已完成核验。').closest('article'))
      .toHaveAttribute('data-kind', 'agent');
  });

  it('resets the latest-message position when the workspace switches tasks', async () => {
    const firstRun: AgentRunViewModel = {
      ...baseRun,
      conversation: [{ seq: 1, kind: 'assistant', content: '旧任务最新内容' }],
    };
    const { rerender } = render(
      <div className="project-result-workspace__activity">
        <AgentActivityTimeline run={firstRun} />
      </div>,
    );
    const scrollContainer = screen.getByLabelText('任务动态').parentElement as HTMLElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 480 },
      scrollTop: { configurable: true, value: 120, writable: true },
    });

    rerender(
      <div className="project-result-workspace__activity">
        <AgentActivityTimeline
          run={{
            ...firstRun,
            conversation: [{ seq: 1, kind: 'assistant', content: '新任务最新内容' }],
            taskId: '905',
          }}
        />
      </div>,
    );

    await waitFor(() => expect(scrollContainer.scrollTop).toBe(480));
  });

  it('shows local user messages with their queue state and keeps errors visible', () => {
    render(
      <AgentActivityTimeline
        localMessages={[
          {
            content: '把报价说明写得更清楚',
            id: 'pending-1',
            sequence: 2,
            status: 'queued',
          },
        ]}
        run={{
          ...baseRun,
          conversation: [{ seq: 1, kind: 'assistant', content: '正在检查价格文件' }],
          errorMessage: '价格文件暂时无法保存',
        }}
      />,
    );

    expect(screen.getByText('把报价说明写得更清楚').closest('article')).toHaveAttribute('data-kind', 'user');
    expect(screen.getByText('排队中')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('价格文件暂时无法保存');
    expect(screen.getByText('价格文件暂时无法保存').closest('article')).toHaveAttribute('data-kind', 'error');
  });

  it('highlights unresolved interactions and submits an aligned reply', async () => {
    const user = userEvent.setup();
    const onAnswerInteraction = vi.fn().mockResolvedValue({ queued: true });
    render(
      <AgentActivityTimeline
        now={Date.parse('2026-09-01T00:05:00Z')}
        onAnswerInteraction={onAnswerInteraction}
        run={{
          ...baseRun,
          questions: [{
            answer: null,
            answered: false,
            askId: '31',
            createdAt: '2026-09-01T00:00:00Z',
            items: [
              { checked: '资料库中未找到', need: '生成授权委托书', question: '被授权人姓名是什么？' },
              { checked: '', need: '填写商务文件', question: '职务是什么？' },
            ],
            legacy: false,
            timeoutNotified: false,
            windowMinutes: 20,
          }],
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('有 1 项内容需要处理');
    const interaction = screen.getByText('需要你处理').closest('article');
    expect(interaction).toHaveAttribute('data-resolved', 'false');

    await user.type(screen.getByRole('textbox', { name: '回复：被授权人姓名是什么？' }), '张三');
    await user.type(screen.getByRole('textbox', { name: '回复：职务是什么？' }), '项目经理');
    await user.click(screen.getByRole('button', { name: '确认回复并继续' }));

    expect(onAnswerInteraction).toHaveBeenCalledWith('31', ['张三', '项目经理']);
    expect(within(interaction as HTMLElement).getByRole('status')).toHaveTextContent('回复已提交');
  });

  it('exposes pure builders so the workspace can reuse ordering and log grouping', () => {
    const entries = buildAgentTimelineEntries({
      ...baseRun,
      conversation: [
        { seq: 3, kind: 'assistant', content: '正式输出' },
        { seq: 1, kind: 'service', content: '日志一' },
        { seq: 2, kind: 'tool', content: '日志二' },
      ],
    });
    const blocks = groupAgentTimelineLogs(entries);

    expect(entries.map((entry) => entry.id)).toEqual([
      'conversation-1',
      'conversation-2',
      'conversation-3',
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe('log-group');
    expect(blocks[1].kind).toBe('agent');
  });
});
