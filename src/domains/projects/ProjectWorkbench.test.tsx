import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseAssetCategoryFolder } from '../../features/enterprise-assets';
import {
  ProjectChatBar,
  ProjectSourceRail,
  ProjectWorkbench,
  type WorkspaceMaterial,
} from './ProjectWorkbench';
import projectWorkbenchCss from './project-workbench.css?raw';

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
  {
    categoryId: 'license',
    id: 'enterprise-1',
    name: '企业营业执照.pdf',
    status: '可复用',
    tone: 'green',
  },
  {
    categoryId: 'performance',
    id: 'enterprise-2',
    name: '近三年业绩.xlsx',
    status: '可复用',
    tone: 'green',
  },
  {
    categoryId: 'removed-backend-category',
    id: 'enterprise-uncategorized',
    name: '待归类资料.pdf',
    status: '待确认',
    tone: 'orange',
  },
];

const enterpriseCategories: EnterpriseAssetCategoryFolder[] = [
  { id: 'license', label: '企业证照', parentId: null },
  { id: 'performance', label: '企业业绩', parentId: null },
  { id: 'inspection', label: '检测报告', parentId: null },
];

describe('ProjectWorkbench', () => {
  it('keeps the viewport-filling layout by default for editor pages', () => {
    render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
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

  it('routes enterprise-rail and bottom-assistant uploads to their dedicated handlers', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn();
    const onAssistantAddFiles = vi.fn();
    render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={[]}
        materials={projectMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAssistantAddFiles={onAssistantAddFiles}
        rightRail={<div>Review</div>}
      >
        <div>Editor</div>
      </ProjectWorkbench>,
    );

    const railFile = new File(['rail'], '企业资质.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('上传企业资料并同步资料库'), railFile);
    expect(onAddEnterpriseFiles).toHaveBeenCalledWith([railFile]);
    expect(onAssistantAddFiles).not.toHaveBeenCalled();

    const assistantFile = new File(['assistant'], '助手补充资料.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText('添加当前项目文件'), assistantFile);
    expect(onAssistantAddFiles).toHaveBeenCalledWith([assistantFile]);
    expect(onAddEnterpriseFiles).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectSourceRail', () => {
  it('uses the same heading scale as the review card and removes tab styling', () => {
    expect(projectWorkbenchCss).toMatch(
      /\.bv-source-rail__header h2\s*\{[^}]*font-size:\s*21px/,
    );
    expect(projectWorkbenchCss).not.toContain('.bv-source-rail__tabs');
  });

  it('renders the real enterprise category mapping with counts and no project materials', () => {
    render(
      <ProjectSourceRail
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
      />,
    );

    const rail = screen.getByRole('complementary', { name: '企业资料' });
    expect(within(rail).getByRole('heading', { level: 2, name: /企业资料/ })).toBeInTheDocument();
    expect(within(rail).queryByRole('tablist')).not.toBeInTheDocument();
    expect(within(rail).queryByRole('tab')).not.toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '全部资料，3项' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(rail).getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(rail).getByRole('button', { name: '检测报告，0项' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '未分类资料，1项' })).toBeInTheDocument();
    expect(within(rail).getByLabelText('企业营业执照.pdf')).toBeInTheDocument();
    expect(within(rail).queryByText('当前招标材料')).not.toBeInTheDocument();
    expect(within(rail).queryByLabelText('当前招标文件.pdf')).not.toBeInTheDocument();
    expect(within(rail).queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '企业资料上传不可用' })).toBeDisabled();
  });

  it('expands one real folder at a time and reports an empty backend folder honestly', async () => {
    const user = userEvent.setup();
    render(
      <ProjectSourceRail
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
      />,
    );

    const allFolder = screen.getByRole('button', { name: '全部资料，3项' });
    const licenseFolder = screen.getByRole('button', { name: '企业证照，1项' });
    await user.click(licenseFolder);

    expect(allFolder).toHaveAttribute('aria-expanded', 'false');
    expect(licenseFolder).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('企业营业执照.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('近三年业绩.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('待归类资料.pdf')).not.toBeInTheDocument();

    await user.click(licenseFolder);
    expect(licenseFolder).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('企业营业执照.pdf')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '检测报告，0项' }));
    expect(screen.getByRole('status')).toHaveTextContent('该文件夹暂无企业资料');
  });

  it('resets the open folder when the enterprise tenant key changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseLibraryKey="enterprise-a"
        enterpriseMaterials={enterpriseMaterials}
        rightRail={<div>Review</div>}
      >
        <div>Workspace</div>
      </ProjectWorkbench>,
    );

    await user.click(screen.getByRole('button', { name: '企业证照，1项' }));
    expect(screen.getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    rerender(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseLibraryKey="enterprise-b"
        enterpriseMaterials={enterpriseMaterials}
        rightRail={<div>Review</div>}
      >
        <div>Workspace</div>
      </ProjectWorkbench>,
    );

    expect(screen.getByRole('button', { name: '全部资料，3项' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('dispatches the left upload only to the enterprise callback', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn();
    const onAddFiles = vi.fn();
    render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
        rightRail={<div>Review</div>}
      >
        <div>Workspace</div>
      </ProjectWorkbench>,
    );

    const file = new File(['enterprise'], '新企业资质.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(screen.getByText('上传企业资料')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('上传企业资料并同步资料库'), file);

    expect(onAddEnterpriseFiles).toHaveBeenCalledWith([file]);
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('当前招标文件.pdf')).not.toBeInTheDocument();
  });

  it('shows enterprise upload pending and failure states without an unhandled rejection', async () => {
    const user = userEvent.setup();
    const upload = deferred<void>();
    const onAddEnterpriseFiles = vi.fn(() => upload.promise);
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    const input = screen.getByLabelText('上传企业资料并同步资料库');
    await user.upload(input, new File(['enterprise'], '失败资质.pdf', { type: 'application/pdf' }));

    expect(screen.getByText('正在上传企业资料…')).toBeInTheDocument();
    expect(input).toBeDisabled();

    upload.reject(new Error('企业资料上传接口不可用'));

    expect(await screen.findByRole('alert')).toHaveTextContent('企业资料上传接口不可用');
    expect(screen.getByLabelText('上传企业资料并同步资料库')).toBeEnabled();
  });

  it('shows a dedicated empty state for enterprise data', () => {
    render(<ProjectSourceRail enterpriseMaterials={[]} />);

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
