import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentRunViewModel } from '../task-events';
import { AgentRunPanel } from './AgentRunPanel';

const activeRun: AgentRunViewModel = {
  actionList: [],
  completion: 'active',
  conversation: [
    { seq: 1, kind: 'service', content: '任务书已送达主会话' },
    { seq: 2, kind: 'hermes', content: '正在核验采购文件要求' },
  ],
  errorMessage: null,
  message: '正在提取评分规则与响应文件格式',
  outcome: null,
  percent: 15,
  phase: 'question_gate',
  projectId: '53',
  questions: [{
    answer: null,
    answered: false,
    askId: '13',
    createdAt: '2026-09-01T00:00:00Z',
    items: [
      { checked: '企业资料库未找到', need: '填写授权委托书', question: '被授权人姓名是什么？' },
      { checked: '', need: '填写报价文件', question: '开户行是什么？' },
    ],
    legacy: false,
    timeoutNotified: false,
    windowMinutes: 20,
  }],
  reason: null,
  sessionId: 'session-53',
  status: 'running',
  streamState: 'connected',
  taskId: '1773',
};

describe('AgentRunPanel', () => {
  it('renders backend phase, percent and current work without inventing progress', () => {
    render(<AgentRunPanel now={Date.parse('2026-09-01T00:05:30Z')} run={activeRun} />);

    expect(screen.getByRole('heading', { name: '成果生成正在执行' })).toBeInTheDocument();
    expect(screen.getByText('资料确认')).toBeInTheDocument();
    expect(screen.getByText('正在提取评分规则与响应文件格式')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Agent 成果生成进度' })).toHaveAttribute(
      'aria-valuetext',
      '15% · 正在提取评分规则与响应文件格式',
    );
    expect(screen.getByText('实时会话已连接')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Agent 主会话实时消息' })).toHaveTextContent(
      '正在核验采购文件要求',
    );
  });

  it('shows incomplete as a distinct terminal result and exposes package/resume actions', async () => {
    const user = userEvent.setup();
    const onDownloadResponsePackage = vi.fn();
    const onResume = vi.fn();
    render(
      <AgentRunPanel
        onDownloadResponsePackage={onDownloadResponsePackage}
        onResume={onResume}
        run={{
          ...activeRun,
          completion: 'incomplete',
          outcome: 'incomplete',
          percent: 100,
          reason: '授权委托书仍缺盖章',
          status: 'succeeded',
          streamState: 'ended',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '成果尚未完全闭环' })).toBeInTheDocument();
    expect(screen.getByText('未闭环原因：授权委托书仍缺盖章')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下载最终响应文件包' }));
    expect(onDownloadResponsePackage).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '继续处理未闭环事项' }));
    expect(onResume).toHaveBeenCalledWith('1773');
  });

  it('renders every question group and submits answers as an aligned array', async () => {
    const user = userEvent.setup();
    const onAnswerQuestion = vi.fn().mockResolvedValue({ queued: true, reply: null });
    render(
      <AgentRunPanel
        now={Date.parse('2026-09-01T00:25:00Z')}
        onAnswerQuestion={onAnswerQuestion}
        run={{
          ...activeRun,
          questions: [
            activeRun.questions[0],
            {
              answer: ['李四'],
              answered: true,
              askId: '14',
              createdAt: '2026-09-01T00:02:00Z',
              items: [{ checked: '', need: '', question: '联系人是谁？' }],
              legacy: false,
              timeoutNotified: false,
              windowMinutes: 20,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText('2 组待回答')).not.toBeInTheDocument();
    expect(screen.getByText('1 组待回答')).toBeInTheDocument();
    expect(screen.getByText(/已超时，仍可补答/)).toBeInTheDocument();
    expect(screen.getByText('我的回答：李四')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: '回答：被授权人姓名是什么？' }), '张三');
    await user.type(screen.getByRole('textbox', { name: '回答：开户行是什么？' }), 'XX银行XX支行');
    await user.click(screen.getByRole('button', { name: '补答并回传重验' }));
    expect(onAnswerQuestion).toHaveBeenCalledWith('13', ['张三', 'XX银行XX支行']);
    expect(screen.getByText('回答已回传主会话，正在等待处理。')).toBeInTheDocument();
  });

  it('sends queue and steer messages through callbacks without calling an API itself', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    render(<AgentRunPanel onSendMessage={onSendMessage} run={activeRun} />);

    const conversation = screen.getByRole('region', { name: '主会话动态' });
    const textbox = within(conversation).getByRole('textbox', { name: '发送给主会话的消息' });
    await user.type(textbox, '先补齐技术方案图纸');
    await user.selectOptions(within(conversation).getByRole('combobox', { name: '发送方式' }), 'steer');
    await user.click(within(conversation).getByRole('button', { name: '发送' }));

    expect(onSendMessage).toHaveBeenCalledWith('先补齐技术方案图纸', 'steer');
    expect(textbox).toHaveValue('');
  });

  it('shows the direct reply returned by a terminal Agent chat', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn().mockResolvedValue({
      queued: false,
      reply: '已根据你的补充说明更新未闭环清单。',
    });
    render(
      <AgentRunPanel
        onSendMessage={onSendMessage}
        run={{
          ...activeRun,
          completion: 'incomplete',
          outcome: 'incomplete',
          status: 'succeeded',
          streamState: 'ended',
        }}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '发送给主会话的消息' }), '请说明缺少什么');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      '主会话回复：已根据你的补充说明更新未闭环清单。',
    );
  });

  it('does not render a fake zero percent when the backend has no percent', () => {
    render(<AgentRunPanel run={{ ...activeRun, percent: null }} />);

    expect(screen.getByText('进度待后端更新')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
