import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  OutcomeFileWorkspace,
  safePreviewUrl,
  type OutcomeWorkspaceFile,
} from './OutcomeFileWorkspace';

const wordFile: OutcomeWorkspaceFile = {
  categoryId: 'technical',
  categoryLabel: '技术文件',
  id: 'technical-plan',
  kind: 'word',
  name: '技术实施方案.docx',
  readOnly: false,
  version: 'v3',
  wordDocument: {
    pages: [
      {
        blocks: [
          { id: 'heading-1', level: 1, text: '技术实施方案', type: 'heading' },
          { id: 'paragraph-1', text: '本项目采用分阶段实施方案。', type: 'paragraph' },
        ],
        id: 'page-1',
      },
      {
        blocks: [{ id: 'heading-2', level: 2, text: '进度安排', type: 'heading' }],
        id: 'page-2',
      },
    ],
  },
};

const spreadsheetFile: OutcomeWorkspaceFile = {
  categoryId: 'quote',
  categoryLabel: '价格文件',
  id: 'quote-sheet',
  kind: 'spreadsheet',
  name: '报价明细.xlsx',
  readOnly: false,
  version: 'v2',
  workbook: {
    sheets: [
      { id: 'summary', name: '报价汇总', rows: [['项目', '金额'], ['设备', 1200]] },
      { id: 'detail', name: '设备明细', rows: [['名称', '数量'], ['变压器', 2]] },
      { id: 'tax', name: '税费测算', rows: [] },
    ],
  },
};

describe('OutcomeFileWorkspace', () => {
  it('places compact file actions in the tab toolbar without a second title or close button', async () => {
    const user = userEvent.setup();
    const { container: toolbar } = render(<div />);
    const onDownload = vi.fn();
    const onSendContextToAgent = vi.fn();
    const { container } = render(
      <OutcomeFileWorkspace
        file={wordFile}
        onClose={vi.fn()}
        onDownload={onDownload}
        onSave={vi.fn()}
        onSendContextToAgent={onSendContextToAgent}
        toolbarContainer={toolbar}
      />,
    );

    expect(screen.queryByRole('navigation', { name: '文件位置' })).not.toBeInTheDocument();
    expect(screen.queryByText('技术实施方案.docx')).not.toBeInTheDocument();
    expect(screen.queryByText('版本 v3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭文件预览' })).not.toBeInTheDocument();
    expect(container.querySelector('.outcome-file-workspace--embedded')).toBeInTheDocument();
    expect(within(toolbar).getByRole('status', { name: '文件保存状态' })).toHaveTextContent('未修改');
    expect(within(toolbar).getByRole('button', { name: '保存文件' })).toHaveAttribute('title', '保存文件');
    await user.click(within(toolbar).getByRole('button', { name: '下载文件' }));
    await user.click(within(toolbar).getByRole('button', { name: '引用当前定位' }));
    expect(onDownload).toHaveBeenCalledWith(wordFile);
    expect(onSendContextToAgent).toHaveBeenCalledWith(expect.objectContaining({ fileId: wordFile.id }));
  });

  it('does not flash a standalone header while the tab toolbar host is mounting', () => {
    render(<OutcomeFileWorkspace file={wordFile} onClose={vi.fn()} toolbarContainer={null} />);
    expect(screen.queryByRole('navigation', { name: '文件位置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭文件预览' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('reports unsaved edits and pending saves, then clears the tab dirty state on successful save', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    render(<OutcomeFileWorkspace file={wordFile} onClose={vi.fn()} onDirtyChange={onDirtyChange} onSave={onSave} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const paragraph = screen.getByLabelText('正文：本项目采用分阶段实施方案。');
    paragraph.textContent = '待保存正文';
    fireEvent.input(paragraph);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: '保存文件' }));
    expect(screen.getByRole('status', { name: '文件保存状态' })).toHaveTextContent('正在保存');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => { resolveSave(); });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps failed saves dirty and does not report the previous file status to a switched tab', async () => {
    const user = userEvent.setup();
    const oldDirty = vi.fn();
    const nextDirty = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));
    const { rerender } = render(<OutcomeFileWorkspace file={wordFile} onClose={vi.fn()} onDirtyChange={oldDirty} onSave={onSave} />);
    const paragraph = screen.getByLabelText('正文：本项目采用分阶段实施方案。');
    paragraph.textContent = '保存失败的正文';
    fireEvent.input(paragraph);
    await user.click(screen.getByRole('button', { name: '保存文件' }));
    expect(screen.getByRole('status', { name: '文件保存状态' })).toHaveTextContent('保存失败');
    expect(oldDirty).toHaveBeenLastCalledWith(true);

    rerender(<OutcomeFileWorkspace file={spreadsheetFile} onClose={vi.fn()} onDirtyChange={nextDirty} onSave={onSave} />);
    expect(nextDirty.mock.calls).toEqual([[false]]);
    rerender(<OutcomeFileWorkspace file={spreadsheetFile} onClose={vi.fn()} onDirtyChange={(dirty) => nextDirty(dirty)} onSave={onSave} />);
    expect(nextDirty.mock.calls).toEqual([[false]]);
  });

  it('reports browser draft edits and clears them after local saving through the tab toolbar', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    const { container: toolbar } = render(<div />);
    const browserFile = { ...wordFile, id: 'browser-tab-dirty-test', readOnly: true };
    render(<OutcomeFileWorkspace file={browserFile} onClose={vi.fn()} onDirtyChange={onDirtyChange} toolbarContainer={toolbar} />);
    expect(within(toolbar).getByRole('status', { name: '文件编辑能力' })).toHaveTextContent('只读预览');
    await user.click(within(toolbar).getByRole('button', { name: '创建浏览器草稿' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const paragraph = screen.getByLabelText('正文：本项目采用分阶段实施方案。');
    paragraph.textContent = '本地副本修改';
    fireEvent.input(paragraph);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(within(toolbar).getByRole('button', { name: '保存浏览器草稿' }));
    expect(within(toolbar).getByRole('status', { name: '文件保存状态' })).toHaveTextContent('已保存');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    window.localStorage.removeItem('bidvolt:outcome-browser-draft:technical:browser-tab-dirty-test:v3:current');
  });

  it('renders file identity, version, save state and closes the embedded workspace', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OutcomeFileWorkspace file={wordFile} onClose={onClose} onSave={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: '文件位置' })).toHaveTextContent('技术文件');
    expect(screen.getByRole('navigation', { name: '文件位置' })).toHaveTextContent('技术实施方案.docx');
    expect(screen.getByText('版本 v3')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '文件保存状态' })).toHaveTextContent('未修改');

    await user.click(screen.getByRole('button', { name: '关闭文件预览' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('builds Word outline and pages from backend content and saves an edit', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<OutcomeFileWorkspace file={wordFile} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole('complementary', { name: '文档导航' })).toHaveTextContent('技术实施方案');
    expect(screen.getByRole('complementary', { name: '文档导航' })).toHaveTextContent('进度安排');
    expect(screen.getAllByRole('article')).toHaveLength(2);

    const paragraph = screen.getByLabelText('正文：本项目采用分阶段实施方案。');
    paragraph.textContent = '本项目采用并行实施方案。';
    fireEvent.input(paragraph);
    expect(screen.getByRole('status', { name: '文件保存状态' })).toHaveTextContent('有未保存修改');

    await user.click(screen.getByRole('button', { name: '保存文件' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'technical-plan' }),
      expect.objectContaining({ kind: 'word' }),
    );
    expect(screen.getByRole('status', { name: '文件保存状态' })).toHaveTextContent('已保存');
  });

  it('returns Word selection context to the Agent without replacing the file', async () => {
    const user = userEvent.setup();
    const onContextChange = vi.fn();
    const onSendContextToAgent = vi.fn();
    render(
      <OutcomeFileWorkspace
        file={wordFile}
        onClose={vi.fn()}
        onContextChange={onContextChange}
        onSave={vi.fn()}
        onSendContextToAgent={onSendContextToAgent}
      />,
    );
    const paragraph = screen.getByLabelText('正文：本项目采用分阶段实施方案。');
    const text = paragraph.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.mouseUp(paragraph.closest('article') as HTMLElement);

    expect(screen.getByRole('button', { name: '引用到对话框' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '引用到对话框' }));
    expect(onContextChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fileId: 'technical-plan',
      pageId: 'page-1',
      selectedText: '本项目',
    }));
    expect(onSendContextToAgent).toHaveBeenLastCalledWith(expect.objectContaining({
      selectedText: '本项目',
    }));
    expect(screen.queryByRole('button', { name: '引用到对话框' })).not.toBeInTheDocument();
  });

  it('uses the real workbook sheet list, switches sheets and reports a cell address', async () => {
    const user = userEvent.setup();
    const onContextChange = vi.fn();
    const onSendContextToAgent = vi.fn();
    render(
      <OutcomeFileWorkspace
        file={spreadsheetFile}
        onClose={vi.fn()}
        onContextChange={onContextChange}
        onSave={vi.fn()}
        onSendContextToAgent={onSendContextToAgent}
      />,
    );

    const tabs = screen.getByRole('tablist', { name: '工作表' });
    expect(within(tabs).getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: '费用汇总' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '设备明细' }));
    expect(screen.getByRole('grid', { name: '设备明细工作表' })).toBeInTheDocument();
    await user.click(screen.getByRole('gridcell', { name: '设备明细 A2' }));
    expect(screen.getByLabelText('名称框')).toHaveValue('A2');
    expect(screen.getByLabelText('公式栏')).toHaveValue('变压器');
    expect(onContextChange).toHaveBeenLastCalledWith(expect.objectContaining({
      location: '设备明细!A2',
      range: 'A2',
      sheetId: 'detail',
    }));
    await user.click(screen.getByRole('button', { name: '引用单元格' }));
    expect(onSendContextToAgent).toHaveBeenLastCalledWith(expect.objectContaining({
      location: '设备明细!A2',
      selectedText: '变压器',
    }));

    await user.click(screen.getByRole('button', { name: '上一个工作表' }));
    expect(screen.getByRole('grid', { name: '报价汇总工作表' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一个工作表' })).toBeDisabled();
  });

  it('shows explicit empty states instead of inventing backend document data', () => {
    const { rerender } = render(
      <OutcomeFileWorkspace
        file={{ ...wordFile, id: 'empty-word', wordDocument: undefined }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('文档内容待返回')).toBeInTheDocument();

    rerender(
      <OutcomeFileWorkspace
        file={{ ...spreadsheetFile, id: 'empty-book', workbook: { sheets: [] } }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('工作表待返回')).toBeInTheDocument();
  });

  it('exposes unavailable formatting controls as disabled instead of pretending edits persist', () => {
    render(
      <OutcomeFileWorkspace
        file={{ ...wordFile, readOnly: true }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '加粗' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '斜体' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下划线' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '保存文件' })).not.toBeInTheDocument();
  });

  it('opens a rendered local Word preview when structured pages are not available', () => {
    render(
      <OutcomeFileWorkspace
        file={{
          ...wordFile,
          id: 'local-word',
          previewUrl: '/__local-package/207/file-1/preview',
          readOnly: true,
          wordDocument: { pages: [] },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTitle('技术实施方案.docx Word 预览')).toHaveAttribute(
      'src',
      'http://localhost:3000/__local-package/207/file-1/preview',
    );
    expect(screen.getByRole('status', { name: '文件编辑能力' })).toHaveTextContent('只读预览');
    expect(screen.queryByRole('status', { name: '文件保存状态' })).not.toBeInTheDocument();
  });

  it('sandboxes HTML preview and rejects unsafe preview protocols', () => {
    render(
      <OutcomeFileWorkspace
        file={{
          categoryId: 'business',
          categoryLabel: '商务文件',
          htmlSource: '<h1>投标公告</h1>',
          id: 'notice',
          kind: 'html',
          name: '招标公告.html',
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTitle('招标公告.html HTML 内容')).toHaveAttribute('sandbox');
    expect(safePreviewUrl('javascript:alert(1)')).toBeUndefined();
    expect(safePreviewUrl('/files/result.pdf')).toMatch(/^http:\/\/localhost/);
  });

  it('explains an HTML app shell instead of showing a blank canvas while retaining its download', () => {
    const reason = '该 HTML 仅保存了动态网页入口，正文需要原网站的脚本和接口加载。';
    render(
      <OutcomeFileWorkspace
        file={{
          categoryId: 'tender',
          categoryLabel: '招标材料',
          downloadUrl: 'blob:http://localhost:3000/portal',
          id: 'portal',
          kind: 'html',
          name: 'portal.html',
          previewUnavailableReason: reason,
          previewUrl: 'blob:http://localhost:3000/portal',
          readOnly: true,
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('HTML 文件未包含可预览正文')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.queryByTitle('portal.html HTML 预览')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载文件' })).toHaveAttribute('href', 'blob:http://localhost:3000/portal');
  });
});
