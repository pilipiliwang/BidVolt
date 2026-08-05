import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectOverviewPage } from './ProjectOverviewPage';

describe('ProjectOverviewPage', () => {
  it('shows a visible project-material entry for regular users', () => {
    render(
      <ProjectOverviewPage materials={[]} projectId="BV-2026-018" onOpenTasks={vi.fn()} />,
    );

    const materialsLink = screen.getByRole('link', { name: '打开项目材料' });
    expect(materialsLink).toHaveAttribute('href', '/projects/BV-2026-018/materials');
    expect(materialsLink).not.toHaveClass('bv-visually-hidden');
  });

  it('shows a project-scoped pending state when no overview data exists', () => {
    render(
      <ProjectOverviewPage materials={[]} projectId="BV-2026-015" onOpenTasks={vi.fn()} />,
    );

    expect(screen.getByText('项目成果尚未生成')).toBeInTheDocument();
    expect(screen.getByText('暂无模拟得分')).toBeInTheDocument();
    expect(screen.queryByLabelText('综合得分 91.4 分')).not.toBeInTheDocument();
  });
});
