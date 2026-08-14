import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { buildProjectOutcomeReviewViewModel } from './ProjectOutcomeReviewPanel';
import { ProjectOverviewPage, type ProjectOverviewView } from './ProjectOverviewPage';
import type { ProjectSummary } from './project-view-model';

const project: ProjectSummary = {
  id: 'BV-2026-018', code: 'BV-2026-018', title: '测试项目', buyer: '测试招标人',
  stage: '材料解析', progress: 0, deadline: '2026-08-20 10:00', materialCount: 0,
  riskCount: 0, updatedAt: '2026-08-14',
};

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
  it('uses the content-sized workbench layout on the overview page', () => {
    render(
      <ProjectOverviewPage
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={vi.fn()}
        project={project}
        projectId="BV-2026-018"
      />,
    );

    expect(screen.getByRole('main').closest('.bv-project-workspace')).toHaveClass(
      'bv-project-workspace--content',
    );
    expect(screen.queryByText('当前任务数据已隔离')).not.toBeInTheDocument();
    expect(screen.queryByText(/本次招标材料、需求及成果只保存在项目事件中/))
      .not.toBeInTheDocument();
  });

  it('removes the old header shortcuts and disables version selection without real versions', () => {
    render(
      <ProjectOverviewPage enterpriseMaterials={[]} materials={[]} project={project} projectId="BV-2026-018" onOpenTasks={vi.fn()} />,
    );

    expect(screen.queryByRole('link', { name: '打开项目材料' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '报价分析' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '查看提升建议' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看提升建议' })).not.toBeInTheDocument();
    const workspaceNavigation = screen.getByRole('navigation', { name: '项目工作区页面' });
    expect(within(workspaceNavigation).getByRole('link', { name: '项目资料' })).toHaveAttribute(
      'href', '/projects/BV-2026-018/materials',
    );
    expect(within(workspaceNavigation).getByRole('link', { name: '标书成果预览' }))
      .toHaveAttribute('aria-current', 'page');
    const versionSelect = screen.getByRole('combobox', { name: '成果版本' });
    expect(versionSelect).toBeDisabled();
    expect(versionSelect).toHaveValue('');
    expect(screen.getByRole('option', { name: '暂无成果版本' })).toBeInTheDocument();
  });

  it('shows a project-scoped pending state when no overview data exists', () => {
    render(
      <ProjectOverviewPage enterpriseMaterials={[]} materials={[]} project={{ ...project, id: 'BV-2026-015' }} projectId="BV-2026-015" onOpenTasks={vi.fn()} />,
    );

    expect(screen.getByText('当前暂无标书成果')).toBeInTheDocument();
    expect(screen.getByText('尚未发现成果生成任务，请完成材料准备后发起成果生成。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '尚无模拟评标结果' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '模拟评标六项指标' })).not.toBeInTheDocument();
    const emptyState = screen.getByText('当前暂无标书成果').closest<HTMLElement>('.bv-overview-empty');
    expect(emptyState).not.toBeNull();
    expect(within(emptyState!).queryByRole('link', { name: '前往项目材料' })).not.toBeInTheDocument();
    expect(within(emptyState!).queryByRole('button', { name: '查看任务进度' })).not.toBeInTheDocument();
  });

  it('shows queued generation progress without exposing API diagnostics in the business area', async () => {
    const user = userEvent.setup();
    const onOpenTasks = vi.fn();
    render(
      <ProjectOverviewPage
        deliverables={[]}
        deliverablesRequest={{
          endpoint: '/api/v1/deliverables?project_id=1',
          method: 'GET',
          status: 'success',
        }}
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={onOpenTasks}
        project={project}
        projectId="1"
        taskSummary={{
          message: '任务已经入队，尚未被 worker 领取。',
          percent: 0,
          status: 'queued',
          title: '成果编制',
        }}
      />,
    );

    const emptyState = screen.getByRole('status', {
      name: '成果生成正在执行',
    });
    expect(emptyState).toHaveAttribute('data-request-status', 'success');
    expect(emptyState).toHaveAttribute('data-task-status', 'queued');
    expect(within(emptyState).getByText('系统正在根据当前项目材料生成成果，请留意任务进度。')).toBeInTheDocument();
    expect(within(emptyState).getByText('执行中')).toBeInTheDocument();
    expect(within(emptyState).getByText('任务已提交，系统正在处理，请留意任务进度。')).toBeInTheDocument();
    expect(within(emptyState).queryByText('任务已经入队，尚未被 worker 领取。')).not.toBeInTheDocument();
    expect(within(emptyState).getByRole('progressbar', { name: '成果生成任务进度' }))
      .toHaveAttribute('aria-valuenow', '0');
    expect(within(emptyState).getByRole('progressbar', { name: '成果生成任务进度' }))
      .toHaveAttribute('aria-valuetext', '0% · 执行中');
    expect(within(emptyState).getByText('0%')).toBeInTheDocument();
    expect(within(emptyState).getByText('执行中').closest('.bv-overview-empty__task'))
      .toHaveClass('bv-overview-empty__task--queued');
    expect(within(emptyState).queryByText('/api/v1/deliverables?project_id=1')).not.toBeInTheDocument();
    expect(emptyState).not.toHaveTextContent(/接口调用成功|返回 0 项|虚拟成果卡片|GET \/api/);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();

    await user.click(within(emptyState).getByRole('button', { name: '查看任务进度' }));
    expect(onOpenTasks).toHaveBeenCalledOnce();
  });

  it('keeps a real task visible when the backend has not reported a percent', () => {
    const commonProps = {
      deliverablesRequest: {
        endpoint: '/api/v1/deliverables?project_id=1',
        status: 'success' as const,
      },
      enterpriseMaterials: [],
      materials: [],
      onOpenTasks: vi.fn(),
      project,
      projectId: '1',
      taskSummary: {
        message: '后端尚未返回百分比。',
        percent: null,
        status: 'running' as const,
        title: '成果编制',
      },
    };
    const { rerender } = render(<ProjectOverviewPage {...commonProps} deliverables={[]} />);

    const emptyState = screen.getByRole('status', { name: '成果生成正在执行' });
    expect(within(emptyState).getByText('进度待更新')).toBeInTheDocument();
    expect(within(emptyState).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: '查看任务进度' })).toBeInTheDocument();
    expect(emptyState).not.toHaveTextContent('0%');

    rerender(<ProjectOverviewPage {...commonProps} deliverables={overview.deliverables} />);
    const headerProgress = screen.getByRole('button', { name: '查看任务进度，当前进度待更新' });
    expect(headerProgress).toHaveTextContent('进度待更新');
    expect(headerProgress).not.toHaveTextContent('0%');
  });

  it('distinguishes a pending deliverables request from a failed request', () => {
    const baseProps = {
      deliverables: [],
      enterpriseMaterials: [],
      materials: [],
      onOpenTasks: vi.fn(),
      project,
      projectId: '1',
    };
    const { rerender } = render(
      <ProjectOverviewPage
        {...baseProps}
        deliverablesRequest={{
          endpoint: '/api/v1/deliverables?project_id=1',
          status: 'loading',
        }}
      />,
    );

    expect(screen.getByRole('status', { name: '正在加载标书成果' }))
      .toHaveAttribute('data-request-status', 'loading');
    expect(screen.getByText('正在获取当前项目的成果状态，请稍候。')).toBeInTheDocument();

    rerender(
      <ProjectOverviewPage
        {...baseProps}
        deliverablesRequest={{
          endpoint: '/api/v1/deliverables?project_id=1',
          errorMessage: '成果版本加载超时',
          status: 'error',
        }}
      />,
    );

    expect(screen.getByRole('status', { name: '暂时无法加载标书成果' }))
      .toHaveAttribute('data-request-status', 'error');
    expect(screen.getByText('成果状态暂时不可用，请稍后重试。')).toBeInTheDocument();
    expect(screen.queryByText('成果版本加载超时')).not.toBeInTheDocument();
    expect(screen.queryByText('/api/v1/deliverables?project_id=1')).not.toBeInTheDocument();
  });

  it.each([
    ['running', 42, '成果生成正在执行', '执行中', '系统正在根据当前项目材料生成成果，请留意任务进度。'],
    ['retrying', 35, '成果生成任务正在重试', '等待重试', '上次执行尚未完成，系统正在等待下一次重试。'],
    ['waiting_user', 50, '成果生成等待您的处理', '等待用户处理', '请查看任务详情并完成所需操作，任务随后才能继续。'],
    ['succeeded', 100, '成果生成任务已完成', '任务已完成', '任务已完成，成果列表正在更新；如长时间未显示，请查看任务详情。'],
    ['failed', 63, '成果生成失败', '生成失败', '本次生成任务未成功，请查看任务详情了解可公开的失败信息。'],
  ] as const)(
    'shows the %s generation status in user-facing language',
    (status, percent, title, statusLabel, description) => {
      render(
        <ProjectOverviewPage
          deliverables={[]}
          deliverablesRequest={{ endpoint: '/private/debug/path', status: 'success' }}
          enterpriseMaterials={[]}
          materials={[]}
          onOpenTasks={vi.fn()}
          project={project}
          projectId="1"
          taskSummary={{
            message: '这是后端公开任务说明。',
            percent,
            status,
            title: '成果编制',
          }}
        />,
      );

      const emptyState = screen.getByRole('status', { name: title });
      expect(within(emptyState).getByText(statusLabel)).toBeInTheDocument();
      expect(within(emptyState).getByText(description)).toBeInTheDocument();
      expect(within(emptyState).getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(percent),
      );
      expect(within(emptyState).getByRole('button', { name: '查看任务进度' })).toBeInTheDocument();
      expect(emptyState).not.toHaveTextContent('/private/debug/path');
      if (status === 'running') {
        expect(within(emptyState).getByText('任务已提交，系统正在处理，请留意任务进度。'))
          .toBeInTheDocument();
        expect(within(emptyState).queryByText('这是后端公开任务说明。')).not.toBeInTheDocument();
      } else {
        expect(within(emptyState).getByText('这是后端公开任务说明。')).toBeInTheDocument();
      }
    },
  );

  it('routes each preview to its own versioned editor and selects only real versions', async () => {
    const user = userEvent.setup();
    const onSelectVersion = vi.fn();
    const onOpenImprovementSuggestions = vi.fn();
    const versionOptions = [
      { deliverableId: 'business' as const, title: '商务标文件', versionId: 'business-v8', isCurrent: true },
      { deliverableId: 'technical' as const, title: '技术标文件', versionId: 'technical-v6' },
      { deliverableId: 'quote' as const, title: '报价单', versionId: 'quote-v4' },
    ];
    render(
      <ProjectOverviewPage
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={vi.fn()}
        onOpenImprovementSuggestions={onOpenImprovementSuggestions}
        onSelectVersion={onSelectVersion}
        overview={overview}
        outcomeReview={buildProjectOutcomeReviewViewModel({ score: overview.score })}
        project={project}
        projectId="BV-2026-018"
        versionOptions={versionOptions}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: '标书成果预览' })).toBeInTheDocument();
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
    expect(screen.queryByRole('link', { name: '报价分析' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '打开项目材料' })).not.toBeInTheDocument();
    const versionSelect = screen.getByRole('combobox', { name: '成果版本' });
    expect(versionSelect).toBeEnabled();
    expect(versionSelect).toHaveValue('business:business-v8');
    expect(screen.getByRole('option', { name: '商务标文件 · V8 · 当前' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '技术标文件 · V6' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '报价单 · V4' })).toBeInTheDocument();

    await user.selectOptions(versionSelect, 'technical:technical-v6');
    expect(onSelectVersion).toHaveBeenCalledWith(versionOptions[1]);

    await user.click(screen.getByRole('button', { name: '查看提升建议' }));
    expect(onOpenImprovementSuggestions).toHaveBeenCalledOnce();
  });

  it('keeps the task progress entry available when results already exist', async () => {
    const user = userEvent.setup();
    const onOpenTasks = vi.fn();
    render(
      <ProjectOverviewPage
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={onOpenTasks}
        overview={overview}
        project={project}
        projectId="BV-2026-018"
        taskSummary={{
          message: '成果正在更新',
          percent: 42,
          status: 'running',
          title: '成果编制',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '查看任务进度，当前 42%' }));
    expect(onOpenTasks).toHaveBeenCalledOnce();
  });

  it('does not show a project-material shortcut when the deliverables request fails', () => {
    render(
      <ProjectOverviewPage
        deliverables={[]}
        deliverablesRequest={{
          endpoint: '/api/v1/deliverables?project_id=1',
          errorMessage: '服务不可用',
          status: 'error',
        }}
        enterpriseMaterials={[]}
        materials={[]}
        onOpenTasks={vi.fn()}
        project={project}
        projectId="1"
      />,
    );

    const emptyState = screen.getByRole('status', { name: '暂时无法加载标书成果' });
    expect(within(emptyState).queryByText('服务不可用')).not.toBeInTheDocument();
    expect(within(emptyState).getByText('成果状态暂时不可用，请稍后重试。')).toBeInTheDocument();
    expect(within(emptyState).queryByRole('link', { name: '前往项目材料' })).not.toBeInTheDocument();
  });

  it('shows truthful outcome scores and disables download without a version', () => {
    const unknownOverview: ProjectOverviewView = {
      deliverables: [{
        id: 'technical', title: '技术标文件', words: '—', score: '待评审', lift: '—',
        tone: 'technical',
      }],
      score: { estimatedLift: 0, missingMaterials: 0, total: 82 },
    };
    render(
      <ProjectOverviewPage
        enterpriseMaterials={[]}
        materials={[]}
        onDownloadDeliverable={vi.fn()}
        onOpenTasks={vi.fn()}
        overview={unknownOverview}
        outcomeReview={buildProjectOutcomeReviewViewModel({ score: unknownOverview.score })}
        project={project}
        projectId="BV-2026-018"
      />,
    );

    const card = screen.getByRole('heading', { name: '技术标文件', level: 2 }).closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('总页数').parentElement).toHaveTextContent('总页数—');
    expect(within(card!).getByText('缺资料份数').parentElement).toHaveTextContent('缺资料份数—');
    expect(screen.getByRole('button', { name: '技术标文件尚无可下载版本' })).toBeDisabled();
    expect(screen.getByText('82')).toBeInTheDocument();
    const reviewMetrics = screen.getByRole('group', { name: '标书成果模拟评标分项' });
    expect(within(reviewMetrics).getByText('商务分').parentElement).toHaveTextContent('—');
    expect(within(reviewMetrics).getByText('缺失材料数').parentElement).toHaveTextContent('0 项');
    expect(screen.queryByRole('list', { name: '模拟评标六项指标' })).not.toBeInTheDocument();
  });
});
