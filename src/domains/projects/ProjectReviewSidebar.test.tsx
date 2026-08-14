import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectMaterialsPage } from '../../features/project-materials/ProjectMaterialsPage';
import {
  buildProjectReviewSidebarViewModel,
  ProjectReviewSidebar,
  type ProjectReviewSidebarViewModel,
} from './ProjectReviewSidebar';
import { buildProjectOutcomeReviewViewModel } from './ProjectOutcomeReviewPanel';
import { ProjectOverviewPage, type ProjectOverviewView } from './ProjectOverviewPage';
import type { ProjectSummary } from './project-view-model';

const project: ProjectSummary = {
  buyer: '测试招标人',
  code: 'BV-2026-018',
  deadline: '2026-08-20 10:00',
  id: 'BV-2026-018',
  materialCount: 0,
  progress: 0,
  riskCount: 0,
  stage: '材料解析',
  title: '测试项目',
  updatedAt: '2026-08-14',
};

const scoreOnlyOverview: ProjectOverviewView = {
  deliverables: [],
  score: {
    business: 30,
    estimatedLift: 9,
    missingMaterials: 0,
    pricing: 20,
    rejectionRisks: 0,
    technical: 50,
    total: 100,
  },
};

function snapshotReviewMetrics(container: HTMLElement) {
  const metrics = within(container).getByRole('list', { name: '模拟评标六项指标' });
  return within(metrics).getAllByRole('listitem').map((item) => ({
    id: item.getAttribute('data-metric-id'),
    state: item.getAttribute('data-metric-state'),
    text: item.textContent,
  }));
}

function activeGenerationViewModel() {
  return buildProjectReviewSidebarViewModel({
    deliverables: [
      { currentVersionNo: 2, kind: 'business' },
      { currentVersionNo: 4, kind: 'business' },
      { currentVersionNo: 0, kind: 'technical' },
    ],
    requirements: [
      { type: 'qualification' },
      { type: 'score_rule' },
      { type: 'score_rule' },
    ],
    tasks: [{ phase: 'generate_sections', status: 'running', task_type: 'bid_generate' }],
  });
}

function terminalReloadViewModel() {
  return buildProjectReviewSidebarViewModel({
    deliverables: [
      { currentVersionNo: 4, kind: 'business' },
      { currentVersionNo: 6, kind: 'technical' },
    ],
    requirements: [
      { type: 'score_rule' },
      { type: 'score_rule' },
      { type: 'score_rule' },
    ],
    tasks: [{ phase: 'generate_sections', status: 'succeeded', task_type: 'bid_generate' }],
  });
}

function expectCanonicalValues(container: HTMLElement, viewModel: ProjectReviewSidebarViewModel) {
  const metrics = within(container).getByRole('list', { name: '模拟评标六项指标' });
  expect(within(metrics).getAllByRole('listitem')).toHaveLength(6);
  expect(snapshotReviewMetrics(container).map((item) => item.id)).toEqual(
    viewModel.metrics.map((metric) => metric.id),
  );
  expect(within(metrics).getAllByText('接口待提供')).toHaveLength(2);
}

describe('ProjectReviewSidebar', () => {
  it('uses real requirements, deliverable versions, and active generation tasks', () => {
    const active = activeGenerationViewModel();
    const { container, rerender } = render(<ProjectReviewSidebar viewModel={active} />);

    expectCanonicalValues(container, active);
    const activeMetrics = within(container).getByRole('list', { name: '模拟评标六项指标' });
    expect(within(activeMetrics).getByText('已识别评分项').closest('[role="listitem"]'))
      .toHaveTextContent('2项来自招标要求');
    expect(within(activeMetrics).getByText('商务标状态').closest('[role="listitem"]'))
      .toHaveTextContent('已生成当前版本 V4');
    for (const label of ['技术标状态', '报价单状态']) {
      expect(within(activeMetrics).getByText(label).closest('[role="listitem"]'))
        .toHaveTextContent('执行中后端生成任务处理中');
    }

    const reloaded = terminalReloadViewModel();
    rerender(<ProjectReviewSidebar viewModel={reloaded} />);

    const reloadedMetrics = within(container).getByRole('list', { name: '模拟评标六项指标' });
    expect(within(reloadedMetrics).getByText('已识别评分项').closest('[role="listitem"]'))
      .toHaveTextContent('3项来自招标要求');
    expect(within(reloadedMetrics).getByText('技术标状态').closest('[role="listitem"]'))
      .toHaveTextContent('已生成当前版本 V6');
    expect(within(reloadedMetrics).getByText('报价单状态').closest('[role="listitem"]'))
      .toHaveTextContent('未生成暂无有效成果版本');
  });

  it('distinguishes loading and failed sources from truthful zero or missing values', () => {
    const loading = buildProjectReviewSidebarViewModel({
      deliverables: [],
      deliverablesState: 'loading',
      requirements: [],
      requirementsState: 'loading',
      tasks: [],
      tasksState: 'loading',
    });
    const { container, rerender } = render(<ProjectReviewSidebar viewModel={loading} />);
    let metrics = within(container).getByRole('list', { name: '模拟评标六项指标' });
    expect(within(metrics).getByText('已识别评分项').closest('[role="listitem"]'))
      .toHaveTextContent('—评分项加载中');
    expect(within(metrics).getByText('商务标状态').closest('[role="listitem"]'))
      .toHaveAttribute('data-metric-state', 'loading');

    const partiallyFailed = buildProjectReviewSidebarViewModel({
      deliverables: [{ currentVersionNo: 4, kind: 'business' }],
      requirements: [],
      tasks: [],
      tasksState: 'error',
    });
    rerender(<ProjectReviewSidebar viewModel={partiallyFailed} />);
    metrics = within(container).getByRole('list', { name: '模拟评标六项指标' });
    expect(within(metrics).getByText('已识别评分项').closest('[role="listitem"]'))
      .toHaveTextContent('0项来自招标要求');
    expect(within(metrics).getByText('商务标状态').closest('[role="listitem"]'))
      .toHaveTextContent('已生成当前版本 V4');
    for (const label of ['技术标状态', '报价单状态']) {
      expect(within(metrics).getByText(label).closest('[role="listitem"]'))
        .toHaveTextContent('—任务状态暂不可用');
    }
  });

  it('keeps the materials six-card model separate from outcome scoring on overview', () => {
    const active = activeGenerationViewModel();
    const overviewRender = render(
      <ProjectOverviewPage
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={vi.fn()}
        overview={scoreOnlyOverview}
        outcomeReview={buildProjectOutcomeReviewViewModel({ score: scoreOnlyOverview.score })}
        project={project}
        projectId={project.id}
      />,
    );
    const materialsRender = render(
      <ProjectMaterialsPage
        materials={[]}
        onStartTask={vi.fn()}
        projectId={project.id}
        projectName={project.title}
        requirements={[]}
        reviewSidebar={active}
        snapshots={[]}
      />,
    );

    expect(within(overviewRender.container).queryByRole('list', { name: '模拟评标六项指标' }))
      .not.toBeInTheDocument();
    const outcomeMetrics = within(overviewRender.container)
      .getByRole('group', { name: '标书成果模拟评标分项' });
    expect(within(outcomeMetrics).getByText('商务分').parentElement).toHaveTextContent('30 分');
    expect(snapshotReviewMetrics(materialsRender.container).map((metric) => metric.id))
      .toEqual(active.metrics.map((metric) => metric.id));

    const reloaded = terminalReloadViewModel();
    materialsRender.rerender(
      <ProjectMaterialsPage
        materials={[]}
        onStartTask={vi.fn()}
        projectId={project.id}
        projectName={project.title}
        requirements={[]}
        reviewSidebar={reloaded}
        snapshots={[]}
      />,
    );

    const materialReloaded = snapshotReviewMetrics(materialsRender.container);
    expect(materialReloaded.find((metric) => metric.id === 'technical')).toMatchObject({
      state: 'generated',
      text: '技术标状态已生成当前版本 V6',
    });
    expect(materialReloaded.find((metric) => metric.id === 'quote')).toMatchObject({
      state: 'missing',
      text: '报价单状态未生成暂无有效成果版本',
    });
  });
});
