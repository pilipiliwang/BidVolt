import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WordMockEditor } from './WordMockEditor';

afterEach(() => {
  window.localStorage.clear();
  window.getSelection()?.removeAllRanges();
});

function renderEditor(overrides: Partial<React.ComponentProps<typeof WordMockEditor>> = {}) {
  const props: React.ComponentProps<typeof WordMockEditor> = {
    deliverableId: 'technical',
    downloadHref: '/technical.docx',
    downloadLabel: '下载技术标',
    onDirty: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  return { ...render(<WordMockEditor {...props} />), props };
}

function selectText(text: Text, start: number, end: number) {
  text.parentElement?.closest<HTMLElement>('[contenteditable="true"]')?.focus();
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

describe('WordMockEditor', () => {
  it('uses its own history for undo/redo and supports Ctrl+Z, Ctrl+Y and Ctrl+S', () => {
    const onDirty = vi.fn();
    const onSave = vi.fn();
    renderEditor({ onDirty, onSave });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });

    editor.innerHTML = '<p>第一稿方案</p>';
    fireEvent.input(editor);
    editor.innerHTML = '<p>第二稿方案</p>';
    fireEvent.input(editor);

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
    expect(editor).toHaveTextContent('第一稿方案');
    fireEvent.keyDown(editor, { key: 'y', ctrlKey: true });
    expect(editor).toHaveTextContent('第二稿方案');
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });

    expect(onDirty).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith('第二稿方案');
    expect(screen.getByRole('link', { name: '下载原始 Mock Word' })).toHaveAttribute(
      'title',
      '下载技术标',
    );
  });

  it('applies inline, paragraph and alignment formatting to the preserved selection', () => {
    renderEditor();
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>重点实施方案</p>';
    fireEvent.input(editor);
    const text = editor.querySelector('p')?.firstChild;
    expect(text).toBeInstanceOf(Text);
    selectText(text as Text, 0, 2);

    const bold = screen.getByRole('button', { name: '加粗' });
    fireEvent.mouseDown(bold);
    fireEvent.click(bold);
    expect(editor.querySelector('strong')).toHaveTextContent('重点');

    const fontSize = screen.getByRole('combobox', { name: '字号' });
    fireEvent.mouseDown(fontSize);
    fireEvent.change(fontSize, { target: { value: '19px' } });
    expect(editor.querySelector('span')).toHaveStyle({ fontSize: '19px' });

    const paragraphStyle = screen.getByRole('combobox', { name: '段落样式' });
    fireEvent.mouseDown(paragraphStyle);
    fireEvent.change(paragraphStyle, { target: { value: 'h1' } });
    expect(editor.querySelector('h1')).toHaveTextContent('重点实施方案');

    const center = screen.getByRole('button', { name: '居中对齐' });
    fireEvent.mouseDown(center);
    fireEvent.click(center);
    expect(editor.querySelector('h1')).toHaveStyle({ textAlign: 'center' });

    const numberedList = screen.getByRole('button', { name: '编号' });
    fireEvent.mouseDown(numberedList);
    fireEvent.click(numberedList);
    expect(editor.querySelector('ol > li')).toHaveTextContent('重点实施方案');
  });

  it('finds, replaces one match and replaces all remaining matches', async () => {
    const user = userEvent.setup();
    renderEditor();
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>项目范围，项目计划，项目验收。</p>';
    fireEvent.input(editor);

    await user.click(screen.getByRole('button', { name: '查找替换' }));
    const findInput = screen.getByRole('textbox', { name: '查找' });
    await user.type(findInput, '项目');
    fireEvent.keyDown(findInput, { key: 'z', ctrlKey: true });
    expect(editor).toHaveTextContent('项目范围，项目计划，项目验收。');
    await user.type(screen.getByRole('textbox', { name: '替换为' }), '工程');
    await user.click(screen.getByRole('button', { name: '下一个' }));
    expect(window.getSelection()?.toString()).toBe('项目');

    await user.click(screen.getByRole('button', { name: '替换' }));
    expect(editor).toHaveTextContent('工程范围，项目计划，项目验收。');
    await user.click(screen.getByRole('button', { name: '全部替换' }));
    expect(editor).toHaveTextContent('工程范围，工程计划，工程验收。');
    expect(screen.getByText('已完成 2 处替换。')).toBeInTheDocument();
  });

  it('adds, resolves and deletes an anchored comment', async () => {
    const user = userEvent.setup();
    renderEditor({ deliverableId: 'business' });
    const editor = screen.getByRole('textbox', { name: '商务标文档内容' });
    editor.innerHTML = '<p>商务响应条款</p>';
    fireEvent.input(editor);
    const text = editor.querySelector('p')?.firstChild as Text;
    selectText(text, 0, 4);

    await user.click(screen.getByRole('button', { name: '添加批注' }));
    await user.type(screen.getByRole('textbox', { name: '批注内容' }), '请补充条款来源');
    await user.click(screen.getByRole('button', { name: '保存批注' }));

    const anchor = editor.querySelector('[data-word-comment]');
    expect(anchor).toHaveTextContent('商务响应');
    expect(screen.getByText('请补充条款来源')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '解决' }));
    expect(anchor).toHaveAttribute('data-resolved', 'true');
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(editor.querySelector('[data-word-comment]')).not.toBeInTheDocument();
    expect(editor).toHaveTextContent('商务响应条款');
  });

  it('sends the preserved plain-text selection to the AI assistant without changing the document', async () => {
    const user = userEvent.setup();
    const onSendSelectionToAssistant = vi.fn();
    renderEditor({ onSendSelectionToAssistant });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p><strong>需要针对修改</strong>的正文</p>';
    fireEvent.input(editor);
    const text = editor.querySelector('strong')?.firstChild as Text;
    selectText(text, 0, text.data.length);
    const before = editor.innerHTML;

    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));

    expect(onSendSelectionToAssistant).toHaveBeenCalledOnce();
    expect(onSendSelectionToAssistant).toHaveBeenCalledWith('需要针对修改');
    expect(editor.innerHTML).toBe(before);

    editor.blur();
    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    expect(onSendSelectionToAssistant).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '取消AI选取' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('enters AI selection mode and automatically sends a preview selection', async () => {
    const user = userEvent.setup();
    const onSendSelectionToAssistant = vi.fn();
    renderEditor({ onSendSelectionToAssistant });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>请优化这一段技术方案</p>';
    fireEvent.input(editor);

    const action = screen.getByRole('button', { name: 'AI针对性修改' });
    await user.click(action);

    expect(onSendSelectionToAssistant).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '取消AI选取' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/AI 选取已开启：在文档中拖动选择文字/)).toBeInTheDocument();

    const text = editor.querySelector('p')?.firstChild as Text;
    selectText(text, 3, 8);
    fireEvent.mouseUp(editor);

    expect(onSendSelectionToAssistant).toHaveBeenCalledOnce();
    expect(onSendSelectionToAssistant).toHaveBeenCalledWith('这一段技术');
    expect(screen.getByRole('button', { name: 'AI针对性修改' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/AI 选取已开启：在文档中拖动选择文字/)).not.toBeInTheDocument();
  });

  it('cancels AI selection mode with Escape without sending content', async () => {
    const user = userEvent.setup();
    const onSendSelectionToAssistant = vi.fn();
    renderEditor({ onSendSelectionToAssistant });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });

    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(onSendSelectionToAssistant).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'AI针对性修改' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('已取消 AI 针对性选取。')).toBeInTheDocument();
  });

  it('truncates a 4001-character AI selection to 4000 characters with an explicit notice', async () => {
    const user = userEvent.setup();
    const onSendSelectionToAssistant = vi.fn();
    renderEditor({ onSendSelectionToAssistant });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    const longSelection = '甲'.repeat(4001);
    editor.innerHTML = `<p>${longSelection}</p>`;
    fireEvent.input(editor);
    const text = editor.querySelector('p')?.firstChild as Text;
    selectText(text, 0, text.data.length);

    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));

    expect(onSendSelectionToAssistant).toHaveBeenCalledWith('甲'.repeat(4000));
    expect(screen.getByText('选区较长，已截取前4000字填入项目助手输入框。')).toBeInTheDocument();
  });

  it('builds a live outline, edits and locates headings, and previews the first page', async () => {
    const user = userEvent.setup();
    const onDirty = vi.fn();
    renderEditor({ onDirty });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<h1>总方案</h1><h2>实施安排</h2><h3>验收计划</h3><p>正文</p>';
    fireEvent.input(editor);

    await user.click(screen.getByRole('button', { name: '目录/页面预览' }));
    expect(screen.getByRole('region', { name: '文档目录' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '页面预览（演示画布）' })).toBeInTheDocument();
    expect(screen.getByText('原生分页需文档服务')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '编辑目录标题 1' })).toHaveValue('总方案');
    expect(screen.getByRole('textbox', { name: '编辑目录标题 2' })).toHaveValue('实施安排');
    expect(screen.getByRole('textbox', { name: '编辑目录标题 3' })).toHaveValue('验收计划');

    fireEvent.change(screen.getByRole('textbox', { name: '编辑目录标题 1' }), {
      target: { value: '总体技术方案' },
    });
    expect(editor.querySelector('h1')).toHaveTextContent('总体技术方案');
    expect(onDirty).toHaveBeenCalled();

    const heading = editor.querySelector('h1') as HTMLHeadingElement;
    heading.scrollIntoView = vi.fn();
    await user.click(screen.getByRole('button', { name: '定位 总体技术方案' }));
    expect(heading.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);

    editor.scrollIntoView = vi.fn();
    await user.click(screen.getByRole('button', { name: /第 1 页/ }));
    expect(editor.scrollIntoView).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(editor.querySelector('h1')).toHaveTextContent('总方案');
    expect(screen.getByRole('textbox', { name: '编辑目录标题 1' })).toHaveValue('总方案');
  });

  it('restores saved rich text and exposes zoom and word-count controls', () => {
    const onSave = vi.fn();
    const first = renderEditor({ onSave, storageKey: 'word-draft:test' });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<h2><strong>保存后的富文本</strong></h2>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: '保存演示修改' }));
    expect(onSave).toHaveBeenCalledWith('保存后的富文本');
    first.unmount();

    renderEditor({ storageKey: 'word-draft:test' });
    const restored = screen.getByRole('textbox', { name: '技术标文档内容' });
    expect(restored.querySelector('h2 strong')).toHaveTextContent('保存后的富文本');
    expect(screen.getByLabelText(/字数/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: '缩放比例' }), {
      target: { value: '125' },
    });
    expect(restored.closest('.word-editor-v2')).toHaveStyle('--word-editor-zoom: 1.25');
  });

  it('automatically stores an isolated rich-text draft after editing', () => {
    vi.useFakeTimers();
    try {
      const first = renderEditor({ storageKey: 'project-a:technical:version-6' });
      const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
      editor.innerHTML = '<p><u>自动保存的版本草稿</u></p>';
      fireEvent.input(editor);
      act(() => vi.advanceTimersByTime(400));
      first.unmount();

      renderEditor({ storageKey: 'project-a:technical:version-6' });
      expect(
        screen.getByRole('textbox', { name: '技术标文档内容' }).querySelector('u'),
      ).toHaveTextContent('自动保存的版本草稿');
      expect(window.localStorage.getItem('project-a:business:version-6')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets to the initial template when switching to a storage key with no draft', () => {
    const props: React.ComponentProps<typeof WordMockEditor> = {
      deliverableId: 'technical',
      downloadHref: '/technical.docx',
      downloadLabel: '下载技术标',
      onDirty: vi.fn(),
      onSave: vi.fn(),
      storageKey: 'project-a:technical:v1',
    };
    const view = render(<WordMockEditor {...props} />);
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>版本一独立草稿</p>';
    fireEvent.input(editor);
    expect(window.localStorage.getItem('project-a:technical:v1')).toContain('版本一独立草稿');

    view.rerender(<WordMockEditor {...props} storageKey="project-a:technical:v2" />);
    expect(editor).not.toHaveTextContent('版本一独立草稿');
    expect(editor).toHaveTextContent('供货与实施方案');
    expect(window.localStorage.getItem('project-a:technical:v2')).toBeNull();
  });

  it('persists the restored snapshot when undoing before the editor is reopened', () => {
    const first = renderEditor({ storageKey: 'project-a:technical:undo' });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>第一版内容</p>';
    fireEvent.input(editor);
    editor.innerHTML = '<p>第二版内容</p>';
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(editor).toHaveTextContent('第一版内容');
    expect(window.localStorage.getItem('project-a:technical:undo')).toContain('第一版内容');
    expect(window.localStorage.getItem('project-a:technical:undo')).not.toContain('第二版内容');
    first.unmount();

    renderEditor({ storageKey: 'project-a:technical:undo' });
    const restored = screen.getByRole('textbox', { name: '技术标文档内容' });
    expect(restored).toHaveTextContent('第一版内容');
    expect(restored).not.toHaveTextContent('第二版内容');
  });

  it('sanitizes a hostile rich-text draft before restoring it', () => {
    window.localStorage.setItem(
      'word-draft:hostile',
      JSON.stringify({
        html: [
          '<p onclick="alert(1)">安全正文</p>',
          '<a href="javascript:alert(2)" onmouseover="alert(3)">链接文字</a>',
          '<span style="font-size: 19px; background-image: url(javascript:alert(4))">保留字号</span>',
          '<script>window.hacked = true</script>',
          '<style>body{display:none}</style>',
          '<iframe src="javascript:alert(5)"></iframe>',
          '<object data="dangerous"></object>',
          '<embed src="dangerous">',
        ].join(''),
        comments: [],
      }),
    );

    renderEditor({ storageKey: 'word-draft:hostile' });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    expect(editor).toHaveTextContent('安全正文链接文字保留字号');
    expect(editor.querySelector('script, style, iframe, object, embed')).toBeNull();
    expect(editor.querySelector('[onclick], [onmouseover], [href], [src]')).toBeNull();
    expect(editor.querySelector('span')).toHaveStyle({ fontSize: '19px' });
    expect((editor.querySelector('span') as HTMLElement).style.backgroundImage).toBe('');
    expect(window.localStorage.getItem('word-draft:hostile')).not.toContain('iframe');

    editor.innerHTML = '<p onfocus="alert(9)">粘贴正文</p><iframe src="/tracking"></iframe>';
    fireEvent.input(editor);
    expect(editor).toHaveTextContent('粘贴正文');
    expect(editor.querySelector('iframe, [onfocus]')).toBeNull();
    expect(window.localStorage.getItem('word-draft:hostile')).not.toContain('iframe');
  });

  it('prevents default paste and inserts only offline-sanitized content into the live document', () => {
    renderEditor({ storageKey: 'word-draft:paste' });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>粘贴位置</p>';
    fireEvent.input(editor);
    const targetText = editor.querySelector('p')?.firstChild as Text;
    selectText(targetText, targetText.data.length, targetText.data.length);

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData: (type: string) => type === 'text/html'
          ? '<strong>安全粘贴</strong><img src="https://evil.test/pixel" onerror="alert(1)"><svg><image href="https://evil.test/svg"></image></svg><iframe src="https://evil.test/frame"></iframe>'
          : '安全粘贴',
      },
    });
    fireEvent(editor, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(editor).toHaveTextContent('粘贴位置安全粘贴');
    expect(editor.querySelector('img, svg, image, iframe, [src], [onerror]')).toBeNull();
    expect(window.localStorage.getItem('word-draft:paste')).not.toContain('evil.test');
  });

  it('prevents default drop and inserts only safe transferred HTML', () => {
    renderEditor({ storageKey: 'word-draft:drop' });
    const editor = screen.getByRole('textbox', { name: '技术标文档内容' });
    editor.innerHTML = '<p>拖放位置</p>';
    fireEvent.input(editor);
    const targetText = editor.querySelector('p')?.firstChild as Text;
    selectText(targetText, targetText.data.length, targetText.data.length);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(dropEvent, {
      clientX: { value: 0 },
      clientY: { value: 0 },
      dataTransfer: {
        value: {
          getData: (type: string) => type === 'text/html'
            ? '<p onmouseenter="alert(1)">安全拖放</p><object data="https://evil.test/object"></object><embed src="https://evil.test/embed">'
            : '安全拖放',
        },
      },
    });
    fireEvent(editor, dropEvent);

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(editor).toHaveTextContent('拖放位置安全拖放');
    expect(editor.querySelector('object, embed, [onmouseenter], [src]')).toBeNull();
    expect(window.localStorage.getItem('word-draft:drop')).not.toContain('evil.test');
  });
});
