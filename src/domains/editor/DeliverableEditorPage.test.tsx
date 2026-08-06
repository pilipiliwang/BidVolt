import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectSummaries } from '../projects/project-view-model';
import { DeliverableEditorPage } from './DeliverableEditorPage';

const project = projectSummaries[0];
const draftScopeId = 'enterprise-test::BV-2026-018::user-test';

const projectMaterials = [
  { id: 'project-file', name: '招标文件.pdf', status: '已识别' },
];
const enterpriseMaterials = [
  { id: 'enterprise-file', name: '企业资质证书.pdf', status: '有效' },
];

describe('DeliverableEditorPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('edits and saves a version-scoped Mock Word document', async () => {
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
      />,
    );

    expect(screen.getByText('演示编辑器 · 不会回写真实 Office 文件')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: '下载原始 Mock Word' })).toHaveAttribute(
      'href',
      '/mock-files/技术标文件-Mock.docx',
    );

    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.textContent = '修改后的技术方案正文';
    fireEvent.input(editor);
    expect(screen.getByRole('status')).toHaveTextContent('有未保存的演示修改');

    fireEvent.click(screen.getByRole('button', { name: '保存演示修改' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        kind: 'word',
        projectId: 'BV-2026-018',
        deliverableId: 'technical',
        versionId: 'technical-v6',
        content: '修改后的技术方案正文',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('演示修改已保存');
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

  it('edits a user quote cell and recalculates its row and total', async () => {
    const onSave = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="quote"
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onSave={onSave}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    const quoteInput = screen.getByRole('spinbutton', { name: '高压断路器用户报价' });
    fireEvent.change(quoteInput, { target: { value: '15000' } });

    const firstRow = screen.getByText('高压断路器').closest('tr');
    expect(firstRow).not.toBeNull();
    expect(within(firstRow!).getByText('45,000.00')).toBeInTheDocument();
    expect(screen.getByText('337,080.00')).toBeInTheDocument();
    expect(screen.getByText('363,620.00')).toBeInTheDocument();
    expect(screen.getAllByText('待服务端测算')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '下载原始 Mock Excel（下载报价单 Mock Excel）' })).toHaveAttribute(
      'href',
      '/mock-files/报价单-Mock.xlsx',
    );

    fireEvent.click(screen.getByRole('button', { name: '保存演示修改' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'spreadsheet',
          projectId: 'BV-2026-018',
          deliverableId: 'quote',
          versionId: 'quote-v4',
          total: 337080,
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
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    const historyCell = screen.getByLabelText('高压断路器历史中标价（元）');
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
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: '高压断路器用户报价' }), {
      target: { value: '15100' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存演示修改' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('可在刷新后恢复'));
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
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: '高压断路器用户报价' })).toHaveValue(15100);
    expect(screen.getByLabelText('高压断路器历史中标价（元）')).toHaveTextContent(
      '14,850.00',
    );
    expect(screen.getByLabelText('高压断路器算法建议单价（元）')).toHaveTextContent(
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
        draftScopeId={draftScopeId}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        project={project}
        projectId="BV-2026-018"
        versionId="quote-v4"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: '高压断路器用户报价' })).toHaveValue(14600);
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
