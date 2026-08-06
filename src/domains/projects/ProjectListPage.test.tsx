import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectListPage } from './ProjectListPage';
import { projectSummaries } from './project-view-model';

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
  it('only offers a workspace link for projects backed by accessible project data', () => {
    renderProjectList();

    expect(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    ).toHaveAttribute('href', '/projects/BV-2026-018/overview');

    const supplementalRow = screen.getByText('±800kV特高压直流输电工程换流站设备采购').closest('tr');
    expect(supplementalRow).not.toBeNull();
    expect(
      within(supplementalRow!).queryByRole('link', { name: /进入.*工作台/ }),
    ).not.toBeInTheDocument();
    expect(within(supplementalRow!).getByText('暂未接入')).toHaveAttribute(
      'aria-label',
      '±800kV特高压直流输电工程换流站设备采购工作台暂未接入',
    );
  });

  it('labels the single loaded demo page without exposing fake pagination controls', async () => {
    const user = userEvent.setup();
    renderProjectList();

    const paginationStatus = screen.getByRole('status', { name: '项目分页状态' });
    expect(paginationStatus).toHaveTextContent('当前演示页');
    expect(paginationStatus).toHaveTextContent('第 1 / 1 页');
    expect(paginationStatus).toHaveTextContent('展示 8 条');
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '第2页' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '搜索项目' }), '风电场');
    expect(paginationStatus).toHaveTextContent('展示 1 条');
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

  it('closes with Escape and restores focus to the launch button', async () => {
    renderProjectList();
    const launchButton = screen.getByRole('button', { name: '新增项目' });
    const { user } = await openCreateProjectDialog();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '新增项目' })).not.toBeInTheDocument();
    expect(launchButton).toHaveFocus();
  });
});
