import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  buildProjectFlowStages,
  ProjectEntryChoice,
  ProjectOptimizationFlow,
  ProjectTaskExecutionPanel,
  ProjectWorkflowFrame,
  resolveProjectWorkflowPhase,
} from './ProjectWorkflow';

describe('project workflow', () => {
  it('derives the four steps only from backend-backed facts', () => {
    expect(buildProjectFlowStages({
      currentTenderMaterialCount: 0,
      enterpriseMaterialCount: 0,
      hasDeliverables: false,
    })).toMatchObject({
      'enterprise-assets': { status: 'pending' },
      'project-materials': { status: 'current', statusLabel: '待上传' },
      'bid-preparation': { status: 'pending' },
      deliverables: { status: 'pending' },
    });

    const task = { message: '正在编制技术标', percent: 42, status: 'running' as const, title: '成果编制' };
    expect(resolveProjectWorkflowPhase({
      currentTenderMaterialCount: 2,
      enterpriseMaterialCount: 3,
      hasDeliverables: false,
      task,
    })).toBe('executing');
    expect(buildProjectFlowStages({
      currentTenderMaterialCount: 2,
      enterpriseMaterialCount: 3,
      hasDeliverables: false,
      task,
    })).toMatchObject({
      'project-materials': { status: 'completed', statusLabel: '已完成' },
      'bid-preparation': { status: 'current', statusLabel: '执行中' },
    });
  });

  it('keeps uploaded tender materials in parsing or confirmation until task start', () => {
    const baseFacts = {
      currentTenderMaterialCount: 3,
      enterpriseMaterialCount: 12,
      hasDeliverables: false,
    };

    expect(buildProjectFlowStages({
      ...baseFacts,
      currentTenderMaterialState: 'processing',
    })['project-materials']).toMatchObject({
      description: '正在解析 3 项招标材料',
      status: 'current',
      statusLabel: '解析中',
    });
    expect(buildProjectFlowStages({
      ...baseFacts,
      currentTenderMaterialState: 'ready',
    })['project-materials']).toMatchObject({
      description: '已接收 3 项招标材料，请确认',
      status: 'current',
      statusLabel: '待确认',
    });
    expect(buildProjectFlowStages({
      ...baseFacts,
      currentTenderMaterialState: 'error',
    })['project-materials']).toMatchObject({
      status: 'error',
      statusLabel: '解析异常',
    });
    expect(buildProjectFlowStages({
      ...baseFacts,
      currentTenderMaterialState: 'ready',
      materialPreparationConfirmed: true,
    })['project-materials']).toMatchObject({
      status: 'completed',
      statusLabel: '已完成',
    });
  });

  it('does not call generation from the disabled existing-bid entry', async () => {
    const onGenerate = vi.fn();
    render(<ProjectEntryChoice enterpriseReady={false} onGenerate={onGenerate} />);

    expect(screen.getByRole('button', { name: /审核已有标书/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /生成新的标书/ }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('keeps real-time task progress and the task drawer action visible', async () => {
    const onOpenTasks = vi.fn();
    render(
      <ProjectTaskExecutionPanel
        onOpenTasks={onOpenTasks}
        task={{ message: '正在读取评分要求', percent: 37, status: 'running', title: '成果编制' }}
      />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37');
    expect(screen.getByText('正在读取评分要求')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '查看任务进度' }));
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
  });

  it('shows the empty-project entry without inventing completed work', () => {
    render(
      <ProjectWorkflowFrame
        facts={{ currentTenderMaterialCount: 0, enterpriseMaterialCount: 0, hasDeliverables: false }}
        projectTitle="华北电网设备采购"
      >
        <ProjectEntryChoice enterpriseReady={false} onGenerate={vi.fn()} />
      </ProjectWorkflowFrame>,
    );

    const workflow = screen.getByRole('navigation', { name: '项目流程' });
    expect(workflow.querySelector('.project-flow-track__meta')).not.toBeInTheDocument();
    expect([...workflow.querySelectorAll('.project-flow-track__content')].map((item) => item.textContent)).toEqual([
      '上传企业资料', '上传材料', '标书制作/审核', '成果生成',
    ]);
    expect(within(workflow).getByRole('listitem', { name: '上传企业资料：未完成' }))
      .toHaveClass('project-flow-track__stage--pending');
    expect(within(workflow).getByRole('listitem', { name: '上传材料：待上传' }))
      .toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: '返回' })).toHaveAttribute('href', '/projects');
    expect(screen.getByText('华北电网设备采购')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '选择本次投标任务' })).toBeInTheDocument();
  });

  it('keeps material-preparation state accessible without showing status remarks', () => {
    render(
      <ProjectWorkflowFrame facts={{ currentTenderMaterialCount: 6, enterpriseMaterialCount: 12, hasDeliverables: false }}>
        <section aria-label="材料准备区">材料确认后发起任务</section>
      </ProjectWorkflowFrame>,
    );

    const workflow = screen.getByRole('navigation', { name: '项目流程' });
    expect(workflow.querySelector('.project-flow-track__meta')).not.toBeInTheDocument();
    expect(within(workflow).getByRole('listitem', { name: '上传企业资料：已完成' }))
      .toHaveClass('project-flow-track__stage--completed');
    expect(within(workflow).getByRole('listitem', { name: '上传材料：待确认' }))
      .toHaveAttribute('aria-current', 'step');
    expect(workflow).not.toHaveTextContent('待确认');
    expect(workflow).not.toHaveTextContent('已接收 6 项招标材料，请确认');
    expect(screen.getByRole('region', { name: '材料准备区' })).toBeInTheDocument();
  });

  it('wires the compact project identity editor without replacing the workflow track', async () => {
    const user = userEvent.setup();
    const onUpdateProjectDetails = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectWorkflowFrame
        facts={{ currentTenderMaterialCount: 1, enterpriseMaterialCount: 2, hasDeliverables: false }}
        onUpdateProjectDetails={onUpdateProjectDetails}
        projectTitle="项目基础信息测试"
        projectPackageNo="包 01"
        projectDeadline="2099-08-21 10:00"
      >
        <div>工作区</div>
      </ProjectWorkflowFrame>,
    );
    expect(screen.getByRole('navigation', { name: '项目流程' })).toBeInTheDocument();
    expect(screen.getByText('包 01')).toBeInTheDocument();
    expect(screen.getByText('2099-08-21 10:00')).toBeInTheDocument();
    await user.dblClick(screen.getByRole('button', { name: '编辑项目名称' }));
    await user.clear(screen.getByRole('textbox', { name: '项目名称' }));
    await user.type(screen.getByRole('textbox', { name: '项目名称' }), '已调整名称');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(onUpdateProjectDetails).toHaveBeenCalledWith({ title: '已调整名称' });
  });

  it('integrates backend task progress into the track and execution panel', () => {
    const task = {
      message: '正在读取评分办法并生成技术响应',
      percent: 63,
      status: 'running' as const,
      title: '标书成果编制',
    };
    render(
      <ProjectWorkflowFrame facts={{
        agentCompletion: 'active',
        currentTenderMaterialCount: 6,
        enterpriseMaterialCount: 12,
        hasDeliverables: false,
        task,
      }}>
        <ProjectTaskExecutionPanel onOpenTasks={vi.fn()} task={task} />
      </ProjectWorkflowFrame>,
    );

    const workflow = screen.getByRole('navigation', { name: '项目流程' });
    expect(within(workflow).getByRole('listitem', { name: '标书制作/审核：执行中' }))
      .toHaveAttribute('aria-current', 'step');
    expect(workflow).not.toHaveTextContent('正在读取评分办法并生成技术响应');
    expect(screen.getByText('正在读取评分办法并生成技术响应')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '成果生成任务进度' })).toHaveAttribute('aria-valuenow', '63');
    expect(screen.getByRole('button', { name: '查看任务进度' })).toBeInTheDocument();
  });

  it('keeps an unknown successful terminal result in final synchronization', () => {
    const task = {
      message: '主会话任务已结束，正在确认最终结果',
      percent: 100,
      status: 'succeeded' as const,
      title: '成果编制',
    };

    expect(resolveProjectWorkflowPhase({
      agentCompletion: 'unknown_terminal',
      currentTenderMaterialCount: 2,
      enterpriseMaterialCount: 3,
      hasDeliverables: false,
      task,
    })).toBe('finalizing');
  });

  it('keeps bid preparation completed when only deliverable synchronization failed', () => {
    const facts = {
      agentCompletion: 'complete' as const,
      currentTenderMaterialCount: 11,
      deliverablesState: 'error' as const,
      enterpriseMaterialCount: 1440,
      hasDeliverables: false,
      task: {
        message: '生成任务已结束，但成果版本尚未返回',
        percent: 100,
        status: 'sync_error' as const,
        title: '成果同步',
      },
    };

    expect(resolveProjectWorkflowPhase(facts)).toBe('finalizing');
    expect(buildProjectFlowStages(facts)).toMatchObject({
      'bid-preparation': { status: 'completed', statusLabel: '已完成' },
      deliverables: { status: 'error', statusLabel: '同步失败' },
    });
  });

  it('does not let historical deliverables hide the current generation state', () => {
    const activeFacts = {
      agentCompletion: 'active',
      currentTenderMaterialCount: 2,
      enterpriseMaterialCount: 3,
      hasDeliverables: true,
      task: { message: '正在生成新版本', percent: 28, status: 'running', title: '成果编制' },
    } as const;
    expect(resolveProjectWorkflowPhase(activeFacts)).toBe('executing');
    expect(buildProjectFlowStages(activeFacts)).toMatchObject({
      'bid-preparation': { description: '正在生成新版本 · 28%', status: 'current' },
      deliverables: { description: '等待标书制作完成', status: 'pending' },
    });

    expect(resolveProjectWorkflowPhase({
      agentCompletion: 'incomplete',
      currentTenderMaterialCount: 2,
      enterpriseMaterialCount: 3,
      hasDeliverables: true,
      task: { message: '本轮未完成', percent: 100, status: 'failed', title: '成果编制' },
    })).toBe('failed');
  });

  it('shows the post-deliverable optimization flow from returned deliverable and review facts', () => {
    render(
      <ProjectWorkflowFrame facts={{
        agentCompletion: 'complete',
        currentTenderMaterialCount: 6,
        enterpriseMaterialCount: 12,
        hasDeliverables: true,
      }}>
        <ProjectOptimizationFlow onOpenReview={vi.fn()} reviewReady />
      </ProjectWorkflowFrame>,
    );

    const workflow = screen.getByRole('navigation', { name: '项目流程' });
    expect(workflow.querySelector('.project-flow-track__meta')).not.toBeInTheDocument();
    const stages = within(workflow).getAllByRole('listitem');
    expect(stages).toHaveLength(4);
    for (const stage of stages) {
      expect(stage).toHaveAccessibleName(/：已完成$/);
      expect(stage).toHaveClass('project-flow-track__stage--completed');
      expect(stage).not.toHaveAttribute('aria-current');
    }
    expect(workflow).not.toHaveTextContent('成果版本已返回');
    expect(screen.getByRole('region', { name: '成果优化流程' })).toHaveTextContent('成果已生成模拟评标审核修改新版本复评');
    expect(screen.getByText(/评分已返回，可查看提升建议/)).toBeInTheDocument();
  });
});
