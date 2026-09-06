import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ReviewFinding } from '../review/types';
import { buildProjectOutcomeReviewViewModel } from './ProjectOutcomeReviewPanel';
import { ProjectCompletionDashboard } from './ProjectCompletionDashboard';

const completeTask = {
  message: '主会话已确认全部验收门通过，可以下载最终响应文件包。',
  percent: 100,
  status: 'succeeded' as const,
  title: '成果生成',
};

const finding: ReviewFinding = {
  currentScore: 3,
  evidence: {
    exactQuote: '证书有效期须覆盖合同履行期。',
    locator: '第 12 页 · 资格条件 3.1',
    sourceLabel: '招标文件',
    verification: 'verified',
  },
  fullScore: 5,
  id: 'finding-1',
  improvableScore: 2,
  outcome: 'risk',
  ruleVersion: 'rule-18',
  suggestion: '请确认资质证书在投标截止日仍然有效。',
  title: '资质有效期核验',
};

describe('ProjectCompletionDashboard', () => {
  it('shows score fields and opens the generated internal record file', async () => {
    const user = userEvent.setup();
    const onOpenRecordFile = vi.fn();
    const recordFile = {
      category: 'internal' as const,
      id: 'record-file',
      name: '编制逻辑与评分响应记录.docx',
      sizeLabel: '1.2 MB',
      versionLabel: 'V3',
    };
    render(
      <ProjectCompletionDashboard
        findings={[finding]}
        onOpenRecordFile={onOpenRecordFile}
        recordFile={recordFile}
        review={buildProjectOutcomeReviewViewModel({
          score: {
            business: 88,
            estimatedLift: 7,
            fullMarks: 100,
            missingMaterials: 2,
            pricing: 91,
            technical: 82,
            total: 86,
          },
        })}
        task={completeTask}
      />,
    );

    expect(screen.queryByRole('heading', { name: '成果生成已完成' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: '成果生成执行进度' })).not.toBeInTheDocument();

    const scores = screen.getByRole('group', { name: '标书成果评分' });
    expect(within(scores).getByText('综合评分').parentElement).toHaveTextContent('86 分 / 100');
    expect(within(scores).getByText('商务标').parentElement).toHaveTextContent('88 分');
    expect(within(scores).getByText('技术标').parentElement).toHaveTextContent('82 分');
    expect(within(scores).getByText('价格文件').parentElement).toHaveTextContent('91 分');
    expect(within(scores).getByText('可提升空间').parentElement).toHaveTextContent('+7 分');
    expect(within(scores).getByText('缺失材料').parentElement).toHaveTextContent('2 项');

    expect(screen.getByLabelText('成果评分与响应记录'))
      .toHaveAttribute('data-layout-region', 'completion-summary');
    const fileButton = screen.getByRole('button', { name: /编制逻辑与评分响应记录\.docx/ });
    expect(fileButton).toHaveTextContent('V3 · 1.2 MB');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('资质有效期核验')).not.toBeInTheDocument();
    expect(screen.queryByText('请确认资质证书在投标截止日仍然有效。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^下载 / })).not.toBeInTheDocument();
    await user.click(fileButton);
    expect(onOpenRecordFile).toHaveBeenCalledWith(recordFile);
  });

  it('places scores above Agent status and keeps records at the bottom', () => {
    render(
      <ProjectCompletionDashboard
        findings={[]}
        review={buildProjectOutcomeReviewViewModel({})}
        status={<section aria-label="Agent 状态"><h2>成果生成已完成</h2></section>}
        task={completeTask}
      />,
    );

    const status = screen.getByRole('region', { name: 'Agent 状态' });
    const scores = screen.getByRole('region', { name: '评分结果' });
    const top = status.closest('.project-completion-dashboard__top');
    expect(top).toHaveClass('project-completion-dashboard__top--with-status');
    expect(top).toContainElement(scores);
    expect(scores.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(top).not.toContainElement(screen.getByRole('region', { name: '编制逻辑与评分响应记录' }));
    expect(screen.getByRole('heading', { name: '成果生成已完成' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '编制逻辑与评分响应记录' })).not.toBeInTheDocument();
  });

  it('offers independent view and download actions for the actual generated record', async () => {
    const user = userEvent.setup();
    const onOpenRecordFile = vi.fn();
    const onDownloadRecordFile = vi.fn();
    const recordFile = {
      category: 'internal' as const,
      id: 'record-file-v4',
      name: '编制逻辑与评分响应记录.docx',
      versionLabel: 'V4',
    };
    render(
      <ProjectCompletionDashboard
        findings={[finding]}
        onDownloadRecordFile={onDownloadRecordFile}
        onOpenRecordFile={onOpenRecordFile}
        recordFile={recordFile}
        review={buildProjectOutcomeReviewViewModel({})}
        task={completeTask}
      />,
    );

    const record = screen.getByRole('region', { name: '编制逻辑与评分响应记录' });
    expect(record).toHaveTextContent('V4');
    await user.click(within(record).getByRole('button', { name: /查看$/ }));
    expect(onOpenRecordFile).toHaveBeenCalledWith(recordFile);
    expect(onDownloadRecordFile).not.toHaveBeenCalled();
    await user.click(within(record).getByRole('button', { name: `下载 ${recordFile.name}` }));
    expect(onDownloadRecordFile).toHaveBeenCalledWith(recordFile);
    expect(onOpenRecordFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('资质有效期核验')).not.toBeInTheDocument();
  });

  it('uses dashes for missing backend fields and never derives totals from findings', () => {
    const sparseFinding: ReviewFinding = {
      evidence: {
        locator: '',
        sourceLabel: '',
        verification: 'missing',
      },
      id: 'sparse',
      outcome: 'unknown',
      ruleVersion: 'rule-missing',
      suggestion: '',
      title: '',
    };

    render(
      <ProjectCompletionDashboard
        findings={[sparseFinding]}
        review={buildProjectOutcomeReviewViewModel({})}
        task={{ message: '', percent: null, title: '' }}
      />,
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('尚无评分')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '标书成果评分' })).not.toBeInTheDocument();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the actual scale and associated versions and warns when that score is stale', () => {
    render(
      <ProjectCompletionDashboard
        findings={[]}
        review={buildProjectOutcomeReviewViewModel({
          score: { total: 72, fullMarks: 80, scale: 'score_rules', versionLabel: '商务文件 V2 · 技术文件 V3' },
          scoreIsStale: true,
        })}
        task={completeTask}
      />,
    );
    expect(screen.getByText('综合评分').parentElement).toHaveTextContent('72 分 / 80');
    expect(screen.getByText('评分已过期')).toBeInTheDocument();
    expect(screen.getByText('招标评分细则')).toBeInTheDocument();
    expect(screen.getByText('评分版本：商务文件 V2 · 技术文件 V3')).toBeInTheDocument();
    expect(screen.getByText('成果已更新，当前分数仅供参考。')).toBeInTheDocument();
  });

  it('does not assume an undisclosed maximum score or category breakdown', () => {
    render(
      <ProjectCompletionDashboard
        findings={[finding]}
        review={buildProjectOutcomeReviewViewModel({ score: { total: 0, scale: 'builtin' } })}
        task={completeTask}
      />,
    );
    const scores = screen.getByRole('group', { name: '标书成果评分' });
    expect(within(scores).getByText('综合评分').parentElement).toHaveTextContent('0 分');
    expect(scores).not.toHaveTextContent('/ 100');
    expect(within(scores).getByText('商务标').parentElement).toHaveTextContent('—');
    expect(screen.getByText('完整性参考评分')).toBeInTheDocument();
    expect(screen.queryByText('尚无评分')).not.toBeInTheDocument();
  });

  it('makes an absent score an explicit simulation-evaluation state instead of a failed response', async () => {
    const user = userEvent.setup();
    const onOpenReview = vi.fn();
    render(
      <ProjectCompletionDashboard
        findings={[]}
        onOpenReview={onOpenReview}
        review={buildProjectOutcomeReviewViewModel({})}
        task={completeTask}
      />,
    );
    expect(within(screen.getByRole('region', { name: '评分结果' })).getByRole('status')).toHaveTextContent('尚未发起模拟评标');
    await user.click(screen.getByRole('button', { name: '发起模拟评标' }));
    expect(onOpenReview).toHaveBeenCalledOnce();
  });

  it('keeps an in-progress score state distinct from an unstarted score', () => {
    render(
      <ProjectCompletionDashboard
        findings={[]}
        onOpenReview={vi.fn()}
        review={buildProjectOutcomeReviewViewModel({
          tasks: [{ phase: 'bid_review', sequence: 1, status: 'running', task_type: 'bid_review' }],
        })}
        task={completeTask}
      />,
    );
    const scores = screen.getByRole('region', { name: '评分结果' });
    expect(within(scores).getByRole('status')).toHaveTextContent('系统正依据已识别的评分规则评审当前标书成果');
    expect(within(scores).queryByRole('button', { name: '发起模拟评标' })).not.toBeInTheDocument();
  });

  it('renders a clear empty state when the backend has no response records', () => {
    render(
      <ProjectCompletionDashboard
        findings={[]}
        review={buildProjectOutcomeReviewViewModel({ score: { total: 86 } })}
        task={completeTask}
      />,
    );

    expect(screen.getByRole('status', { name: '评分响应记录空状态' }))
      .toHaveTextContent('内部管理文件尚未生成');
    expect(screen.getByRole('status', { name: '评分响应记录空状态' }))
      .toHaveTextContent('编制逻辑与评分响应记录');
    expect(screen.queryByRole('button', { name: /查看|下载/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('does not imply a structured score has verified the current formal file', () => {
    render(<ProjectCompletionDashboard findings={[]} task={completeTask}
      review={buildProjectOutcomeReviewViewModel({ score: { total: 85, formalFileVersionUnverified: true } })} />);
    expect(screen.getByText('评分尚未关联正式文件版本，仅供参考。')).toBeInTheDocument();
    expect(screen.getByText('综合评分').parentElement).toHaveTextContent('85');
  });
});
