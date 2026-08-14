import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
    const workspaceNavigation = screen.getByRole('navigation', { name: '项目工作区页面' });
    expect(within(workspaceNavigation).getByRole('tab', { name: '项目资料' })).toHaveAttribute(
      'href', '/projects/BV-2026-018/materials',
    );
    expect(within(workspaceNavigation).getByRole('tab', { name: '标书成果预览' }))
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

    expect(screen.getByText('项目成果尚未生成')).toBeInTheDocument();
    expect(screen.getByText('暂无模拟得分')).toBeInTheDocument();
    expect(screen.queryByLabelText('综合得分 91.4 分')).not.toBeInTheDocument();
    const emptyState = screen.getByText('项目成果尚未生成').closest<HTMLElement>('.bv-overview-empty');
    expect(emptyState).not.toBeNull();
    expect(within(emptyState!).queryByRole('link', { name: '前往项目材料' })).not.toBeInTheDocument();
  });

  it('reports a successful empty deliverables response and a queued generation task without mock cards', async () => {
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
      name: /成果接口调用成功，返回 0 项/,
    });
    expect(emptyState).toHaveAttribute('data-request-status', 'success');
    expect(screen.getByText('后端已成功返回空列表，因此页面不会生成虚拟成果卡片。')).toBeInTheDocument();
    expect(screen.getByText('GET /api/v1/deliverables?project_id=1')).toBeInTheDocument();
    expect(screen.getByText('调用成功 · 0 项成果')).toBeInTheDocument();
    expect(screen.getByText('生成任务：queued · 等待执行器')).toBeInTheDocument();
    expect(within(emptyState).getByText('任务已经入队，尚未被 worker 领取。')).toBeInTheDocument();
    expect(within(emptyState).queryByRole('link', { name: '前往项目材料' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看任务进度' }));
    expect(onOpenTasks).toHaveBeenCalledOnce();
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

    expect(screen.getByRole('status', { name: '正在调用成果接口' }))
      .toHaveAttribute('data-request-status', 'loading');
    expect(screen.getByText('请求进行中')).toBeInTheDocument();

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

    expect(screen.getByRole('status', { name: '成果接口调用失败' }))
      .toHaveAttribute('data-request-status', 'error');
    expect(screen.getByText('成果版本加载超时')).toBeInTheDocument();
  });

  it('routes each preview to its own versioned editor and selects only real versions', async () => {
    const user = userEvent.setup();
    const onSelectVersion = vi.fn();
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
        onSelectVersion={onSelectVersion}
        overview={overview}
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

    const emptyState = screen.getByRole('status', { name: '成果接口调用失败' });
    expect(within(emptyState).getByText('服务不可用')).toBeInTheDocument();
    expect(within(emptyState).queryByRole('link', { name: '前往项目材料' })).not.toBeInTheDocument();
  });

  it('shows unavailable backend metrics as dashes and disables download without a version', () => {
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
        project={project}
        projectId="BV-2026-018"
      />,
    );

    const card = screen.getByRole('heading', { name: '技术标文件', level: 2 }).closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('总页数').parentElement).toHaveTextContent('总页数—');
    expect(within(card!).getByText('缺资料份数').parentElement).toHaveTextContent('缺资料份数—');
    expect(screen.getByRole('button', { name: '技术标文件尚无可下载版本' })).toBeDisabled();
    expect(screen.getByText('商务分').parentElement).toHaveTextContent('商务分— / 30');
    expect(screen.getByText('否决风险数').parentElement).toHaveTextContent('否决风险数— 项');
    expect(screen.getByText('缺失材料数').parentElement).toHaveTextContent('缺失材料数0 项');
  });
});
