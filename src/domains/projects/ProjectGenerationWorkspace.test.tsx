import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentRunViewModel } from '../../shared/task-events';
import type { ReviewFinding } from '../review/types';
import {
  mergeLocalPackageResultFiles,
  ProjectGenerationWorkspace,
  type ProjectGenerationWorkspaceProps,
} from './ProjectGenerationWorkspace';
import type { ProjectDeliverableView } from './ProjectOverviewPage';

const deliverables: ProjectDeliverableView[] = [
  {
    id: 'business',
    lift: '2 分',
    pages: 12,
    score: '88 分',
    title: '商务文件.docx',
    tone: 'business',
    versionId: 'business-v2',
    words: '2.4 万',
  },
  {
    id: 'technical',
    lift: '3 分',
    pages: 18,
    score: '82 分',
    title: '技术文件.docx',
    tone: 'technical',
    versionId: 'technical-v3',
    words: '4.1 万',
  },
  {
    id: 'quote',
    lift: '1 分',
    pages: 3,
    score: '91 分',
    title: '报价明细.xlsx',
    tone: 'quote',
    versionId: 'quote-v4',
    words: '0.2 万',
  },
];

describe('mergeLocalPackageResultFiles', () => {
  it('keeps the local response package while preserving authoritative backend internal records', () => {
    expect(mergeLocalPackageResultFiles(
      [{ category: 'business', id: 'local-business', name: '商务文件.docx' }],
      [
        { category: 'business', id: 'backend-business', name: '后端商务文件.docx' },
        { category: 'internal', id: 'internal', name: '编制逻辑与评分响应记录.docx' },
      ],
    )).toEqual([
      { category: 'business', id: 'local-business', name: '商务文件.docx' },
      { category: 'internal', id: 'internal', name: '编制逻辑与评分响应记录.docx' },
    ]);
  });
});

const activeRun: AgentRunViewModel = {
  actionList: ['继续核对评分响应'],
  completion: 'active',
  conversation: [
    { content: '已建立任务目录并完成材料索引。', kind: 'service', seq: 1 },
    { content: '正在编制技术响应章节。', kind: 'tool', seq: 2 },
    { content: '我发现截止时间存在冲突，需要你确认。', kind: 'assistant', seq: 3 },
    { content: '请优先以公告时间为准。', kind: 'user', seq: 4 },
  ],
  errorMessage: null,
  message: '正在编制技术响应章节。',
  outcome: null,
  percent: 58,
  phase: '标书制作/审核',
  projectId: '207',
  questions: [
    {
      answer: null,
      answered: false,
      askId: 'ask-deadline',
      createdAt: null,
      items: [{
        checked: '公告和正文记录不一致。',
        need: '请确认采用哪个时间。',
        question: '投标截止时间以公告还是正文为准？',
      }],
      legacy: false,
      timeoutNotified: false,
      windowMinutes: null,
    },
  ],
  reason: null,
  sessionId: 'session-207',
  status: 'running',
  streamState: 'connected',
  taskId: 'task-207',
};

const completeRun: AgentRunViewModel = {
  ...activeRun,
  actionList: [],
  completion: 'complete',
  message: '全部成果文件已生成。',
  outcome: 'complete',
  percent: 100,
  questions: [],
  status: 'succeeded',
};

const activeTask = {
  message: '系统正在推进成果编制。',
  percent: 58,
  status: 'running' as const,
  title: '标书制作/审核',
};

const completeTask = {
  message: '成果文件和评审结果已经返回。',
  percent: 100,
  status: 'succeeded' as const,
  title: '成果生成',
};

const outcomeReview = {
  canOpenTaskProgress: false,
  description: '后端评审尚未完成。',
  state: 'waiting-results' as const,
  title: '等待评审结果',
};

const completedReview = {
  canOpenTaskProgress: false,
  description: '评审与评分已经完成。',
  score: {
    business: 88,
    estimatedLift: 7,
    pricing: 91,
    technical: 82,
    total: 86,
  },
  state: 'ready' as const,
  title: '评审已完成',
};

const finding: ReviewFinding = {
  currentScore: 8,
  evidence: {
    exactQuote: '采用分阶段实施。',
    locator: '技术文件第 1 页',
    sourceLabel: '技术响应文件',
    verification: 'verified',
  },
  fullScore: 10,
  id: 'finding-1',
  improvableScore: 2,
  outcome: 'risk',
  ruleVersion: 'v1',
  suggestion: '补充项目人员资质证明。',
  title: '项目管理与组织机构',
};

function renderWorkspace(overrides: Partial<ProjectGenerationWorkspaceProps> = {}) {
  return render(
    <ProjectGenerationWorkspace
      agentRun={activeRun}
      deliverables={deliverables}
      enterpriseCategories={[
        { id: 'license', label: '证照', parentId: null },
        { id: 'performance', label: '业绩', parentId: null },
      ]}
      enterpriseMaterials={[
        { categoryId: 'license', id: 'enterprise-license', name: '营业执照.pdf', status: '已同步' },
      ]}
      materials={[
        { id: 'tender-file', kind: 'tender_document', name: '招标文件.docx', status: '已识别' },
        { id: 'notice-file', kind: 'tender_notice', name: '招标公告.html', status: '已识别' },
      ]}
      outcomeReview={outcomeReview}
      task={activeTask}
      {...overrides}
    />,
  );
}

it('supports package-only downloads and preserves the pending promise through the rail', async () => {
  let finish!: () => void;
  const onDownloadAllResults = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  renderWorkspace({ agentRun: completeRun, task: completeTask, onDownloadAllResults });
  const button = screen.getByRole('button', { name: '下载全部标书成果' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(onDownloadAllResults).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent('正在打包下载…');
  await act(async () => finish());
  expect(button).toBeEnabled();
});

async function renderQuotedWord(initialDraft = '') {
  const user = userEvent.setup();
  const selectedText = '仅修改这一段原文。';
  const onAssistantSend = vi.fn().mockResolvedValue({ queued: false, reply: '收到本次要求。' });
  renderWorkspace({
    onAssistantSend,
    onLoadDeliverableContent: vi.fn().mockResolvedValue({
      model: { wordDocument: { pages: [{
        id: 'page-1',
        blocks: [{ id: 'quoted-paragraph', text: selectedText, type: 'paragraph' }],
      }] } },
      version_no: 3,
    }),
  });
  const textbox = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
  if (initialDraft) fireEvent.change(textbox, { target: { value: initialDraft } });
  const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
  await user.click(within(rail).getByRole('button', { name: /技术文件.*已生成/ }));
  await user.click(within(rail).getByRole('button', { name: /技术文件\.docx/ }));
  const paragraph = await screen.findByLabelText(`正文：${selectedText}`);
  expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  fireEvent.mouseUp(paragraph.closest('article') as HTMLElement);
  await user.click(screen.getByRole('button', { name: '引用到对话框' }));
  return { onAssistantSend, selectedText, textbox: textbox as HTMLTextAreaElement, user };
}

describe('ProjectGenerationWorkspace', () => {
  it.each(['html', 'htm'])('previews .%s resources as sandboxed HTML and releases their URLs after closing', async (extension) => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:http://localhost:3000/notice-one')
      .mockReturnValueOnce('blob:http://localhost:3000/notice-two')
      .mockReturnValueOnce('blob:http://localhost:3000/notice-two-reloaded');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    const user = userEvent.setup();
    const onLoadResourcePreview = vi.fn().mockResolvedValue({
      blob: new Blob(['<!doctype html><h1>采购公告</h1><table><tr><td>采购内容</td></tr></table>'], {
        type: 'application/octet-stream',
      }),
      kind: 'html',
      mimeType: 'text/html',
    });
    const { unmount } = renderWorkspace({
      materials: [
        { id: 'notice-one', fileId: 'html-one', kind: 'tender_notice', name: `采购公告.${extension}`, status: '已识别' },
        { id: 'notice-two', fileId: 'html-two', kind: 'tender_notice', name: `补充公告.${extension}`, status: '已识别' },
      ],
      onLoadResourcePreview,
    });
    try {
      const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
      await user.click(within(rail).getByRole('button', { name: /招标材料/ }));
      await user.click(within(rail).getByTitle(`采购公告.${extension}`));
      const frame = await screen.findByTitle(`采购公告.${extension} HTML 预览`);
      expect(onLoadResourcePreview).toHaveBeenCalledWith('html-one', `采购公告.${extension}`);
      expect(frame).toHaveAttribute('src', 'blob:http://localhost:3000/notice-one');
      expect(frame).toHaveAttribute('sandbox', '');
      expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(createObjectURL.mock.calls[0][0]).toHaveProperty('type', 'text/html');
      expect(screen.queryByRole('button', { name: '目录' })).not.toBeInTheDocument();
      expect(screen.queryByText('文档目录')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /创建编辑副本/ })).not.toBeInTheDocument();

      onLoadResourcePreview.mockResolvedValueOnce({
        blob: new Blob(['<app-root></app-root><script src="main.js"></script>']),
        kind: 'html',
        mimeType: 'text/html',
        unavailableReason: '该 HTML 仅保存了动态网页入口，正文需要原网站的脚本和接口加载。',
      });
      await user.click(within(rail).getByTitle(`补充公告.${extension}`));
      await screen.findByText('HTML 文件未包含可预览正文');
      expect(screen.queryByTitle(`补充公告.${extension} HTML 预览`)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '下载文件' })).toHaveAttribute('href', 'blob:http://localhost:3000/notice-two');
      expect(revokeObjectURL).not.toHaveBeenCalled();

      await user.click(within(rail).getByTitle(`补充公告.${extension}`));
      expect(await screen.findByTitle(`补充公告.${extension} HTML 预览`))
        .toHaveAttribute('src', 'blob:http://localhost:3000/notice-two-reloaded');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/notice-two');
      expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:http://localhost:3000/notice-one');
      expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:http://localhost:3000/notice-two-reloaded');
      const tabs = screen.getByRole('navigation', { name: '已打开文件' });
      await user.click(within(tabs).getByRole('button', { name: `关闭 采购公告.${extension}` }));
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/notice-one');
      expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:http://localhost:3000/notice-two-reloaded');
      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/notice-two-reloaded');
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('does not announce an enterprise update when the upload receipt is only accepted for parsing', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn().mockResolvedValue({
      assetIds: ['new-enterprise-asset'],
      status: 'processing' as const,
    });
    const onAssistantSend = vi.fn().mockResolvedValue({ queued: true });
    renderWorkspace({ onAddEnterpriseFiles, onAssistantSend });

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /^企业资料 \d+项$/ }));
    await user.upload(
      within(rail).getByLabelText('选择企业资料'),
      new File(['enterprise'], '新增资质.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() => expect(onAddEnterpriseFiles).toHaveBeenCalledOnce());
    expect(onAssistantSend).not.toHaveBeenCalled();
  });

  it('shows exactly the three resource groups and preserves running logs, dialogue, and Agent interactions', async () => {
    const user = userEvent.setup();
    const onAnswerInteraction = vi.fn().mockResolvedValue({ queued: true });
    const onAddEnterpriseFiles = vi.fn();
    renderWorkspace({ onAddEnterpriseFiles, onAnswerInteraction });

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    expect(rail.querySelectorAll('.bv-resource-rail__group-toggle')).toHaveLength(3);
    expect(within(rail).getByRole('button', { name: /^企业资料 \d+项$/ })).toHaveAttribute('aria-expanded', 'false');
    expect(within(rail).getByRole('button', { name: /招标材料/ })).toHaveAttribute('aria-expanded', 'false');
    expect(within(rail).getByRole('button', { name: /标书成果（生成中）/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(rail).queryByRole('button', { name: '上传企业资料' })).not.toBeInTheDocument();

    await user.click(within(rail).getByRole('button', { name: /^企业资料 \d+项$/ }));
    expect(within(rail).getByRole('button', { name: '上传企业资料' })).toBeInTheDocument();
    await user.click(within(rail).getByRole('button', { name: /证照/ }));
    expect(within(rail).getByRole('button', { name: '营业执照.pdf' })).toBeInTheDocument();

    await user.click(within(rail).getByRole('button', { name: /招标材料/ }));
    expect(within(rail).getByRole('button', { name: /招标文件\.docx/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /招标公告\.html/ })).toBeInTheDocument();

    const activity = screen.getByRole('region', { name: '任务动态' });
    expect(within(activity).queryByText('正在编制技术响应章节。')).not.toBeInTheDocument();
    await user.click(within(activity).getByRole('button', { name: '展开全部' }));
    expect(within(activity).getByText('正在编制技术响应章节。')).toBeInTheDocument();
    expect(within(activity).getByText('已建立任务目录并完成材料索引。')).toBeInTheDocument();
    expect(within(activity).getByText('我发现截止时间存在冲突，需要你确认。')).toBeInTheDocument();
    expect(within(activity).getByText('请优先以公告时间为准。')).toBeInTheDocument();
    expect(within(activity).getByText('需要你处理')).toBeInTheDocument();
    expect(within(activity).getByText('投标截止时间以公告还是正文为准？')).toBeInTheDocument();

    await user.type(
      within(activity).getByRole('textbox', { name: '回复：投标截止时间以公告还是正文为准？' }),
      '以招标公告时间为准',
    );
    await user.click(within(activity).getByRole('button', { name: '确认回复并继续' }));
    await waitFor(() => expect(onAnswerInteraction).toHaveBeenCalledWith(
      'ask-deadline',
      ['以招标公告时间为准'],
    ));
    expect(within(activity).getByText('回复已提交，等待 BidVolt 处理。')).toBeInTheDocument();
  });

  it('shows the completed dashboard and does not invent an internal-management file absent from backend data', async () => {
    const user = userEvent.setup();
    renderWorkspace({
      agentRun: completeRun,
      findings: [finding],
      outcomeReview: completedReview,
      task: completeTask,
    });

    expect(screen.getAllByRole('heading', { level: 1, name: '成果生成已完成' })).toHaveLength(1);
    const scores = screen.getByRole('group', { name: '标书成果评分' });
    expect(within(scores).getByText('综合评分').parentElement).toHaveTextContent('86 分 / 100');
    expect(within(scores).getByText('商务标').parentElement).toHaveTextContent('88 分');
    expect(within(scores).getByText('技术标').parentElement).toHaveTextContent('82 分');
    expect(within(scores).getByText('价格文件').parentElement).toHaveTextContent('91 分');
    expect(within(scores).getByText('可提升空间').parentElement).toHaveTextContent('+7 分');
    const completionSummary = screen.getByRole('region', { name: '成果评分与响应记录' });
    expect(completionSummary).toContainElement(screen.getByRole('heading', { name: '成果生成已完成' }));
    expect(completionSummary).toContainElement(scores);
    expect(within(completionSummary).getByRole('region', { name: '编制逻辑与评分响应记录' }))
      .toBeInTheDocument();
    expect(screen.getByRole('status', { name: '评分响应记录空状态' }))
      .toHaveTextContent('内部管理文件尚未生成');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    expect(within(rail).getByRole('button', { name: /标书成果.*3项/ })).toBeInTheDocument();
    expect(within(rail).queryByText('标书成果（已生成）')).not.toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /商务文件.*已生成/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /技术文件.*已生成/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /价格文件.*已生成/ })).toBeInTheDocument();
    const internalFolder = within(rail).getByRole('button', { name: /内部管理文件.*待生成/ });
    expect(internalFolder).toBeInTheDocument();
    await user.click(internalFolder);
    expect(within(rail).getByText('该文件夹暂无成果')).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: /内部管理.*\.(docx|xlsx|pdf)/i }))
      .not.toBeInTheDocument();
  });

  it('opens the backend internal record from the completed dashboard', async () => {
    const user = userEvent.setup();
    const onDownloadDeliverable = vi.fn().mockResolvedValue(undefined);
    const internalDeliverable: ProjectDeliverableView & { fileId: string } = {
      fileId: 'internal-record-file-42',
      id: 'internal',
      lift: '—',
      pages: 4,
      score: '待评审',
      title: '编制逻辑与评分响应记录.docx',
      tone: 'internal',
      versionId: '2',
      words: '3200',
    };
    const onLoadDeliverableContent = vi.fn().mockResolvedValue({
      model: {
        wordDocument: {
          pages: [{
            blocks: [{ id: 'record-body', text: '评分响应记录正文', type: 'paragraph' }],
            id: 'page-1',
          }],
        },
      },
      version_no: 2,
    });
    renderWorkspace({
      agentRun: completeRun,
      deliverables: [...deliverables, internalDeliverable],
      onDownloadDeliverable,
      onLoadDeliverableContent,
      outcomeReview: completedReview,
      task: completeTask,
    });

    const recordRow = screen.getByRole('region', { name: '编制逻辑与评分响应记录' });
    await user.click(within(recordRow).getByRole('button', { name: '下载 编制逻辑与评分响应记录.docx' }));
    expect(onDownloadDeliverable).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: 'internal',
      title: '编制逻辑与评分响应记录.docx',
      versionId: '2',
    }));
    await user.click(within(recordRow).getByRole('button', { name: /编制逻辑与评分响应记录\.docx.*查看/ }));

    expect(await screen.findByText('评分响应记录正文')).toBeInTheDocument();
    expect(onLoadDeliverableContent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'internal',
      title: '编制逻辑与评分响应记录.docx',
      versionId: '2',
    }));
    expect(screen.getByRole('navigation', { name: '已打开文件' }))
      .toHaveTextContent('编制逻辑与评分响应记录.docx');
  });

  it('loads a real Word model into the three-column view and sends file and page context', async () => {
    const user = userEvent.setup();
    const onAssistantSend = vi.fn().mockResolvedValue({ queued: true });
    const onLoadDeliverableContent = vi.fn().mockResolvedValue({
      model: {
        wordDocument: {
          pages: [
            {
              blocks: [
                { id: 'heading-1', level: 1, text: '实施方案', type: 'heading' },
                { id: 'paragraph-1', text: '采用分阶段实施。', type: 'paragraph' },
              ],
              id: 'page-1',
              label: '第 1 页',
            },
          ],
        },
      },
      version_no: 3,
    });
    const { container } = renderWorkspace({ onAssistantSend, onLoadDeliverableContent });

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /技术文件.*已生成/ }));
    await user.click(within(rail).getByRole('button', { name: /技术文件\.docx/ }));

    await screen.findByRole('region', { name: '技术文件.docx文件工作区' });
    expect(onLoadDeliverableContent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'technical', title: '技术文件.docx' }),
    );
    expect(container.querySelector('.project-result-workspace')).toHaveClass(
      'project-result-workspace--preview',
    );
    expect(container.querySelector('.project-result-workspace__document')).not.toBeNull();
    const contextPanel = screen.getByRole('region', { name: 'BidVolt 任务上下文' });
    expect(within(contextPanel).getByRole('region', { name: '任务动态' })).toHaveTextContent(
      '我发现截止时间存在冲突，需要你确认。',
    );

    const documentNavigation = screen.getByLabelText('文档导航');
    await user.click(within(documentNavigation).getByRole('button', { name: '实施方案' }));
    expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();

    const paragraph = screen.getByLabelText('正文：采用分阶段实施。');
    const paragraphText = paragraph.firstChild as Text;
    const range = document.createRange();
    range.setStart(paragraphText, 2);
    range.setEnd(paragraphText, 5);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.mouseUp(paragraph.closest('article') as HTMLElement);
    await user.click(screen.getByRole('button', { name: '引用到对话框' }));
    const references = screen.getByLabelText('当前引用上下文');
    expect(references).toHaveTextContent('选中：“分阶段”');

    await user.type(screen.getByRole('textbox', { name: '向 BidVolt 发送消息' }), '请加强风险响应');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledOnce());
    expect(onAssistantSend.mock.calls[0]?.[0]).toContain('请加强风险响应');
    expect(onAssistantSend.mock.calls[0]?.[0]).toContain(
      '引用成果：技术文件.docx · 第 1 页 · 实施方案',
    );
    expect(onAssistantSend.mock.calls[0]?.[0]).toContain('选中内容：分阶段');
    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '任务动态' })).getByText('等待回复')).toBeInTheDocument();
  });

  it('sends the edited quote exactly and does not reuse its context in the next message', async () => {
    const { onAssistantSend, selectedText, textbox, user } = await renderQuotedWord();
    const edited = `${textbox.value.replace(selectedText, '这是我修改后的引用内容。')}请仅优化此段。`;
    fireEvent.change(textbox, { target: { value: edited } });
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledOnce());
    expect(onAssistantSend).toHaveBeenLastCalledWith(edited.trim(), 'queue');
    expect(onAssistantSend.mock.calls[0]?.[0]).not.toContain(selectedText);
    expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();

    await user.type(textbox, '下一条普通消息');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledTimes(2));
    expect(onAssistantSend).toHaveBeenLastCalledWith('下一条普通消息', 'queue');
  });

  it('does not restore quote text that was removed directly from the draft', async () => {
    const { onAssistantSend, textbox, user } = await renderQuotedWord();
    fireEvent.change(textbox, { target: { value: '取消引用，只询问项目进度。' } });
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledOnce());
    expect(onAssistantSend).toHaveBeenLastCalledWith('取消引用，只询问项目进度。', 'queue');
    expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();
  });

  it('removes only the unchanged inserted quote when its chip is removed', async () => {
    const originalDraft = '保留我原有的要求。  \n';
    const { onAssistantSend, selectedText, textbox, user } = await renderQuotedWord(originalDraft);
    expect(textbox.value.startsWith(originalDraft)).toBe(true);
    await user.click(screen.getByRole('button', { name: /^移除引用：/ }));
    expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();
    expect(textbox.value).not.toContain('引用成果：');
    expect(textbox.value).not.toContain(selectedText);
    expect(textbox.value.startsWith(originalDraft)).toBe(true);
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledOnce());
    expect(onAssistantSend).toHaveBeenLastCalledWith(originalDraft.trim(), 'queue');
  });

  it('preserves user-edited reference text when its chip is removed', async () => {
    const { onAssistantSend, selectedText, textbox, user } = await renderQuotedWord();
    const edited = textbox.value.replace(selectedText, `${selectedText}这是我补充的正文。`);
    fireEvent.change(textbox, { target: { value: edited } });
    await user.click(screen.getByRole('button', { name: /^移除引用：/ }));
    expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();
    expect(textbox).toHaveValue(edited);
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledOnce());
    expect(onAssistantSend).toHaveBeenLastCalledWith(edited.trim(), 'queue');
  });

  it('keeps a stalled submission in the timeline and lets unsent queued messages be deleted or steered', async () => {
    const user = userEvent.setup();
    let reply!: (value: { reply: string }) => void;
    const onAssistantSend = vi.fn()
      .mockImplementationOnce(() => new Promise<{ reply: string }>((resolve) => { reply = resolve; }))
      .mockResolvedValue({ reply: '已按新方向核对报价。' });
    renderWorkspace({
      onAssistantSend,
      queueAcknowledgementTimeoutMs: 20,
      sendingAgentMessage: true,
    });

    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    await user.type(textarea, '先检查商务资格');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(onAssistantSend).toHaveBeenCalledWith('先检查商务资格', 'queue');
    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();
    const activity = screen.getByRole('region', { name: '任务动态' });
    expect(within(activity).getByText('先检查商务资格')).toBeInTheDocument();
    await within(activity).findByText('处理时间较长，仍在等待 BidVolt 回复。');
    expect(within(activity).getByText('等待回复')).toBeInTheDocument();
    expect(within(activity).queryByText('结果待确认')).not.toBeInTheDocument();
    expect(within(activity).queryByText('发送失败')).not.toBeInTheDocument();

    await user.type(textarea, '再核对报价');
    expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    expect(onAssistantSend).toHaveBeenCalledTimes(1);
    const queued = screen.getByRole('region', { name: '排队消息' });
    expect(within(queued).getByRole('button', { name: '调整方向：再核对报价' })).toBeEnabled();
    await user.click(within(queued).getByRole('button', { name: '删除排队消息：再核对报价' }));
    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();
    expect(onAssistantSend).toHaveBeenCalledTimes(1);

    await user.type(textarea, '优先核对报价');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await user.click(screen.getByRole('button', { name: '调整方向：优先核对报价' }));
    expect(onAssistantSend).toHaveBeenNthCalledWith(2, '优先核对报价', 'steer');
    expect(await within(activity).findByText('已按新方向核对报价。')).toBeInTheDocument();
    await act(async () => reply({ reply: '商务资格已核对。' }));
    expect(await within(activity).findByText('商务资格已核对。')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();
    expect(onAssistantSend).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('正在加入队列…')).not.toBeInTheDocument();
  });

  it('shows a reply for a completed task even when the backend omits queued and SSE is closed', async () => {
    const user = userEvent.setup();
    const onAssistantSend = vi.fn().mockResolvedValue({ reply: '当前无需等待主任务，可以继续修改。' });
    renderWorkspace({ agentRun: completeRun, task: completeTask, onAssistantSend });
    await user.type(screen.getByRole('textbox', { name: '向 BidVolt 发送消息' }), '现在能修改吗{enter}');
    expect(await screen.findByText('当前无需等待主任务，可以继续修改。')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();
    expect(screen.getByText('现在能修改吗').closest('article')).toHaveAttribute('data-kind', 'user');
    expect(screen.getByText('当前无需等待主任务，可以继续修改。').closest('article')).toHaveAttribute('data-kind', 'agent');
  });

  it('preserves unsent messages and late replies when the same task receives its session id', async () => {
    const user = userEvent.setup();
    let reply!: (value: { reply: string }) => void;
    const onAssistantSend = vi.fn()
      .mockImplementationOnce(() => new Promise<{ reply: string }>((resolve) => { reply = resolve; }))
      .mockResolvedValue({ reply: '第二条已处理。' });
    const { rerender } = renderWorkspace({ agentRun: { ...completeRun, sessionId: null }, onAssistantSend });
    const textarea = screen.getByRole('textbox', { name: '向 BidVolt 发送消息' });
    await user.type(textarea, '先核对资质{enter}');
    await user.type(textarea, '再补充业绩{enter}');
    rerender(<ProjectGenerationWorkspace agentRun={completeRun} deliverables={deliverables}
      enterpriseMaterials={[]} materials={[]} outcomeReview={completedReview} task={completeTask}
      onAssistantSend={onAssistantSend} />);
    expect(screen.getByRole('region', { name: '排队消息' })).toHaveTextContent('再补充业绩');
    await act(async () => reply({ reply: '资质已核对。' }));
    expect(await screen.findByText('资质已核对。')).toBeInTheDocument();
    expect(await screen.findByText('第二条已处理。')).toBeInTheDocument();
    expect(onAssistantSend.mock.calls).toEqual([['先核对资质', 'queue'], ['再补充业绩', 'queue']]);
  });

  it('uploads Agent attachments, shows them in the composer, and includes them in the next message', async () => {
    const user = userEvent.setup();
    const onAssistantAddFiles = vi.fn().mockResolvedValue(undefined);
    const onAssistantSend = vi.fn().mockResolvedValue({ queued: true });
    renderWorkspace({ onAssistantAddFiles, onAssistantSend });

    const file = new File(['attachment-content'], '商务偏差表.docx', {
      lastModified: 1_725_000_000_000,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText('选择发送给 BidVolt 的文件'), file);

    await waitFor(() => expect(onAssistantAddFiles).toHaveBeenCalledWith([file]));
    const attachments = await screen.findByLabelText('已添加附件');
    expect(attachments).toHaveTextContent('商务偏差表.docx');
    expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledWith(
      '项目补充资料（已上传，请按文件名读取）：「商务偏差表.docx」',
      'queue',
    ));
    expect(screen.queryByLabelText('已添加附件')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '排队消息' })).not.toBeInTheDocument();
    const activity = screen.getByRole('region', { name: '任务动态' });
    expect(within(activity).getByText('引用已上传资料：商务偏差表.docx').closest('article'))
      .toHaveAttribute('data-kind', 'user');
  });

  it('does not show a failed upload as an attached project file', async () => {
    const user = userEvent.setup();
    const onAssistantAddFiles = vi.fn().mockRejectedValue(new Error('补充资料上传失败'));
    renderWorkspace({ onAssistantAddFiles, onAssistantSend: vi.fn() });

    await user.upload(
      screen.getByLabelText('选择发送给 BidVolt 的文件'),
      new File(['broken'], '失败附件.docx'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('补充资料上传失败');
    expect(screen.queryByLabelText('已添加附件')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled();
  });

  it('restores uploaded project files when chat acknowledgement definitively fails', async () => {
    const user = userEvent.setup();
    const onAssistantAddFiles = vi.fn().mockResolvedValue(undefined);
    const onAssistantSend = vi.fn().mockRejectedValue(new Error('会话接口拒绝了消息'));
    renderWorkspace({ onAssistantAddFiles, onAssistantSend });

    await user.upload(
      screen.getByLabelText('选择发送给 BidVolt 的文件'),
      new File(['content'], '待重试附件.docx'),
    );
    await screen.findByLabelText('已添加附件');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    const restored = await screen.findByLabelText('已添加附件');
    expect(restored).toHaveTextContent('待重试附件.docx');
    expect(restored).toHaveTextContent('已上传至项目补充资料');
    expect(screen.getByRole('region', { name: '任务动态' })).toHaveTextContent('会话接口拒绝了消息');
    expect(screen.queryByRole('button', { name: '正在发送消息' })).not.toBeInTheDocument();
  });

  it('loads every backend Excel sheet and sends the selected sheet and cell context without losing Agent history', async () => {
    const user = userEvent.setup();
    const onAssistantSend = vi.fn().mockResolvedValue({ queued: true });
    const onLoadDeliverableContent = vi.fn().mockResolvedValue({
      model: {
        workbook: {
          sheets: [
            {
              id: 'summary',
              name: '报价汇总',
              rows: [['项目', '金额'], ['总价', 1200]],
            },
            {
              id: 'detail',
              name: '设备明细',
              rows: [['设备', '数量'], ['海缆', 2]],
            },
          ],
        },
      },
      version_no: 4,
    });
    const { container } = renderWorkspace({
      deliverables: [deliverables[2]],
      onAssistantSend,
      onLoadDeliverableContent,
    });

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /价格文件.*已生成/ }));
    await user.click(within(rail).getByRole('button', { name: /报价明细\.xlsx/ }));

    const sheetTabs = await screen.findByRole('tablist', { name: '工作表' });
    expect(onLoadDeliverableContent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quote', title: '报价明细.xlsx' }),
    );
    expect(within(sheetTabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '报价汇总',
      '设备明细',
    ]);
    expect(container.querySelector('.project-result-workspace')).toHaveClass(
      'project-result-workspace--preview',
    );
    const contextPanel = screen.getByRole('region', { name: 'BidVolt 任务上下文' });
    expect(within(contextPanel).getByRole('region', { name: '任务动态' })).toHaveTextContent(
      '请优先以公告时间为准。',
    );

    await user.click(within(sheetTabs).getByRole('tab', { name: '设备明细' }));
    await user.click(screen.getByRole('gridcell', { name: '设备明细 B2' }));
    expect(screen.queryByLabelText('当前引用上下文')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '引用单元格' }));
    const references = screen.getByLabelText('当前引用上下文');
    expect(references).toHaveTextContent('报价明细.xlsx · 设备明细!B2');

    await user.type(screen.getByRole('textbox', { name: '向 BidVolt 发送消息' }), '复核该设备数量');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onAssistantSend).toHaveBeenCalledOnce());
    expect(onAssistantSend.mock.calls[0]?.[0]).toContain('复核该设备数量');
    expect(onAssistantSend.mock.calls[0]?.[0]).toContain(
      '引用成果：报价明细.xlsx · 设备明细 · B2 · 设备明细!B2',
    );
    expect(onAssistantSend.mock.calls[0]?.[0]).toContain('选中内容：2');
  });

  it('loads the exact backend version selected for the whole result package', async () => {
    const user = userEvent.setup();
    const onLoadDeliverableContent = vi.fn().mockResolvedValue({
      model: {
        wordDocument: {
          pages: [{
            blocks: [{ id: 'old-version', text: '历史版本正文', type: 'paragraph' }],
            id: 'page-1',
          }],
        },
      },
      version_no: 2,
    });
    renderWorkspace({
      deliverables: [deliverables[0]],
      onLoadDeliverableContent,
      versionOptions: [
        { deliverableId: 'business', isCurrent: true, title: '商务文件.docx', versionId: '3' },
        { deliverableId: 'business', title: '商务文件.docx', versionId: '2' },
      ],
    });

    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.selectOptions(
      within(rail).getByRole('combobox', { name: '标书成果整包版本' }),
      '2',
    );
    await user.click(within(rail).getByRole('button', { name: /商务文件.*已生成/ }));
    await user.click(within(rail).getByRole('button', { name: /商务文件\.docx.*V2/ }));

    await screen.findByText('历史版本正文');
    expect(onLoadDeliverableContent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'business',
      versionId: '2',
    }));
    expect(within(screen.getByRole('navigation', { name: '已打开文件' })).getByText('V2')).toBeInTheDocument();
  });

  it('keeps several files open as tabs until the user closes each one', async () => {
    const user = userEvent.setup();
    const onLoadDeliverableContent = vi.fn().mockImplementation((deliverable) => ({
      model: {
        wordDocument: {
          pages: [{
            blocks: [{ id: `${deliverable.id}-body`, text: `${deliverable.title}正文`, type: 'paragraph' }],
            id: 'page-1',
          }],
        },
      },
      version_no: 1,
    }));
    const { container } = renderWorkspace({ onLoadDeliverableContent });
    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });

    await user.click(within(rail).getByRole('button', { name: /商务文件.*已生成/ }));
    await user.click(within(rail).getByRole('button', { name: /商务文件\.docx/ }));
    await screen.findByText('商务文件.docx正文');

    await user.click(within(rail).getByRole('button', { name: /技术文件.*已生成/ }));
    await user.click(within(rail).getByRole('button', { name: /技术文件\.docx/ }));
    await screen.findByText('技术文件.docx正文');

    const tabs = screen.getByRole('navigation', { name: '已打开文件' });
    expect(within(tabs).getByTitle('商务文件.docx')).toBeInTheDocument();
    expect(within(tabs).getByTitle('技术文件.docx')).toBeInTheDocument();

    await user.click(within(tabs).getByRole('button', { name: '关闭 技术文件.docx' }));
    expect(await screen.findByText('商务文件.docx正文')).toBeInTheDocument();
    expect(container.querySelector('.project-result-workspace')).toHaveClass('project-result-workspace--preview');

    await user.click(within(tabs).getByRole('button', { name: '关闭 商务文件.docx' }));
    expect(container.querySelector('.project-result-workspace')).not.toHaveClass('project-result-workspace--preview');
  });

  it('closes the whole preview pane independently from the per-file tab buttons', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /招标材料/ }));
    await user.click(within(rail).getByRole('button', { name: /招标文件\.docx/ }));
    await user.click(within(rail).getByRole('button', { name: /招标公告\.html/ }));
    const tabs = screen.getByRole('navigation', { name: '已打开文件' });
    expect(within(tabs).getAllByRole('button', { name: /^关闭 / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '关闭文件预览' })).not.toBeInTheDocument();
    expect(container.querySelector('.outcome-file-workspace__identity')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '收起资料目录' }));
    await user.click(screen.getByRole('button', { name: '收起 BidVolt 上下文' }));
    await user.click(screen.getByRole('button', { name: '关闭预览编辑区域' }));
    expect(screen.queryByRole('navigation', { name: '已打开文件' })).not.toBeInTheDocument();
    expect(container.querySelector('.project-result-workspace')).not.toHaveClass('project-result-workspace--preview');
    expect(container.querySelector('.project-result-workspace')).not.toHaveClass('project-result-workspace--rail-collapsed');
    expect(container.querySelector('.project-result-workspace')).not.toHaveClass('project-result-workspace--context-collapsed');
    expect(screen.getByRole('textbox', { name: '向 BidVolt 发送消息' })).toBeInTheDocument();
  });

  it('guards both close buttons for a dirty browser draft and preserves it when cancelled', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWorkspace({ onLoadDeliverableContent: () => ({
      model: { wordDocument: { pages: [{ id: 'p1', blocks: [{
        id: 'dirty-body', text: '测试关闭确认正文', type: 'paragraph',
      }] }] } },
    }) });
    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /商务文件.*已生成/ }));
    await user.click(within(rail).getByRole('button', { name: /商务文件\.docx/ }));
    await user.click(await screen.findByRole('button', { name: '创建浏览器草稿' }));
    const paragraph = screen.getByLabelText('正文：测试关闭确认正文');
    paragraph.textContent = '尚未保存的草稿修改';
    fireEvent.input(paragraph);
    await user.click(screen.getByRole('button', { name: '关闭 商务文件.docx' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('尚未保存的草稿修改')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭预览编辑区域' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.lastCall?.[0]).toContain('商务文件.docx');
    expect(screen.getByText('尚未保存的草稿修改')).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '关闭预览编辑区域' }));
    expect(screen.queryByRole('navigation', { name: '已打开文件' })).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('does not reopen the preview when a closed resource finishes loading', async () => {
    const user = userEvent.setup();
    type TextPreview = { kind: 'text'; blocks: Array<{ id: string; text: string }> };
    let finish!: (value: TextPreview) => void;
    const onLoadResourcePreview = vi.fn(() => new Promise<TextPreview>((resolve) => { finish = resolve; }));
    renderWorkspace({
      materials: [{ id: 'pending', fileId: 'pending-file', kind: 'tender_document', name: '加载中.docx', status: '已识别' }],
      onLoadResourcePreview,
    });
    const rail = screen.getByRole('complementary', { name: '项目资源与标书成果' });
    await user.click(within(rail).getByRole('button', { name: /招标材料/ }));
    await user.click(within(rail).getByRole('button', { name: /加载中.docx/ }));
    expect(screen.getByText('正在读取文件内容…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭预览编辑区域' }));
    await act(async () => { finish({ kind: 'text', blocks: [{ id: 'late', text: '迟到的文件正文' }] }); });
    expect(screen.queryByRole('navigation', { name: '已打开文件' })).not.toBeInTheDocument();
    expect(screen.queryByText('迟到的文件正文')).not.toBeInTheDocument();
  });
});
