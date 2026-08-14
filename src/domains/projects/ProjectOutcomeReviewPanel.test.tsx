import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  buildProjectOutcomeReviewViewModel,
  ProjectOutcomeReviewPanel,
} from './ProjectOutcomeReviewPanel';

describe('ProjectOutcomeReviewPanel', () => {
  it('renders only backend-provided score values and opens improvement suggestions', async () => {
    const user = userEvent.setup();
    const onOpenImprovementSuggestions = vi.fn();
    const viewModel = buildProjectOutcomeReviewViewModel({
      score: {
        business: 28.6,
        estimatedLift: 6.2,
        missingMaterials: 3,
        pricing: 17.5,
        rejectionRisks: 0,
        technical: 45.3,
        total: 91.4,
      },
    });

    render(
      <ProjectOutcomeReviewPanel
        onOpenImprovementSuggestions={onOpenImprovementSuggestions}
        viewModel={viewModel}
      />,
    );

    expect(screen.getByRole('heading', { name: '模拟评标' })).toBeInTheDocument();
    expect(screen.getByText('91.4')).toBeInTheDocument();
    const metrics = screen.getByRole('group', { name: '标书成果模拟评标分项' });
    expect(within(metrics).getByText('商务分').parentElement).toHaveTextContent('28.6 分');
    expect(within(metrics).getByText('技术分').parentElement).toHaveTextContent('45.3 分');
    expect(within(metrics).getByText('报价分').parentElement).toHaveTextContent('17.5 分');
    expect(within(metrics).getByText('否决风险数').parentElement).toHaveTextContent('0 项');
    expect(within(metrics).getByText('缺失材料数').parentElement).toHaveTextContent('3 项');
    expect(within(metrics).getByText('预计可提升分值').parentElement).toHaveTextContent('6.2 分');

    await user.click(screen.getByRole('button', { name: '查看提升建议' }));
    expect(onOpenImprovementSuggestions).toHaveBeenCalledOnce();
  });

  it('uses dashes for score fields the backend did not return', () => {
    render(
      <ProjectOutcomeReviewPanel
        onOpenImprovementSuggestions={vi.fn()}
        viewModel={buildProjectOutcomeReviewViewModel({ score: { total: 88 } })}
      />,
    );

    const metrics = screen.getByRole('group', { name: '标书成果模拟评标分项' });
    for (const label of [
      '商务分',
      '技术分',
      '报价分',
      '否决风险数',
      '缺失材料数',
      '预计可提升分值',
    ]) {
      expect(within(metrics).getByText(label).parentElement).toHaveTextContent('—');
    }
  });

  it('shows a real review task as initial scoring without invented timing', async () => {
    const user = userEvent.setup();
    const onOpenTasks = vi.fn();
    const viewModel = buildProjectOutcomeReviewViewModel({
      reviewRunStatus: 'running',
      tasks: [{ phase: 'bid_review', sequence: 8, status: 'running', task_type: 'bid_review' }],
    });

    render(<ProjectOutcomeReviewPanel onOpenTasks={onOpenTasks} viewModel={viewModel} />);

    const status = screen.getByRole('status');
    expect(within(status).getByRole('heading', { name: '正在生成初次评分结果' })).toBeInTheDocument();
    expect(status).toHaveTextContent('系统正依据已识别的评分规则评审当前标书成果');
    expect(status).not.toHaveTextContent(/预计完成时间|预计剩余时间|分钟|\d{4}-\d{2}-\d{2}/);
    expect(screen.queryByRole('button', { name: '查看提升建议' })).not.toBeInTheDocument();

    await user.click(within(status).getByRole('button', { name: '查看任务进度' }));
    expect(onOpenTasks).toHaveBeenCalledOnce();
  });

  it('distinguishes results generation, empty review, and review failure', () => {
    const { rerender } = render(
      <ProjectOutcomeReviewPanel
        viewModel={buildProjectOutcomeReviewViewModel({
          tasks: [{ phase: 'bid_generate', sequence: 3, status: 'queued', task_type: 'bid_generate' }],
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: '等待标书成果生成完成' })).toBeInTheDocument();

    rerender(<ProjectOutcomeReviewPanel viewModel={buildProjectOutcomeReviewViewModel({})} />);
    expect(screen.getByRole('heading', { name: '尚无模拟评标结果' })).toBeInTheDocument();

    rerender(
      <ProjectOutcomeReviewPanel
        viewModel={buildProjectOutcomeReviewViewModel({ reviewRunStatus: 'failed' })}
      />,
    );
    expect(screen.getByRole('heading', { name: '初次评分未完成' })).toBeInTheDocument();
  });

  it.each([
    ['loading', '最近一次评分 · 正在刷新'],
    ['error', '最近一次评分 · 刷新失败'],
  ] as const)('marks a cached score non-ready while the score request is %s', (sourceState, label) => {
    const viewModel = buildProjectOutcomeReviewViewModel({
      score: { business: 24, total: 82 },
      scoreSourceState: sourceState,
    });

    render(
      <ProjectOutcomeReviewPanel
        onOpenImprovementSuggestions={vi.fn()}
        viewModel={viewModel}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看提升建议' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('评分已返回')).not.toBeInTheDocument();
  });

  it('shows an old score as updating while a fresh review task is active', () => {
    const viewModel = buildProjectOutcomeReviewViewModel({
      score: { total: 82 },
      tasks: [{ phase: 'bid_review', sequence: 9, status: 'running', task_type: 'bid_review' }],
      tasksState: 'ready',
    });

    render(
      <ProjectOutcomeReviewPanel
        onOpenImprovementSuggestions={vi.fn()}
        onOpenTasks={vi.fn()}
        viewModel={viewModel}
      />,
    );

    expect(screen.getByText('最近一次评分 · 更新中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看任务进度' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看提升建议' })).not.toBeInTheDocument();
  });

  it('ignores cached tasks when the task source failed', () => {
    const staleTask = {
      phase: 'bid_review',
      sequence: 9,
      status: 'running' as const,
      task_type: 'bid_review',
    };

    const scoreView = buildProjectOutcomeReviewViewModel({
      reviewSourceState: 'error',
      score: { total: 88 },
      scoreSourceState: 'ready',
      tasks: [staleTask],
      tasksState: 'error',
    });
    expect(scoreView.state).toBe('ready');

    const emptyView = buildProjectOutcomeReviewViewModel({
      reviewSourceState: 'ready',
      scoreSourceState: 'ready',
      tasks: [staleTask],
      tasksState: 'error',
    });
    expect(emptyView).toMatchObject({
      state: 'error',
      title: '模拟评标状态暂不可用',
    });
  });

  it('keeps a successfully loaded score ready when review detail alone failed', () => {
    const viewModel = buildProjectOutcomeReviewViewModel({
      reviewRunId: 'cached-review-run',
      reviewRunStatus: 'running',
      reviewSourceState: 'error',
      score: { business: 26, total: 86 },
      scoreReviewRunId: 'latest-score-run',
      scoreSourceState: 'ready',
      tasksState: 'error',
    });

    expect(viewModel).toMatchObject({
      score: { total: 86 },
      state: 'ready',
    });
  });

  it('keeps suggestions closed for backend-stale or mismatched review scores', () => {
    const stale = buildProjectOutcomeReviewViewModel({
      score: { total: 79 },
      scoreIsStale: true,
    });
    expect(stale).toMatchObject({ state: 'stale', title: '最近一次评分 · 已过期' });

    const mismatched = buildProjectOutcomeReviewViewModel({
      reviewRunId: 'review-new',
      reviewRunStatus: 'succeeded',
      score: { total: 79 },
      scoreReviewRunId: 'review-old',
    });
    expect(mismatched).toMatchObject({ state: 'updating', title: '最近一次评分 · 更新中' });

    const unlinked = buildProjectOutcomeReviewViewModel({
      reviewRunId: 'review-new',
      reviewRunStatus: 'succeeded',
      score: { total: 79 },
    });
    expect(unlinked).toMatchObject({ state: 'updating', title: '最近一次评分 · 更新中' });
  });
});
