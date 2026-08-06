import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectOverviewPage, type ProjectOverviewView } from './ProjectOverviewPage';

const overview: ProjectOverviewView = {
  deliverables: [
    { id: 'business', title: '商务标文件', pages: 12, words: '2 万', score: '28 / 30', lift: '2 分', missing: 0, tone: 'business', versionId: 'business-v8' },
    { id: 'technical', title: '技术标文件', pages: 18, words: '4 万', score: '46 / 50', lift: '3 分', missing: 0, tone: 'technical', versionId: 'technical-v6' },
    { id: 'quote', title: '报价单', pages: 3, words: '0.2 万', score: '18 / 20', lift: '1 分', missing: 0, tone: 'quote', versionId: 'quote-v4' },
  ],
  score: {
    business: 28,
    estimatedLift: 6,
    missingMaterials: 0,
    pricing: 18,
    rejectionRisks: 0,
    technical: 46,
    total: 92,
  },
};

describe('ProjectOverviewPage', () => {
  it('shows a visible project-material entry for regular users', () => {
    render(
      <ProjectOverviewPage enterpriseMaterials={[]} materials={[]} projectId="BV-2026-018" onOpenTasks={vi.fn()} />,
    );

    const materialsLink = screen.getByRole('link', { name: '打开项目材料' });
    expect(materialsLink).toHaveAttribute('href', '/projects/BV-2026-018/materials');
    expect(materialsLink).not.toHaveClass('bv-visually-hidden');
  });

  it('shows a project-scoped pending state when no overview data exists', () => {
    render(
      <ProjectOverviewPage enterpriseMaterials={[]} materials={[]} projectId="BV-2026-015" onOpenTasks={vi.fn()} />,
    );

    expect(screen.getByText('项目成果尚未生成')).toBeInTheDocument();
    expect(screen.getByText('暂无模拟得分')).toBeInTheDocument();
    expect(screen.queryByLabelText('综合得分 91.4 分')).not.toBeInTheDocument();
  });

  it('routes each preview to its own versioned editor and keeps pricing separate', () => {
    render(
      <ProjectOverviewPage
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={vi.fn()}
        overview={overview}
        projectId="BV-2026-018"
      />,
    );

    expect(screen.getByRole('link', { name: '预览商务标文件' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/deliverables/business/versions/business-v8',
    );
    expect(screen.getByRole('link', { name: '预览技术标文件' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/deliverables/technical/versions/technical-v6',
    );
    expect(screen.getByRole('link', { name: '预览报价单' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/deliverables/quote/versions/quote-v4',
    );
    expect(screen.getByRole('link', { name: '报价分析' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/pricing',
    );
  });
});
