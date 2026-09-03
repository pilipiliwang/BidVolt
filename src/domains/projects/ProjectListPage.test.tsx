import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectListPage } from './ProjectListPage';
import type { ProjectSummary } from './project-view-model';

const projectSummaries: ProjectSummary[] = [
  {
    id: 'BV-2026-018',
    code: 'BV-2026-018',
    title: '海上平台电气设备采购项目',
    buyer: '海上能源建设有限公司',
    stage: '材料解析',
    progress: 10,
    deadline: '2099-08-21 10:00',
    materialCount: 3,
    riskCount: 0,
    updatedAt: '2099-08-01 09:00',
  },
  {
    id: 'BV-2026-015',
    code: 'BV-2026-015',
    title: '风电场升压站设备项目',
    buyer: '沿海新能源有限公司',
    stage: '内部评审',
    progress: 50,
    deadline: '2020-08-21 10:00',
    materialCount: 5,
    riskCount: 1,
    updatedAt: '2020-08-01 09:00',
  },
];

function renderProjectList(onCreateProject = vi.fn()) {
  render(
    <ProjectListPage
      projects={projectSummaries}
      onCreateProject={onCreateProject}
    />,
  );
  return { onCreateProject };
}

async function openCreateProjectDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '新增项目' }));
  return { user, dialog: screen.getByRole('dialog', { name: '新增项目' }) };
}

describe('ProjectListPage', () => {
  it('only renders projects supplied by the backend and links each workspace', () => {
    renderProjectList();

    expect(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    ).toHaveAttribute('href', '/projects/BV-2026-018/overview');

    expect(screen.getByRole('link', { name: '进入风电场升压站设备项目工作台' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-015/overview',
    );
    expect(screen.queryByText('±800kV特高压直流输电工程换流站设备采购')).not.toBeInTheDocument();
  });

  it('shows date-only values and the derived execution stage', () => {
    renderProjectList();

    expect(screen.getByText('2099-08-21')).toBeInTheDocument();
    expect(screen.getByText('2099-08-01')).toBeInTheDocument();
    expect(screen.getByText('上传材料')).toBeInTheDocument();
    expect(screen.getByText('标书制作/审核')).toBeInTheDocument();
    expect(screen.queryByText('2099-08-21 10:00')).not.toBeInTheDocument();
  });

  it('maps backend proposal-compilation projects to bid production and resumes that workflow directly', () => {
    const project = { ...projectSummaries[0]!, stage: '方案编制' as const };
    render(<ProjectListPage projects={[project]} onCreateProject={vi.fn()} />);

    expect(screen.getByText('标书制作/审核')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }))
      .toHaveAttribute('href', '/projects/BV-2026-018/materials?workflow=generate');
  });

  it('resumes a previously selected generation mode before the backend stage changes', () => {
    window.localStorage.setItem('bidvolt:project-workflow-mode:BV-2026-018', 'generate');
    render(<ProjectListPage projects={[projectSummaries[0]!]} onCreateProject={vi.fn()} />);

    expect(screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }))
      .toHaveAttribute('href', '/projects/BV-2026-018/materials?workflow=generate');
    window.localStorage.removeItem('bidvolt:project-workflow-mode:BV-2026-018');
  });

  it('prioritizes the enterprise-material step when the enterprise library is empty', () => {
    render(
      <ProjectListPage
        enterpriseReady={false}
        projects={projectSummaries}
        onCreateProject={vi.fn()}
      />,
    );

    expect(screen.getAllByText('上传企业资料')).toHaveLength(projectSummaries.length);
  });

  it('labels the single loaded backend page without exposing fake pagination controls', async () => {
    const user = userEvent.setup();
    renderProjectList();

    const paginationStatus = screen.getByRole('status', { name: '项目分页状态' });
    expect(paginationStatus).toHaveTextContent('后端数据');
    expect(paginationStatus).toHaveTextContent('第 1 / 1 页');
    expect(paginationStatus).toHaveTextContent('展示 2 条');
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '第2页' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '搜索项目' }), '风电场');
    expect(paginationStatus).toHaveTextContent('展示 1 条');
  });

  it('forwards the visible search term to backend q search', async () => {
    const user = userEvent.setup();
    const onSearchProjects = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectListPage
        projects={projectSummaries}
        onCreateProject={vi.fn()}
        onSearchProjects={onSearchProjects}
      />,
    );

    const search = screen.getByRole('searchbox', { name: '搜索项目' });
    expect(search.closest('label')).not.toHaveClass('sr-only');
    await user.type(search, '沿海新能源');

    await waitFor(() => expect(onSearchProjects).toHaveBeenLastCalledWith('沿海新能源'));
  });

  it('opens the create-project dialog and focuses the first field', async () => {
    renderProjectList();

    const { dialog } = await openCreateProjectDialog();

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: '项目名称' })).toHaveFocus();
  });

  it('rejects incomplete, duplicate-code, and expired project drafts', async () => {
    const { onCreateProject } = renderProjectList();
    const { user, dialog } = await openCreateProjectDialog();
    const submitButton = within(dialog).getByRole('button', { name: '创建并进入材料页' });

    await user.click(submitButton);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请完整填写');

    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), '北方变电站扩容项目');
    await user.type(within(dialog).getByRole('textbox', { name: '招标编号' }), 'bv-2026-018');
    await user.type(within(dialog).getByRole('textbox', { name: '招标人' }), '北方电网有限公司');
    fireEvent.change(within(dialog).getByLabelText('截止时间'), {
      target: { value: '2099-12-31T12:00' },
    });
    await user.click(submitButton);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('该招标编号已存在');

    await user.clear(within(dialog).getByRole('textbox', { name: '招标编号' }));
    await user.type(within(dialog).getByRole('textbox', { name: '招标编号' }), 'BV-2026-099');
    fireEvent.change(within(dialog).getByLabelText('截止时间'), {
      target: { value: '2020-01-01T09:00' },
    });
    await user.click(submitButton);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('截止时间必须是晚于当前时间');
    expect(onCreateProject).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('截止时间'), {
      target: { value: '2099-12-31T12:00' },
    });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('provides a safe explicit deadline picker with a keyboard fallback', async () => {
    renderProjectList();
    const { user, dialog } = await openCreateProjectDialog();
    const deadlineInput = within(dialog).getByLabelText('截止时间') as HTMLInputElement;
    const showPicker = vi.fn(() => {
      throw new DOMException('Picker unavailable', 'NotAllowedError');
    });
    Object.defineProperty(deadlineInput, 'showPicker', {
      configurable: true,
      value: showPicker,
    });

    expect(deadlineInput.min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(deadlineInput.min).getTime()).toBeGreaterThan(Date.now());

    await user.click(
      within(dialog).getByRole('button', { name: '选择截止日期与时间' }),
    );

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(deadlineInput).toHaveFocus();
    expect(within(dialog).getByText(/也可使用键盘直接输入/)).toBeInTheDocument();
  });

  it('returns a normalized ProjectSummary after a valid submission', async () => {
    const { onCreateProject } = renderProjectList();
    const { user, dialog } = await openCreateProjectDialog();

    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), ' 北方变电站扩容项目 ');
    await user.type(within(dialog).getByRole('textbox', { name: '招标编号' }), ' BV-2099-099 ');
    await user.type(within(dialog).getByRole('textbox', { name: '招标人' }), ' 北方电网有限公司 ');
    fireEvent.change(within(dialog).getByLabelText('截止时间'), {
      target: { value: '2099-12-31T12:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: '创建并进入材料页' }));

    expect(onCreateProject).toHaveBeenCalledWith({
      id: 'BV-2099-099',
      code: 'BV-2099-099',
      title: '北方变电站扩容项目',
      buyer: '北方电网有限公司',
      stage: '材料解析',
      progress: 0,
      deadline: '2099-12-31 12:00',
      materialCount: 0,
      riskCount: 0,
      updatedAt: '刚刚',
    });
    expect(screen.queryByRole('dialog', { name: '新增项目' })).not.toBeInTheDocument();
  });

  it('keeps a project visible and retryable when backend archiving fails', async () => {
    const user = userEvent.setup();
    let rejectArchive: (error: Error) => void = () => undefined;
    const onArchiveProject = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectArchive = reject;
    }));
    render(
      <ProjectListPage
        projects={projectSummaries}
        onArchiveProject={onArchiveProject}
        onCreateProject={vi.fn()}
      />,
    );

    const archiveButton = screen.getByRole('button', {
      name: '从列表删除海上平台电气设备采购项目',
    });
    await user.click(archiveButton);

    expect(archiveButton).toBeDisabled();
    expect(archiveButton).toHaveTextContent('删除中…');
    rejectArchive(new Error('项目正在运行任务，暂不能归档'));

    expect(await screen.findByRole('alert')).toHaveTextContent('项目正在运行任务，暂不能归档');
    expect(screen.getByText('海上平台电气设备采购项目')).toBeInTheDocument();
    expect(archiveButton).toBeEnabled();
  });

  it('keeps the create dialog open while creation fails', async () => {
    const onCreateProject = vi.fn().mockRejectedValue(new Error('招标编号已被占用'));
    renderProjectList(onCreateProject);
    const { user, dialog } = await openCreateProjectDialog();

    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), '北方变电站扩容项目');
    await user.type(within(dialog).getByRole('textbox', { name: '招标编号' }), 'BV-2099-099');
    await user.type(within(dialog).getByRole('textbox', { name: '招标人' }), '北方电网有限公司');
    fireEvent.change(within(dialog).getByLabelText('截止时间'), {
      target: { value: '2099-12-31T12:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: '创建并进入材料页' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('招标编号已被占用');
    expect(screen.getByRole('dialog', { name: '新增项目' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '创建并进入材料页' })).toBeEnabled();
  });

  it('closes with Escape and restores focus to the launch button', async () => {
    renderProjectList();
    const launchButton = screen.getByRole('button', { name: '新增项目' });
    const { user } = await openCreateProjectDialog();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '新增项目' })).not.toBeInTheDocument();
    expect(launchButton).toHaveFocus();
  });
});
