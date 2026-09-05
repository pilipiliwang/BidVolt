import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentWorkspaceComposer,
  type AgentWorkspaceQueuedMessage,
} from './AgentWorkspaceComposer';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe('AgentWorkspaceComposer', () => {
  it('keeps the queue region hidden until a queued message exists', () => {
    const { rerender } = render(<AgentWorkspaceComposer queuedMessages={[]} />);

    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();

    rerender(
      <AgentWorkspaceComposer
        queuedMessages={[{ localId: 'local-1', content: '先补充技术方案图纸' }]}
      />,
    );

    expect(screen.getByRole('region', { name: '排队消息' })).toHaveTextContent('先补充技术方案图纸');
  });

  it('sends non-empty text with queue mode on Enter and clears it after success', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue({ queued: true });
    render(<AgentWorkspaceComposer onSend={onSend} />);

    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    await user.type(textarea, '请检查评分细则{enter}');

    expect(onSend).toHaveBeenCalledWith('请检查评分细则', 'queue');
    expect(textarea).toHaveValue('');
  });

  it('uses Shift+Enter for a newline instead of sending', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<AgentWorkspaceComposer onSend={onSend} />);

    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    await user.type(textarea, '第一行{shift>}{enter}{/shift}第二行');

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('第一行\n第二行');
  });

  it('does not submit while the user is composing text with an IME', () => {
    const onSend = vi.fn();
    render(<AgentWorkspaceComposer onSend={onSend} defaultValue="正在输入" />);

    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('passes an id-less local queued message to steer and delete callbacks', async () => {
    const user = userEvent.setup();
    const localMessage: AgentWorkspaceQueuedMessage = {
      localId: 'optimistic-7',
      content: '先校验商务资格，再继续成文',
    };
    const onSteerQueued = vi.fn();
    const onDeleteQueued = vi.fn();
    render(
      <AgentWorkspaceComposer
        onDeleteQueued={onDeleteQueued}
        onSteerQueued={onSteerQueued}
        queuedMessages={[localMessage]}
      />,
    );

    await user.click(screen.getByRole('button', { name: `调整方向：${localMessage.content}` }));
    expect(onSteerQueued).toHaveBeenCalledWith(localMessage);

    await user.click(screen.getByRole('button', { name: `删除排队消息：${localMessage.content}` }));
    expect(onDeleteQueued).toHaveBeenCalledWith(localMessage);
    expect(screen.queryByRole('button', { name: /展开排队消息|收起排队消息/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `调整方向：${localMessage.content}` })
      .querySelector('.lucide-corner-down-right')).not.toBeNull();
  });

  it('renders and removes an Office selection context reference', async () => {
    const user = userEvent.setup();
    const onRemoveContextReference = vi.fn();
    const reference = {
      localId: 'selection-1',
      label: '价格文件 / 报价明细.xlsx',
      detail: 'Sheet2!B12:F20',
    };
    render(
      <AgentWorkspaceComposer
        contextReferences={[reference]}
        onRemoveContextReference={onRemoveContextReference}
      />,
    );

    const contexts = screen.getByLabelText('当前引用上下文');
    expect(contexts).toHaveTextContent(reference.label);
    expect(contexts).toHaveTextContent(reference.detail);
    await user.click(within(contexts).getByRole('button', { name: `移除引用：${reference.label}` }));
    expect(onRemoveContextReference).toHaveBeenCalledWith(reference);
  });

  it('shows uploaded attachments, lets the user remove them, and allows an attachment-only send', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn();
    const onSend = vi.fn().mockResolvedValue({ queued: true });
    const attachment = {
      detail: '24.5 KB · 已上传',
      localId: 'business-deviation',
      name: '商务偏差表.docx',
    };
    render(
      <AgentWorkspaceComposer
        attachments={[attachment]}
        onRemoveAttachment={onRemoveAttachment}
        onSend={onSend}
      />,
    );

    const attachments = screen.getByLabelText('已添加附件');
    expect(attachments).toHaveTextContent('商务偏差表.docx');
    expect(attachments).toHaveTextContent('24.5 KB · 已上传');
    expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled();

    await user.click(within(attachments).getByRole('button', { name: '移除附件：商务偏差表.docx' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(attachment);

    await user.click(screen.getByRole('button', { name: '发送消息' }));
    expect(onSend).toHaveBeenCalledWith('', 'queue');
  });

  it('uploads selected files and exposes upload pending and error states', async () => {
    const user = userEvent.setup();
    const upload = deferred<void>();
    const onAddFiles = vi.fn(() => upload.promise);
    render(<AgentWorkspaceComposer onAddFiles={onAddFiles} />);

    const input = screen.getByLabelText('选择发送给 BidVolt 的文件');
    const file = new File(['content'], '技术说明.docx');
    await user.upload(input, file);

    expect(onAddFiles).toHaveBeenCalledWith([file]);
    expect(screen.getByRole('button', { name: '添加中…' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'BidVolt 输入' })).toHaveAttribute('aria-busy', 'true');

    upload.reject(new Error('附件服务暂不可用'));
    expect(await screen.findByRole('alert')).toHaveTextContent('附件服务暂不可用');
  });

  it('retains the draft and exposes a rejected send as an alert', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockRejectedValue(new Error('Agent 暂时不可用'));
    render(<AgentWorkspaceComposer onSend={onSend} />);

    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    await user.type(textarea, '请继续优化');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent 暂时不可用');
    expect(textarea).toHaveValue('请继续优化');
  });

  it('reports waiting for a reply without locking later queued messages', () => {
    render(
      <AgentWorkspaceComposer
        error="后端会话连接中断"
        onSend={vi.fn()}
        pending
        value="正在发送"
      />,
    );

    expect(screen.getByRole('region', { name: 'BidVolt 输入' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在等待 BidVolt 回复');
    expect(screen.getByRole('alert')).toHaveTextContent('后端会话连接中断');
    expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '发送消息' })).toHaveAttribute('title', '加入本页待发队列');
    expect(screen.getByRole('status')).not.toHaveTextContent(/未收到|未确认|已处理/);
  });

  it('submits a distinct follow-up while the parent is still waiting for the earlier reply', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue({ queued: true });
    render(<AgentWorkspaceComposer onSend={onSend} pending defaultValue="下一条新要求" />);
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('下一条新要求', 'queue');
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('可继续添加消息');
  });

  it('guards repeated submit events synchronously until the local submission completes', async () => {
    const request = deferred<void>();
    const onSend = vi.fn(() => request.promise);
    render(<AgentWorkspaceComposer onSend={onSend} defaultValue="只提交一次" />);
    const form = screen.getByRole('textbox').closest('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve());
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('associates errors with their own inputs rather than a duplicate page id', () => {
    render(<><AgentWorkspaceComposer error="第一个错误" /><AgentWorkspaceComposer error="第二个错误" /></>);
    const inputs = screen.getAllByRole('textbox');
    const ids = inputs.map((input) => input.getAttribute('aria-describedby'));
    expect(ids[0]).not.toBe(ids[1]);
    expect(document.getElementById(ids[0]!)).toHaveTextContent('第一个错误');
    expect(document.getElementById(ids[1]!)).toHaveTextContent('第二个错误');
  });

  it('keeps text entered while an earlier message is pending', async () => {
    const user = userEvent.setup();
    const send = deferred<void>();

    function ControlledComposer() {
      const [value, setValue] = useState('');
      return (
        <AgentWorkspaceComposer
          onSend={() => send.promise}
          onValueChange={setValue}
          value={value}
        />
      );
    }

    render(<ControlledComposer />);
    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    await user.type(textarea, '先完善目录');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await user.type(textarea, '，再补充报价说明');

    send.resolve();
    expect(await screen.findByRole('button', { name: '发送消息' })).toBeEnabled();
    expect(textarea).toHaveValue('先完善目录，再补充报价说明');
  });
});
