import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentRunViewModel } from '../../shared/task-events';
import type { OutcomeFileAgentContext } from './OutcomeFileWorkspace';
import { ProjectGenerationWorkspace } from './ProjectGenerationWorkspace';

const officeMocks = vi.hoisted(() => ({
  importFile: vi.fn(),
}));

vi.mock('./OnlyOfficeEditorWorkspace', () => ({
  importOnlyOfficeBridgeFile: officeMocks.importFile,
  listOnlyOfficeBridgeFiles: vi.fn().mockResolvedValue([]),
  OnlyOfficeEditorWorkspace: ({
    bridgeFile,
    contextBase,
    displayName,
    mode,
    selectedVersion,
    onSaved,
    onSendContextToAgent,
  }: {
    bridgeFile: { name: string };
    contextBase: OutcomeFileAgentContext;
    displayName: string;
    mode: string;
    selectedVersion?: number;
    onSaved: (version: number) => void;
    onSendContextToAgent: (context: OutcomeFileAgentContext) => void;
  }) => (
    <section aria-label={`${displayName} Office ${mode}`}>
      {bridgeFile.name}
      <span>Office version: {selectedVersion ?? 'latest'}</span>
      <button onClick={() => onSaved(1)}>保存测试修订</button>
      <button
        aria-label={`引用 ${displayName} 选区`}
        onClick={() => onSendContextToAgent({
          ...contextBase,
          location: 'Office 当前选区',
          selectedText: '合同节选',
        })}
        type="button"
      >引用</button>
    </section>
  ),
}));

const run: AgentRunViewModel = {
  actionList: [],
  completion: 'active',
  conversation: [],
  errorMessage: null,
  message: '正在编制标书。',
  outcome: null,
  percent: 45,
  phase: '标书制作/审核',
  projectId: '207',
  questions: [],
  reason: null,
  sessionId: 'session-207',
  status: 'running',
  streamState: 'connected',
  taskId: 'task-207',
};

describe('ProjectGenerationWorkspace Office resource previews', () => {
  beforeEach(() => {
    officeMocks.importFile.mockReset();
  });

  it('keeps a formal artifact downloadable when its optional Office preview bridge is unavailable', async () => {
    const user = userEvent.setup();
    const originalBlob = new Blob(['formal artifact'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const onLoadResourcePreview = vi.fn().mockResolvedValue({
      blob: originalBlob,
      kind: 'office',
      mimeType: originalBlob.type,
    });
    const onDownloadArtifact = vi.fn().mockResolvedValue(undefined);
    officeMocks.importFile.mockRejectedValueOnce(new Error('Failed to fetch local bridge details'));
    const artifact = {
      category: 'business' as const,
      id: 'artifact:207:502',
      name: '商务响应文件.docx',
      versionLabel: 'V1',
    };

    render(
      <ProjectGenerationWorkspace
        agentRun={run}
        artifactFiles={[artifact]}
        deliverables={[]}
        enterpriseMaterials={[]}
        materials={[]}
        onDownloadArtifact={onDownloadArtifact}
        onLoadResourcePreview={onLoadResourcePreview}
        outcomeReview={{
          canOpenTaskProgress: false,
          description: '等待评审。',
          state: 'waiting-results',
          title: '等待评审结果',
        }}
        task={{ message: '正在执行。', percent: 45, status: 'running', title: '标书制作/审核' }}
      />,
    );

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /商务文件.*已生成/ }));
    await user.click(within(rail).getByTitle('商务响应文件.docx'));

    expect(await screen.findByText('当前环境暂时无法打开此 Office 文件进行在线预览。可下载原文件后在本机查看。')).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch local bridge details')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下载原文件' }));
    expect(onDownloadArtifact).toHaveBeenCalledWith(artifact);
  });

  it('opens tender and enterprise Office documents in editable ONLYOFFICE tabs without replacing the source', async () => {
    const user = userEvent.setup();
    const tenderBlob = new Blob(['tender'], { type: 'application/msword' });
    const enterpriseBlob = new Blob(['enterprise'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const onLoadResourcePreview = vi.fn()
      .mockResolvedValueOnce({ blob: tenderBlob, kind: 'office', mimeType: tenderBlob.type })
      .mockResolvedValueOnce({ blob: enterpriseBlob, kind: 'office', mimeType: enterpriseBlob.type });
    officeMocks.importFile
      .mockResolvedValueOnce({ id: 'tender-bridge', name: '合同条款.doc', relative: 'imported/tender', size: 6 })
      .mockResolvedValueOnce({ id: 'enterprise-bridge', name: '企业清单.xlsx', relative: 'imported/enterprise', size: 10 });

    render(
      <ProjectGenerationWorkspace
        agentRun={run}
        deliverables={[]}
        enterpriseCategories={[{ id: 'qualification', label: '资质', parentId: null }]}
        enterpriseMaterials={[{
          categoryId: 'qualification',
          fileId: 'enterprise-file-id',
          id: 'enterprise-material',
          name: '企业清单.xlsx',
          status: '已同步',
        }]}
        materials={[{
          fileId: 'tender-file-id',
          id: 'tender-material',
          kind: 'tender_document',
          name: '合同条款.doc',
          status: '已识别',
        }]}
        onLoadResourcePreview={onLoadResourcePreview}
        outcomeReview={{
          canOpenTaskProgress: false,
          description: '等待评审。',
          state: 'waiting-results',
          title: '等待评审结果',
        }}
        task={{ message: '正在执行。', percent: 45, status: 'running', title: '标书制作/审核' }}
      />,
    );

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /招标材料/ }));
    await user.click(within(rail).getByRole('button', { name: /合同条款\.doc/ }));

    expect(await screen.findByRole('region', { name: '合同条款.doc Office edit' })).toBeInTheDocument();
    expect(officeMocks.importFile).toHaveBeenCalledWith(
      '207:tender:tender-material',
      '合同条款.doc',
      tenderBlob,
    );
    await user.click(screen.getByRole('button', { name: '保存测试修订' }));
    expect(screen.getByText('Office version: 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '引用 合同条款.doc 选区' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain([
      '引用成果：合同条款.doc · Office 当前选区',
      '选中内容：合同节选',
    ].join('\n'));

    await user.click(within(rail).getByRole('button', { name: /^企业资料 \d+项$/ }));
    await user.click(within(rail).getByRole('button', { name: /资质/ }));
    await user.click(within(rail).getByRole('button', { name: /企业清单\.xlsx/ }));

    expect(await screen.findByRole('region', { name: '企业清单.xlsx Office edit' })).toBeInTheDocument();
    await waitFor(() => expect(officeMocks.importFile).toHaveBeenCalledTimes(2));
    expect(officeMocks.importFile).toHaveBeenLastCalledWith(
      '207:enterprise:enterprise-material',
      '企业清单.xlsx',
      enterpriseBlob,
    );

    const tabs = screen.getByRole('navigation', { name: '已打开文件' });
    expect(within(tabs).getByTitle('合同条款.doc')).toBeInTheDocument();
    expect(within(tabs).getByTitle('企业清单.xlsx')).toBeInTheDocument();

    await user.click(within(tabs).getByTitle('合同条款.doc'));
    expect(screen.getByRole('region', { name: '合同条款.doc Office edit' })).toBeInTheDocument();
    expect(screen.getByText('Office version: 1')).toBeInTheDocument();
  }, 10_000);
});
