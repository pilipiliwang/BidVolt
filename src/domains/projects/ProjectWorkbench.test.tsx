import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  ProjectChatBar,
  ProjectSourceRail,
  ProjectWorkbench,
  type WorkspaceMaterial,
} from './ProjectWorkbench';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

const projectMaterials: WorkspaceMaterial[] = [
  { id: 'project-1', name: '当前招标文件.pdf', status: '已识别', tone: 'blue' },
];

const enterpriseMaterials: WorkspaceMaterial[] = [
  { id: 'enterprise-1', name: '企业营业执照.pdf', status: '可复用', tone: 'green' },
];

describe('ProjectWorkbench', () => {
  it('keeps the viewport-filling layout by default for editor pages', () => {
    render(
      <ProjectWorkbench
        enterpriseMaterials={[]}
        materials={[]}
        rightRail={<div>Review</div>}
      >
        <div>Editor</div>
      </ProjectWorkbench>,
    );

    expect(screen.getByRole('main').closest('.bv-project-workspace')).toHaveClass(
      'bv-project-workspace--fill',
    );
  });
});

describe('ProjectSourceRail', () => {
  it('exposes clearly disabled controls when upload handling is unavailable', async () => {
    const user = userEvent.setup();
    render(<ProjectSourceRail enterpriseMaterials={[]} materials={[]} />);

    expect(screen.getByText('当前招标材料（0项）')).toBeInTheDocument();
    expect(screen.queryByLabelText('招标文件')).not.toBeInTheDocument();
    expect(screen.queryByText('缺失材料：')).not.toBeInTheDocument();
    expect(screen.queryByText(/同类业绩|型式试验报告/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加项目文件不可用' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: '企业资料' }));
    expect(screen.getByRole('button', { name: '企业资料上传不可用' })).toBeDisabled();
  });

  it('keeps the real upload input when an upload handler is provided', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddFiles={onAddFiles}
      />,
    );

    const file = new File(['project'], '补遗文件.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('补充上传当前项目资料'), file);

    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('switches enterprise data in place without mixing it into project materials', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/projects/BV-2026-018/review');

    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddEnterpriseFiles={vi.fn()}
        onAddFiles={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: '当前招标材料' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('当前招标文件.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '企业资料' }));

    expect(window.location.pathname).toBe('/projects/BV-2026-018/review');
    expect(screen.getByRole('tab', { name: '企业资料' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('企业资料（1项）')).toBeInTheDocument();
    expect(screen.getByLabelText('企业营业执照.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('当前招标文件.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('缺失材料：')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(screen.getByLabelText('上传企业资料并同步资料库')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '当前招标材料' }));
    expect(screen.getByLabelText('当前招标文件.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('企业营业执照.pdf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('补充上传当前项目资料')).toBeInTheDocument();
  });

  it('dispatches enterprise uploads without invoking the project upload callback', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn();
    const onAddFiles = vi.fn();
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
      />,
    );

    await user.click(screen.getByRole('tab', { name: '企业资料' }));
    const file = new File(['enterprise'], '新企业资质.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText('上传企业资料并同步资料库'), file);

    expect(onAddEnterpriseFiles).toHaveBeenCalledWith([file]);
    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it('shows project upload pending and failure states without an unhandled rejection', async () => {
    const user = userEvent.setup();
    const upload = deferred<void>();
    const onAddFiles = vi.fn(() => upload.promise);
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddFiles={onAddFiles}
      />,
    );

    const input = screen.getByLabelText('补充上传当前项目资料');
    await user.upload(input, new File(['project'], '失败补遗.pdf', { type: 'application/pdf' }));

    expect(screen.getByText('正在上传资料…')).toBeInTheDocument();
    expect(input).toBeDisabled();

    upload.reject(new Error('项目材料上传接口不可用'));

    expect(await screen.findByRole('alert')).toHaveTextContent('项目材料上传接口不可用');
    expect(screen.getByLabelText('补充上传当前项目资料')).toBeEnabled();
  });

  it('shows a dedicated empty state for the enterprise source', async () => {
    const user = userEvent.setup();
    render(<ProjectSourceRail enterpriseMaterials={[]} materials={projectMaterials} />);

    await user.click(screen.getByRole('tab', { name: '企业资料' }));

    expect(screen.getByRole('status')).toHaveTextContent('企业资料库暂无可展示资料');
  });
});

describe('ProjectChatBar', () => {
  it('opens a project file input and dispatches selected files', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(<ProjectChatBar hint="提问" onAddFiles={onAddFiles} />);

    const input = screen.getByLabelText('添加当前项目文件') as HTMLInputElement;
    const inputClick = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: '添加文件' }));
    expect(inputClick).toHaveBeenCalledTimes(1);

    const file = new File(['attachment'], '任务附件.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(input, file);

    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('clearly disables file attachment without a project callback', () => {
    render(<ProjectChatBar hint="提问" />);

    expect(screen.getByRole('button', { name: '添加文件' })).toBeDisabled();
    expect(screen.queryByLabelText('添加当前项目文件')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '发送' })).toHaveAttribute(
      'title',
      '项目助手接口尚未接入',
    );
  });

  it('fills and focuses the controlled assistant draft, while keeping it editable', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <ProjectChatBar
        focusRequest={0}
        hint="提问"
        onValueChange={onValueChange}
        value=""
      />,
    );

    rerender(
      <ProjectChatBar
        focusRequest={1}
        hint="提问"
        onValueChange={onValueChange}
        value={'请针对以下选中内容进行修改：\n设备供货方案\n\n修改要求：'}
      />,
    );

    const assistantInput = screen.getByRole('textbox', { name: '向项目助手提问' });
    expect(assistantInput).toHaveFocus();
    expect(assistantInput).toHaveValue(
      '请针对以下选中内容进行修改：\n设备供货方案\n\n修改要求：',
    );
    fireEvent.change(assistantInput, { target: { value: '补充风险控制' } });
    expect(onValueChange).toHaveBeenCalledWith('补充风险控制');
  });

  it('only enables sending when a handler and non-empty message are available', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ProjectChatBar hint="提问" onSend={onSend} value="请优化选中内容" />);

    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(onSend).toHaveBeenCalledWith('请优化选中内容');
  });

  it('keeps a question until the assistant request succeeds', async () => {
    const user = userEvent.setup();
    const send = deferred<void>();
    render(<ProjectChatBar hint="提问" onSend={() => send.promise} />);

    const input = screen.getByRole('textbox', { name: '向项目助手提问' });
    await user.type(input, '请检查资格条件');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(input).toHaveValue('请检查资格条件');
    expect(screen.getByRole('button', { name: '发送中…' })).toBeDisabled();

    send.resolve();

    expect(await screen.findByRole('button', { name: '发送' })).toBeDisabled();
    expect(input).toHaveValue('');
  });

  it('retains a failed assistant question and displays the request error', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => Promise.reject(new Error('助手服务暂不可用')));
    render(<ProjectChatBar hint="提问" onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: '向项目助手提问' });
    await user.type(input, '解释第二条评审建议');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('助手服务暂不可用');
    expect(input).toHaveValue('解释第二条评审建议');
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled();
    expect(onSend).toHaveBeenCalledWith('解释第二条评审建议');
  });

  it('does not erase text entered while the previous question is still sending', async () => {
    const user = userEvent.setup();
    const send = deferred<void>();
    render(<ProjectChatBar hint="提问" onSend={() => send.promise} />);

    const input = screen.getByRole('textbox', { name: '向项目助手提问' });
    await user.type(input, '第一个问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await user.type(input, '，以及补充问题');

    send.resolve();

    expect(await screen.findByRole('button', { name: '发送' })).toBeEnabled();
    expect(input).toHaveValue('第一个问题，以及补充问题');
  });

  it('shows attachment pending and failure states in the bottom bar', async () => {
    const user = userEvent.setup();
    const upload = deferred<void>();
    render(<ProjectChatBar hint="提问" onAddFiles={() => upload.promise} />);

    const input = screen.getByLabelText('添加当前项目文件');
    await user.upload(input, new File(['attachment'], '失败附件.docx'));

    expect(screen.getByRole('button', { name: '添加中…' })).toBeDisabled();
    upload.reject(new Error('附件上传失败'));

    expect(await screen.findByRole('alert')).toHaveTextContent('附件上传失败');
    expect(screen.getByRole('button', { name: '添加文件' })).toBeEnabled();
  });
});
