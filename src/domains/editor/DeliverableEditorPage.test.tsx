import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectSummary } from '../projects/project-view-model';
import {
  DeliverableEditorPage,
  backendQuoteRows,
  toBackendEditorContent,
} from './DeliverableEditorPage';
import type { QuoteSheetRow } from './types';

const project: ProjectSummary = {
  buyer: '测试采购单位',
  code: 'TEST-001',
  deadline: '2026-12-31',
  id: 'BV-2026-018',
  materialCount: 1,
  progress: 50,
  riskCount: 0,
  stage: '方案编制',
  title: '编辑器测试项目',
  updatedAt: '2026-08-14T00:00:00Z',
};
const draftScopeId = 'enterprise-test::BV-2026-018::user-test';

const projectMaterials = [
  { id: 'project-file', name: '招标文件.pdf', status: '已识别' },
];
const enterpriseMaterials = [
  { id: 'enterprise-file', name: '企业资质证书.pdf', status: '有效' },
];
const quoteRows: QuoteSheetRow[] = [{
  id: 'row-1',
  code: 'A-001',
  name: '测试设备',
  specification: 'TEST',
  quantity: 3,
  unit: '台',
  tenderPrice: 16000,
  historyPrice: 14850,
  suggestedPrice: 14680,
  userPrice: 14600,
}];

describe('DeliverableEditorPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('edits and saves a version-scoped Word document without runtime fixture content', async () => {
    const onSave = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="technical"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onSave={onSave}
        project={project}
        projectId="BV-2026-018"
        versionId="technical-v6"
        versionIds={{ business: 'business-v8', quote: 'quote-v4' }}
      />,
    );

    expect(screen.getByText('在线编辑器 · 保存到当前成果版本')).toBeInTheDocument();
    const deliverableTabs = within(
      screen.getByRole('navigation', { name: '成果文件' }),
    ).getAllByRole('link');
    expect(deliverableTabs[0]).toHaveAccessibleName('标书成果总览');
    expect(deliverableTabs[0]).toHaveAttribute('href', '/projects/BV-2026-018/overview');
    expect(deliverableTabs[1]).toHaveAccessibleName('技术标');
    expect(screen.getByRole('link', { name: '技术标' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '商务标' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/deliverables/business/versions/business-v8',
    );
    expect(screen.getByRole('button', { name: '暂无可下载的原始文件' })).toBeDisabled();

    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.textContent = '修改后的技术方案正文';
    fireEvent.input(editor);
    expect(screen.getByRole('status')).toHaveTextContent('有未保存的修改');

    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        kind: 'word',
        projectId: 'BV-2026-018',
        deliverableId: 'technical',
        versionId: 'technical-v6',
        content: '修改后的技术方案正文',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('修改已保存');
  });

  it('renders a historical version as read-only while preserving its download action', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    const onSave = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="technical"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        isBackendConnected
        isReadOnly
        materials={projectMaterials}
        onDownload={onDownload}
        onSave={onSave}
        project={project}
        projectId="BV-2026-018"
        readOnlyReason="当前打开的是历史版本 V5，仅支持预览和下载。"
        versionId="5"
      />,
    );

    expect(screen.getByText('只读预览 · 不会创建成果版本')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('历史版本 V5');
    expect(screen.getByRole('textbox', { name: '技术标文档内容' })).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '下载技术标文件' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('coalesces repeated save clicks while the same request is pending', async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    render(
      <DeliverableEditorPage
        deliverableId="technical"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onSave={onSave}
        project={project}
        projectId="BV-2026-018"
        versionId="6"
      />,
    );

    const save = screen.getByRole('button', { name: '保存修改' });
    await user.click(save);
    await user.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('正在保存修改');
    resolveSave?.();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('修改已保存'));
  });

  it('shows Word and Excel download failures without an unhandled rejection', async () => {
    const user = userEvent.setup();
    const failingDownload = vi.fn(() => Promise.reject(new Error('指定版本下载失败')));
    const { unmount } = render(
      <DeliverableEditorPage
        deliverableId="technical"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onDownload={failingDownload}
        project={project}
        projectId="BV-2026-018"
        versionId="6"
      />,
    );

    await user.click(screen.getByRole('button', { name: '下载技术标文件' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('指定版本下载失败');
    unmount();

    render(
      <DeliverableEditorPage
        deliverableId="quote"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        initialQuoteRows={quoteRows}
        materials={projectMaterials}
        onDownload={failingDownload}
        project={project}
        projectId="BV-2026-018"
        versionId="4"
      />,
    );
    await user.click(screen.getByRole('button', { name: '下载报价单文件' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('指定版本下载失败');
  });

  it('round-trips the quote rows model while retaining legacy sheets compatibility', () => {
    const model = toBackendEditorContent({
      kind: 'spreadsheet',
      projectId: project.id,
      deliverableId: 'quote',
      versionId: '4',
      rows: quoteRows.map(({ historyPrice: _historyPrice, suggestedPrice: _suggestedPrice, ...row }) => row),
      total: 43800,
    });
    expect(model).toHaveProperty('rows');
    expect(model).toHaveProperty('sheets');
    expect(backendQuoteRows(model)).toEqual([
      expect.objectContaining({
        code: 'A-001',
        name: '测试设备',
        specification: 'TEST',
        quantity: 3,
        tenderPrice: 16000,
        userPrice: 14600,
      }),
    ]);
    expect(backendQuoteRows({ sheets: [{ rows: [['名称', '数量', '单价'], ['旧设备', 2, 99]] }] }))
      .toEqual([expect.objectContaining({ name: '旧设备', quantity: 2, userPrice: 99 })]);
  });

  it('fills and focuses the project assistant with the selected Word text', async () => {
    render(
      <DeliverableEditorPage
        deliverableId="technical"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="technical-v6"
      />,
    );

    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>设备供货范围与实施计划</p>';
    fireEvent.input(editor);
    editor.focus();
    const text = editor.querySelector('p')?.firstChild;
    expect(text).toBeInstanceOf(Text);
    const range = document.createRange();
    range.setStart(text as Text, 0);
    range.setEnd(text as Text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));

    const action = screen.getByRole('button', { name: 'AI针对性修改' });
    fireEvent.mouseDown(action);
    fireEvent.click(action);

    const assistantInput = screen.getByRole('textbox', { name: '向项目助手提问' });
    await waitFor(() => expect(assistantInput).toHaveFocus());
    expect(assistantInput).toHaveValue(
      '请针对以下选中内容进行修改：\n设备供货范围\n\n修改要求：',
    );
    expect(editor).toHaveTextContent('设备供货范围与实施计划');
  });

  it('activates preview selection first and fills the assistant when the user finishes selecting', async () => {
    render(
      <DeliverableEditorPage
        deliverableId="business"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="business-v8"
      />,
    );

    const editor = screen.getByRole('textbox', { name: '商务标文档内容' });
    editor.innerHTML = '<p>商务条款响应与交付承诺</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    expect(screen.getByRole('button', { name: '取消AI选取' })).toHaveAttribute('aria-pressed', 'true');

    const text = editor.querySelector('p')?.firstChild;
    expect(text).toBeInstanceOf(Text);
    const range = document.createRange();
    range.setStart(text as Text, 0);
    range.setEnd(text as Text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(editor);

    const assistantInput = screen.getByRole('textbox', { name: '向项目助手提问' });
    await waitFor(() => expect(assistantInput).toHaveFocus());
    expect(assistantInput).toHaveValue(
      '请针对以下选中内容进行修改：\n商务条款响应\n\n修改要求：',
    );
    expect(editor).toHaveTextContent('商务条款响应与交付承诺');
  });

  it('edits a user quote cell and recalculates its row and total', async () => {
    const onSave = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="quote"
        initialQuoteRows={quoteRows}
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onSave={onSave}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    const quoteInput = screen.getByRole('spinbutton', { name: '测试设备用户报价' });
    fireEvent.change(quoteInput, { target: { value: '15000' } });

    const firstRow = screen.getByText('测试设备').closest('tr');
    expect(firstRow).not.toBeNull();
    expect(within(firstRow!).getByText('45,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('45,000.00')).toHaveLength(2);
    expect(screen.getByText('48,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('待服务端测算')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '暂无可下载的原始文件' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'spreadsheet',
          projectId: 'BV-2026-018',
          deliverableId: 'quote',
          versionId: 'quote-v4',
          total: 45000,
        }),
      ),
    );
    const savedRows = onSave.mock.calls[0][0].rows;
    expect(savedRows[0]).not.toHaveProperty('historyPrice');
    expect(savedRows[0]).not.toHaveProperty('suggestedPrice');
  });

  it('fills the project assistant with structured context from a selected quote cell', async () => {
    const user = userEvent.setup();
    render(
      <DeliverableEditorPage
        deliverableId="quote"
        initialQuoteRows={quoteRows}
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    const historyCell = screen.getByLabelText('测试设备历史中标价（元）');
    await user.click(historyCell);
    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));

    const assistantInput = screen.getByRole('textbox', { name: '向项目助手提问' });
    expect(assistantInput).toHaveFocus();
    expect((assistantInput as HTMLTextAreaElement).value).toContain('位置：G2');
    expect((assistantInput as HTMLTextAreaElement).value).toContain('只读外部数据');
    expect(historyCell.querySelector('input')).toBeNull();
  });

  it('restores a saved quote draft after the editor is reopened', async () => {
    const { unmount } = render(
      <DeliverableEditorPage
        deliverableId="quote"
        initialQuoteRows={quoteRows}
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: '测试设备用户报价' }), {
      target: { value: '15100' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('修改已保存'));
    const storageKey = window.localStorage.key(0);
    expect(storageKey).not.toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(storageKey!) ?? '{}');
    expect(stored.rows[0]).not.toHaveProperty('historyPrice');
    expect(stored.rows[0]).not.toHaveProperty('suggestedPrice');
    stored.rows[0].historyPrice = 1;
    stored.rows[0].suggestedPrice = 2;
    window.localStorage.setItem(storageKey!, JSON.stringify(stored));
    unmount();

    render(
      <DeliverableEditorPage
        deliverableId="quote"
        initialQuoteRows={quoteRows}
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: '测试设备用户报价' })).toHaveValue(15100);
    expect(screen.getByLabelText('测试设备历史中标价（元）')).toHaveTextContent(
      '14,850.00',
    );
    expect(screen.getByLabelText('测试设备算法建议单价（元）')).toHaveTextContent(
      '14,680.00',
    );
  });

  it('rejects a malformed or out-of-range local quote draft', () => {
    const storageKey = [
      'bidvolt:office-draft:v1',
      encodeURIComponent(draftScopeId),
      'quote',
      'quote-v4',
    ].join(':');
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        schemaVersion: 1,
        rows: [{
          id: 'row-1',
          code: 'TAMPERED',
          name: '异常行',
          specification: '异常',
          quantity: 1,
          unit: '项',
          tenderPrice: 100,
          userPrice: -1,
        }],
      }),
    );

    render(
      <DeliverableEditorPage
        deliverableId="quote"
        initialQuoteRows={quoteRows}
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: '测试设备用户报价' })).toHaveValue(14600);
    expect(screen.queryByDisplayValue('TAMPERED')).not.toBeInTheDocument();
  });

  it('switches the left rail between project and enterprise data and forwards uploads', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="business"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddFiles={onAddFiles}
        project={project}
        projectId="BV-2026-018"
        versionId="business-v8"
      />,
    );

    expect(screen.getByLabelText('招标文件.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '企业资料' }));
    expect(screen.getByLabelText('企业资质证书.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('招标文件.pdf')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '当前招标材料' }));
    const file = new File(['补充材料'], '补充材料.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('补充上传当前项目资料'), file);
    expect(onAddFiles).toHaveBeenCalledWith([file]);
    expect(screen.getByRole('link', { name: '前往评审中心确认建议' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/review',
    );
  });

  it('does not fall back to another project when the requested project is missing', () => {
    render(
      <DeliverableEditorPage
        deliverableId="technical"
        draftScopeId="enterprise-test::missing-project::user-test"
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        projectId="missing-project"
        versionId="technical-v6"
      />,
    );

    expect(screen.getByRole('heading', { name: '无法打开这个项目成果' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '技术标文档内容' })).not.toBeInTheDocument();
    expect(screen.queryByText('海上平台电气设备采购项目')).not.toBeInTheDocument();
  });
});
