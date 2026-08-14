import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectMaterialsPage } from './ProjectMaterialsPage';
import type { ProjectMaterial, ProjectRequirement, ProjectSnapshot } from './types';

const materials: ProjectMaterial[] = [
  {
    id: 'material-1',
    name: '海上升压站招标文件.pdf',
    kind: 'tender_document',
    revisionNo: 3,
    parseStatus: 'parsed',
    parseProgress: 100,
    blocksCount: 1286,
    uploadedAt: '2026-08-05 10:08',
    supersedesRevisionNo: 2,
  },
  {
    id: 'material-2',
    name: '补遗文件一.pdf',
    kind: 'clarification',
    revisionNo: 1,
    parseStatus: 'parsing',
    parseProgress: 58,
    uploadedAt: '2026-08-05 10:16',
  },
];

const requirements: ProjectRequirement[] = [
  {
    id: 'requirement-1',
    type: 'qualification',
    title: '投标人资质等级',
    content: '投标人须具备电力工程施工总承包一级资质。',
    confidence: 0.64,
    confirmationStatus: 'needs_confirmation',
    revisionNo: 4,
    coordinate: {
      fileName: '海上升压站招标文件.pdf',
      fileRevisionNo: 3,
      pageNo: 18,
      blockIndex: 42,
    },
  },
  {
    id: 'requirement-2',
    type: 'quote_rule',
    title: '最高投标限价',
    content: '含税总价不得超过 2600 万元。',
    confidence: 0.98,
    confirmationStatus: 'confirmed',
    revisionNo: 4,
    coordinate: {
      fileName: '海上升压站招标文件.pdf',
      fileRevisionNo: 3,
      pageNo: 76,
      blockIndex: 301,
    },
  },
];

const snapshots: ProjectSnapshot[] = [
  {
    id: 'snapshot-20260805',
    label: '生成任务输入快照',
    createdAt: '2026-08-05 10:30',
    materialRevisionCount: 2,
    requirementRevisionNo: 4,
    isCurrent: true,
  },
];

describe('ProjectMaterialsPage', () => {
  it('keeps uploads in the current project and shows parsing revisions', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    const onStartTask = vi.fn();

    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={onStartTask}
        onUpload={onUpload}
      />,
    );

    expect(screen.getAllByRole('heading', { name: '当前招标材料' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '补充资料' })).toBeInTheDocument();
    expect(screen.queryByText('当前项目专属资料')).not.toBeInTheDocument();
    expect(screen.queryByText('项目助手添加文件')).not.toBeInTheDocument();
    expect(screen.queryByText('招标材料识别结果')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '当前项目材料视图' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '当前招标材料内容' })).toBeInTheDocument();
    const workspaceNavigation = screen.getByRole('navigation', { name: '项目工作区页面' });
    expect(within(workspaceNavigation).getByRole('link', { name: '项目资料' }))
      .toHaveAttribute('aria-current', 'page');
    expect(within(workspaceNavigation).getByRole('link', { name: '标书成果预览' })).toHaveAttribute(
      'href', '/projects/BV-2026-0088/overview',
    );
    expect(screen.queryByText('项目域 · BV-2026-0088')).not.toBeInTheDocument();
    expect(screen.queryByText(/不会跨项目复用/)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '补充资料' }))
      .toHaveTextContent('暂无补充资料');
    expect(screen.getByText('替代版本 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '补遗文件一.pdf解析进度' })).toHaveAttribute(
      'aria-valuenow',
      '58',
    );
    expect(screen.queryByRole('button', { name: /转存.*企业资料/ })).not.toBeInTheDocument();

    const upload = screen.getByLabelText(/选择或拖拽招标材料/);
    const file = new File(['clarification'], '澄清答复.pdf', { type: 'application/pdf' });
    await user.upload(upload, file);

    expect(onUpload).toHaveBeenCalledWith('BV-2026-0088', [file]);

    const completedBid = new File(['bid'], '技术标.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText(/已制作完成的标书/), completedBid);

    expect(onUpload).toHaveBeenCalledWith('BV-2026-0088', [completedBid]);
    await user.click(screen.getByRole('radio', { name: '校核已完成标书' }));
    await user.click(screen.getByRole('button', { name: '开始校核' }));
    expect(onStartTask).toHaveBeenCalledWith('BV-2026-0088', 'validate');
    expect(await screen.findByRole('button', { name: '开始校核' })).toBeEnabled();
    expect(screen.queryByText(/校核任务已创建/)).not.toBeInTheDocument();
    expect(screen.getByText('技术标.docx')).toBeInTheDocument();
  });

  it('starts document generation when no completed bid has been uploaded', async () => {
    const user = userEvent.setup();
    const onStartTask = vi.fn();

    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={onStartTask}
      />,
    );

    expect(screen.getByRole('button', { name: '请选择任务类型' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '生成标书' }));
    await user.click(screen.getByRole('button', { name: '开始生成' }));

    expect(onStartTask).toHaveBeenCalledWith('BV-2026-0088', 'generate');
    expect(await screen.findByRole('button', { name: '开始生成' })).toBeEnabled();
    expect(screen.queryByText(/生成任务已创建/)).not.toBeInTheDocument();
  });

  it.each(['queued', 'running', 'retrying', 'waiting_user', 'succeeded'] as const)(
    'hides both central submission areas for a %s backend task without showing task progress',
    (status) => {
    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={vi.fn()}
        onUpload={vi.fn()}
        taskStatus={status}
      />,
    );

    expect(screen.queryByLabelText(/选择或拖拽招标材料/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/已制作完成的标书/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '生成标书' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '校核已完成标书' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '请选择任务类型' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '企业资料上传不可用' })).toBeDisabled();
    expect(screen.getByText('替代版本 2')).toBeInTheDocument();
    expect(screen.queryByText(/成果编制|任务已提交|任务正在执行/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看任务进度' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '补充资料' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '当前招标材料' })).toBeInTheDocument();
  });

  it('groups materials only by the supplied real file ids and keeps supplemental files above tender files', () => {
    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={vi.fn()}
        supplementalMaterialIds={['material-2']}
      />,
    );

    const supplementalRegion = screen.getByRole('region', { name: '补充资料' });
    const tenderRegion = screen.getByRole('region', { name: '当前招标材料' });
    expect(supplementalRegion.compareDocumentPosition(tenderRegion) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(within(supplementalRegion).getByText('补遗文件一.pdf')).toBeInTheDocument();
    expect(within(supplementalRegion).queryByText('海上升压站招标文件.pdf')).not.toBeInTheDocument();
    expect(within(tenderRegion).getByText('海上升压站招标文件.pdf')).toBeInTheDocument();
    expect(within(tenderRegion).queryByText('补遗文件一.pdf')).not.toBeInTheDocument();
  });

  it('routes only the bottom assistant attachment input to supplemental upload handling', async () => {
    const user = userEvent.setup();
    const onAssistantAddFiles = vi.fn();
    const onUpload = vi.fn();
    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onAssistantAddFiles={onAssistantAddFiles}
        onStartTask={vi.fn()}
        onUpload={onUpload}
      />,
    );

    const tenderFile = new File(['tender'], '招标补遗.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/选择或拖拽招标材料/), tenderFile);
    expect(onUpload).toHaveBeenCalledWith('BV-2026-0088', [tenderFile]);
    expect(onAssistantAddFiles).not.toHaveBeenCalled();

    const assistantFile = new File(['assistant'], '设备清单.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(screen.getByLabelText('添加当前项目文件'), assistantFile);
    expect(onAssistantAddFiles).toHaveBeenCalledWith([assistantFile]);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('shows a failed backend task but keeps both submission areas retryable', async () => {
    const user = userEvent.setup();
    const onStartTask = vi.fn();

    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={onStartTask}
        onUpload={vi.fn()}
        taskStatus="failed"
      />,
    );

    expect(screen.queryByText(/成果编制|任务执行失败/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/选择或拖拽招标材料/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '生成标书' }));
    await user.click(screen.getByRole('button', { name: '开始生成' }));
    expect(onStartTask).toHaveBeenCalledWith('BV-2026-0088', 'generate');
  });

  it('shows the six review metrics from real requirement and deliverable data', () => {
    render(
      <ProjectMaterialsPage
        deliverables={[
          { currentVersionNo: 2, kind: 'business' },
          { currentVersionNo: 0, kind: 'technical' },
        ]}
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        onStartTask={vi.fn()}
        requirements={[
          ...requirements,
          {
            ...requirements[0],
            id: 'score-rule-1',
            title: '技术评分标准',
            type: 'score_rule',
          },
        ]}
        snapshots={snapshots}
      />,
    );

    const metrics = screen.getByRole('list', { name: '模拟评标六项指标' });
    const metricItems = within(metrics).getAllByRole('listitem');
    expect(metricItems).toHaveLength(6);
    expect(metricItems.map((item) => item.querySelector('small')?.textContent)).toEqual([
      '已识别评分项',
      '已上传标书数量',
      '商务标状态',
      '技术标状态',
      '报价单状态',
      '待校核内容数量',
    ]);

    const scoreRule = within(metrics).getByText('已识别评分项').closest('[role="listitem"]');
    expect(scoreRule).toHaveTextContent('1项');
    expect(scoreRule).toHaveAttribute('data-metric-state', 'available');

    const completedBid = within(metrics).getByText('已上传标书数量').closest('[role="listitem"]');
    expect(completedBid).toHaveTextContent('—');
    expect(completedBid).toHaveTextContent('接口待提供');
    expect(completedBid).toHaveAttribute('data-metric-state', 'unavailable');

    const business = within(metrics).getByText('商务标状态').closest('[role="listitem"]');
    expect(business).toHaveTextContent('已生成');
    expect(business).toHaveTextContent('当前版本 V2');
    expect(business).toHaveAttribute('data-metric-state', 'generated');

    for (const label of ['技术标状态', '报价单状态']) {
      const deliverable = within(metrics).getByText(label).closest('[role="listitem"]');
      expect(deliverable).toHaveTextContent('未生成');
      expect(deliverable).toHaveTextContent('暂无有效成果版本');
      expect(deliverable).toHaveAttribute('data-metric-state', 'missing');
    }

    const pendingCheck = within(metrics).getByText('待校核内容数量').closest('[role="listitem"]');
    expect(pendingCheck).toHaveTextContent('—');
    expect(pendingCheck).toHaveTextContent('接口待提供');
    expect(pendingCheck).toHaveAttribute('data-metric-state', 'unavailable');
    expect(screen.queryByText('材料解析完成')).not.toBeInTheDocument();
    expect(screen.queryByText('解析完成率')).not.toBeInTheDocument();
  });

  it('keeps existing versions generated while a real generation task is active', () => {
    const onStartTask = vi.fn();
    const { rerender } = render(
      <ProjectMaterialsPage
        deliverables={[
          { currentVersionNo: 2, kind: 'business' },
          { currentVersionNo: 4, kind: 'business' },
          { currentVersionNo: 0, kind: 'technical' },
        ]}
        generationInProgress
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        onStartTask={onStartTask}
        requirements={requirements}
        snapshots={snapshots}
      />,
    );

    const metrics = screen.getByRole('list', { name: '模拟评标六项指标' });
    const business = within(metrics).getByText('商务标状态').closest('[role="listitem"]');
    expect(business).toHaveTextContent('已生成');
    expect(business).toHaveTextContent('当前版本 V4');
    expect(business).toHaveAttribute('data-metric-state', 'generated');

    for (const label of ['技术标状态', '报价单状态']) {
      const deliverable = within(metrics).getByText(label).closest('[role="listitem"]');
      expect(deliverable).toHaveTextContent('执行中');
      expect(deliverable).toHaveTextContent('后端生成任务处理中');
      expect(deliverable).toHaveAttribute('data-metric-state', 'in-progress');
    }

    rerender(
      <ProjectMaterialsPage
        deliverables={[
          { currentVersionNo: 4, kind: 'business' },
          { currentVersionNo: 0, kind: 'technical' },
        ]}
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        onStartTask={onStartTask}
        requirements={requirements}
        snapshots={snapshots}
      />,
    );

    const updatedMetrics = screen.getByRole('list', { name: '模拟评标六项指标' });
    for (const label of ['技术标状态', '报价单状态']) {
      const deliverable = within(updatedMetrics).getByText(label).closest('[role="listitem"]');
      expect(deliverable).toHaveTextContent('未生成');
      expect(deliverable).toHaveAttribute('data-metric-state', 'missing');
    }
  });

  it('does not add a completed bid name when its upload rejects', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new Error('技术标.docx：文件内容无法读取'));
    const onStartTask = vi.fn();

    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={onStartTask}
        onUpload={onUpload}
      />,
    );

    const completedBid = new File(['broken'], '技术标.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText(/已制作完成的标书/), completedBid);

    expect(await screen.findByRole('alert')).toHaveTextContent('技术标.docx：文件内容无法读取');
    expect(screen.queryByText('技术标.docx')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '请选择任务类型' })).toBeDisabled();
  });

  it('shows a task creation rejection and keeps the task action retryable', async () => {
    const user = userEvent.setup();
    const onStartTask = vi.fn().mockRejectedValue(new Error('任务队列暂不可用'));

    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onStartTask={onStartTask}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '生成标书' }));
    await user.click(screen.getByRole('button', { name: '开始生成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('任务队列暂不可用');
    expect(screen.getByRole('button', { name: '开始生成' })).toBeEnabled();
    expect(screen.queryByText(/生成任务已创建/)).not.toBeInTheDocument();
  });

  it('confirms low-confidence Requirements and opens a frozen snapshot', async () => {
    const user = userEvent.setup();
    const onConfirmRequirement = vi.fn();
    const onOpenSnapshot = vi.fn();

    render(
      <ProjectMaterialsPage
        projectId="BV-2026-0088"
        projectName="海上升压站设备采购项目"
        materials={materials}
        requirements={requirements}
        snapshots={snapshots}
        onConfirmRequirement={onConfirmRequirement}
        onOpenSnapshot={onOpenSnapshot}
        onStartTask={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Requirement/ }));
    expect(screen.getByText('置信度 64%')).toBeInTheDocument();
    expect(screen.getByText(/第 18 页/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认原文' }));
    expect(onConfirmRequirement).toHaveBeenCalledWith('BV-2026-0088', 'requirement-1');

    await user.click(screen.getByRole('button', { name: /项目快照/ }));
    expect(screen.getByText('生成任务输入快照')).toBeInTheDocument();
    expect(screen.getByText('Requirement v4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /生成任务输入快照/ }));
    expect(onOpenSnapshot).toHaveBeenCalledWith('BV-2026-0088', 'snapshot-20260805');
  });
});
