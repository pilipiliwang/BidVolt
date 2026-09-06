import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('keeps every mobile card label paired with one value container, including multi-part cells', () => {
    renderProjectList();

    const table = screen.getByRole('table', { name: '投标项目' });
    const headings = within(table).getAllByRole('columnheader').map((heading) => heading.textContent);
    const rows = within(table).getAllByRole('row').slice(1);
    for (const row of rows) {
      within(row).getAllByRole('cell').forEach((cell, index) => {
        expect(cell).toHaveAttribute('data-label', headings[index]);
        expect(cell.children).toHaveLength(1);
        expect(cell.firstElementChild).toHaveClass('ui0802-project-cell-value');
      });
    }

    const title = screen.getByText(projectSummaries[0]!.title);
    expect(title.parentElement).toContainElement(screen.getByText(projectSummaries[0]!.buyer));
    const deadline = screen.getByText('2099-08-21');
    expect(deadline.parentElement?.querySelector('.ui0802-deadline-hint')).not.toBeNull();
  });

  it('preserves complete long names and codes while providing keyboard access to the scrolling table', () => {
    const project = {
      ...projectSummaries[0]!,
      title: '跨区域新能源电网调度系统设备采购及配套技术服务项目'.repeat(3),
      code: 'BIDVOLT20260905ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3),
      buyer: '区域新能源电网技术服务有限公司'.repeat(3),
    };
    const onCreateProject = vi.fn();
    const onArchiveProject = vi.fn();
    render(<ProjectListPage projects={[project]} onCreateProject={onCreateProject} onArchiveProject={onArchiveProject} />);

    expect(screen.getByText(project.title)).toHaveAttribute('title', project.title);
    expect(screen.getByText(project.buyer)).toHaveAttribute('title', project.buyer);
    expect(screen.getByText(project.code)).toHaveClass('ui0802-project-code');
    expect(screen.getByRole('region', { name: '项目列表滚动区域' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('link', { name: `进入${project.title}工作台` })).toHaveAttribute('href', `/projects/${project.id}/overview`);
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(onArchiveProject).not.toHaveBeenCalled();
  });

  it.each(['方案编制', '内部评审', '待提交'] as const)(
    'reopens the selected generation workflow for a %s project regardless of stage',
    (stage) => {
      const project = { ...projectSummaries[0]!, stage };
      window.localStorage.setItem('bidvolt:project-workflow-mode:BV-2026-018', 'generate');
      render(<ProjectListPage projects={[project]} onCreateProject={vi.fn()} />);

      expect(screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }))
        .toHaveAttribute('href', '/projects/BV-2026-018/materials?workflow=generate');
      window.localStorage.removeItem('bidvolt:project-workflow-mode:BV-2026-018');
    },
  );

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

  it('requires only a project name and writing owner before material parsing', async () => {
    const { onCreateProject } = renderProjectList();
    const { user, dialog } = await openCreateProjectDialog();
    const submitButton = within(dialog).getByRole('button', { name: '创建并进入材料页' });

    await user.click(submitButton);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请填写项目名称和编写负责人');

    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), '北方变电站扩容项目');
    await user.click(submitButton);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请填写项目名称和编写负责人');
    expect(onCreateProject).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole('textbox', { name: '编写负责人' }), '张三');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables parsed fields instead of asking the user to fill in tender facts', async () => {
    renderProjectList();
    const { dialog } = await openCreateProjectDialog();
    for (const name of ['招标编号', '招标人', '包号', '截止时间']) {
      expect(within(dialog).getByLabelText(name)).toBeDisabled();
      expect(within(dialog).getByLabelText(name)).toHaveAttribute('placeholder', '系统解析后填写');
    }
    expect(within(dialog).getByRole('textbox', { name: '项目名称' })).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: '编写负责人' })).toBeRequired();
  });

  it('returns a normalized ProjectSummary after a valid submission', async () => {
    const { onCreateProject } = renderProjectList();
    const { user, dialog } = await openCreateProjectDialog();

    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), ' 北方变电站扩容项目 ');
    await user.type(within(dialog).getByRole('textbox', { name: '编写负责人' }), ' 张三 ');
    await user.click(within(dialog).getByRole('button', { name: '创建并进入材料页' }));

    expect(onCreateProject).toHaveBeenCalledWith({
      id: '',
      code: '',
      authorName: '张三',
      packageNo: '',
      title: '北方变电站扩容项目',
      buyer: '',
      stage: '材料解析',
      progress: 0,
      deadline: '',
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
    const onCreateProject = vi.fn().mockRejectedValue(new Error('项目创建请求失败'));
    renderProjectList(onCreateProject);
    const { user, dialog } = await openCreateProjectDialog();

    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), '北方变电站扩容项目');
    await user.type(within(dialog).getByRole('textbox', { name: '编写负责人' }), '张三');
    await user.click(within(dialog).getByRole('button', { name: '创建并进入材料页' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('项目创建请求失败');
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

  it('does not dismiss or duplicate a create request while awaiting the backend', async () => {
    let rejectCreation: (error: Error) => void = () => undefined;
    const onCreateProject = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectCreation = reject;
    }));
    renderProjectList(onCreateProject);
    const { user, dialog } = await openCreateProjectDialog();
    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), '新项目');
    await user.type(within(dialog).getByRole('textbox', { name: '编写负责人' }), '张三');
    await user.click(within(dialog).getByRole('button', { name: '创建并进入材料页' }));
    expect(within(dialog).getByRole('button', { name: '创建中…' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '新增项目' })).toBeInTheDocument();
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    rejectCreation(new Error('创建失败'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('创建失败');
  });
});
