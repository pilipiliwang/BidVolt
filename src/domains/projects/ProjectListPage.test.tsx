import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ProjectListPage } from './ProjectListPage';

describe('ProjectListPage', () => {
  it('only offers a workspace link for projects backed by accessible project data', () => {
    render(<ProjectListPage />);

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
    render(<ProjectListPage />);

    const paginationStatus = screen.getByRole('status', { name: '项目分页状态' });
    expect(paginationStatus).toHaveTextContent('当前演示页');
    expect(paginationStatus).toHaveTextContent('第 1 / 1 页');
    expect(paginationStatus).toHaveTextContent('展示 8 条');
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '第2页' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '搜索项目' }), '风电场');
    expect(paginationStatus).toHaveTextContent('展示 1 条');
  });
});
