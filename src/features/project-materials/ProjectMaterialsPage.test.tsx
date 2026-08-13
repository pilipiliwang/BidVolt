import { render, screen } from '@testing-library/react';
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

    expect(screen.getByRole('heading', { name: '当前招标材料' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('项目域 · BV-2026-0088');
    expect(screen.getByRole('note')).toHaveTextContent('不会跨项目复用');
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
    await user.click(screen.getByRole('button', { name: '开始校核' }));
    expect(onStartTask).toHaveBeenCalledWith('BV-2026-0088', 'validate');
    expect(screen.getByRole('button', { name: '任务已进入队列' })).toBeDisabled();
    expect(screen.getByText(/校核任务已创建/)).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: '开始生成' }));

    expect(onStartTask).toHaveBeenCalledWith('BV-2026-0088', 'generate');
    expect(screen.getByRole('button', { name: '任务已进入队列' })).toBeDisabled();
    expect(screen.getByText(/生成任务已创建/)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: '开始生成' })).toBeInTheDocument();
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
