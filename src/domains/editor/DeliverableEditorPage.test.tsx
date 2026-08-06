import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { projectSummaries } from '../projects/project-view-model';
import { DeliverableEditorPage } from './DeliverableEditorPage';

const project = projectSummaries[0];

const projectMaterials = [
  { id: 'project-file', name: '招标文件.pdf', status: '已识别' },
];
const enterpriseMaterials = [
  { id: 'enterprise-file', name: '企业资质证书.pdf', status: '有效' },
];

describe('DeliverableEditorPage', () => {
  it('edits and saves a version-scoped Mock Word document', async () => {
    const onSave = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="technical"
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
    expect(deliverableTabs[0]).toHaveAccessibleName('招标文件成果');
    expect(deliverableTabs[0]).toHaveAttribute('href', '/projects/BV-2026-018/overview');
    expect(deliverableTabs[1]).toHaveAccessibleName('技术标');
    expect(screen.getByRole('link', { name: '技术标' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '商务标' })).toHaveAttribute(
      'href',
      '/projects/BV-2026-018/deliverables/business/versions/business-v8',
    );
    expect(screen.getByRole('link', { name: '下载技术标 Mock Word' })).toHaveAttribute(
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

  it('edits a user quote cell and recalculates its row and total', async () => {
    const onSave = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="quote"
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
    expect(screen.getByRole('link', { name: '下载报价单 Mock Excel' })).toHaveAttribute(
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
  });

  it('switches the left rail between project and enterprise data and forwards uploads', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(
      <DeliverableEditorPage
        deliverableId="business"
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
  });

  it('does not fall back to another project when the requested project is missing', () => {
    render(
      <DeliverableEditorPage
        deliverableId="technical"
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
