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
});
