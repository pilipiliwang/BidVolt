import {
  Bold,
  Download,
  Italic,
  Redo2,
  Save,
  Search,
  Sparkles,
  Underline,
  Undo2,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import type { DeliverableRouteId } from '../../app/router';

import './word-editor-v2.css';

type WordMockEditorProps = {
  deliverableId: Exclude<DeliverableRouteId, 'quote'>;
  downloadHref: string;
  downloadLabel: string;
  onDirty: () => void;
  onSave: (content: string) => void;
  onSendSelectionToAssistant?: (selection: string) => void;
  /** When provided, saved rich text and comments are restored for this document. */
  storageKey?: string;
};

type CommentRecord = {
  id: string;
  quote: string;
  body: string;
  resolved: boolean;
  createdAt: string;
};

type DocumentSnapshot = {
  html: string;
  comments: CommentRecord[];
};

type MatchRange = {
  range: Range;
  index: number;
};

type OutlineItem = {
  element: HTMLHeadingElement;
  level: number;
  text: string;
};

const MAX_HISTORY_LENGTH = 80;
const MAX_ASSISTANT_SELECTION_LENGTH = 4_000;

export function WordMockEditor({
  deliverableId,
  downloadHref,
  downloadLabel,
  onDirty,
  onSave,
  onSendSelectionToAssistant,
  storageKey,
}: WordMockEditorProps) {
  const editorRef = useRef<HTMLElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const pendingCommentRangeRef = useRef<Range | null>(null);
  const currentMatchRangeRef = useRef<Range | null>(null);
  const commentsRef = useRef<CommentRecord[]>([]);
  const commentSequenceRef = useRef(0);
  const initialTemplateHtmlRef = useRef<string | null>(null);
  const historyRef = useRef<{ entries: DocumentSnapshot[]; index: number }>({
    entries: [],
    index: -1,
  });

  const isTechnical = deliverableId === 'technical';
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [documentRevision, setDocumentRevision] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const [sidePanel, setSidePanel] = useState<'comments' | 'outline' | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [pendingQuote, setPendingQuote] = useState('');
  const [zoom, setZoom] = useState(100);
  const [paragraphStyle, setParagraphStyle] = useState('p');
  const [fontFamily, setFontFamily] = useState('SimSun, "Songti SC", serif');
  const [fontSize, setFontSize] = useState('16px');
  const [announcement, setAnnouncement] = useState('');

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (initialTemplateHtmlRef.current === null) {
      initialTemplateHtmlRef.current = sanitizeRichTextHtml(editor.innerHTML);
    }
    editor.innerHTML = initialTemplateHtmlRef.current;

    let restoredComments: CommentRecord[] = [];
    let shouldRewriteRestoredDraft = false;
    if (storageKey) {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          shouldRewriteRestoredDraft = true;
          const restored = JSON.parse(raw) as Partial<DocumentSnapshot>;
          if (typeof restored.html === 'string') {
            editor.innerHTML = sanitizeRichTextHtml(restored.html);
          }
          if (Array.isArray(restored.comments)) {
            restoredComments = sanitizeComments(restored.comments);
          }
        }
      } catch {
        setAnnouncement('本地草稿无法读取，已打开当前版本内容。');
      }
    }

    commentsRef.current = restoredComments;
    setComments(restoredComments);
    if (storageKey && shouldRewriteRestoredDraft) {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ html: editor.innerHTML, comments: restoredComments }),
        );
      } catch {
        setAnnouncement('本地草稿已安全恢复，但净化结果回写失败。');
      }
    }
    historyRef.current = {
      entries: [{ html: editor.innerHTML, comments: cloneComments(restoredComments) }],
      index: 0,
    };
    setHistoryRevision((revision) => revision + 1);
    setDocumentRevision((revision) => revision + 1);
  }, [storageKey]);

  useEffect(() => {
    const rememberSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (isRangeInsideEditor(editor, range)) savedRangeRef.current = range.cloneRange();
    };

    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);

  useEffect(() => {
    setMatchIndex(-1);
    currentMatchRangeRef.current = null;
  }, [findText]);

  useEffect(() => {
    if (findOpen) window.setTimeout(() => findInputRef.current?.focus(), 0);
  }, [findOpen]);

  useEffect(() => {
    if (sidePanel === 'comments' && pendingQuote) {
      window.setTimeout(() => commentInputRef.current?.focus(), 0);
    }
  }, [pendingQuote, sidePanel]);

  const history = historyRef.current;
  const canUndo = historyRevision >= 0 && history.index > 0;
  const canRedo =
    historyRevision >= 0 && history.index >= 0 && history.index < history.entries.length - 1;

  const editorText = documentRevision >= 0 ? getEditorText(editorRef.current) : '';
  const characterCount = editorText.replace(/\s/g, '').length;
  const wordCount = countWords(editorText);
  const matches = useMemo(
    () => (findText ? buildMatchRanges(editorRef.current, findText) : []),
    [documentRevision, findText],
  );
  const outline = useMemo(
    () => buildOutline(editorRef.current),
    [documentRevision],
  );

  const updateComments = (nextComments: CommentRecord[]) => {
    commentsRef.current = nextComments;
    setComments(nextComments);
  };

  const recordSnapshot = (
    nextComments = commentsRef.current,
    sanitizedHtml?: string,
  ) => {
    const editor = editorRef.current;
    if (!editor) return;
    const snapshot: DocumentSnapshot = {
      html: sanitizedHtml ?? sanitizeRichTextHtml(editor.innerHTML),
      comments: sanitizeComments(nextComments),
    };
    const currentHistory = historyRef.current;
    const current = currentHistory.entries[currentHistory.index];
    if (current && snapshotsEqual(current, snapshot)) return;

    const entries = currentHistory.entries.slice(0, currentHistory.index + 1);
    entries.push(snapshot);
    if (entries.length > MAX_HISTORY_LENGTH) entries.shift();
    historyRef.current = { entries, index: entries.length - 1 };
    setHistoryRevision((revision) => revision + 1);
  };

  const persistLocalDraft = (
    nextComments = commentsRef.current,
    sanitizedHtml?: string,
  ) => {
    const editor = editorRef.current;
    if (!storageKey || !editor) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          html: sanitizedHtml ?? sanitizeRichTextHtml(editor.innerHTML),
          comments: sanitizeComments(nextComments),
        }),
      );
    } catch {
      setAnnouncement('浏览器本地草稿自动保存失败，请使用保存按钮。');
    }
  };

  const markDocumentChanged = (
    nextComments = commentsRef.current,
    sanitizedHtml?: string,
  ) => {
    const editor = editorRef.current;
    const html = sanitizedHtml ?? (editor ? sanitizeRichTextHtml(editor.innerHTML) : '');
    recordSnapshot(nextComments, html);
    persistLocalDraft(nextComments, html);
    setDocumentRevision((revision) => revision + 1);
    setMatchIndex(-1);
    currentMatchRangeRef.current = null;
    onDirty();
  };

  const restoreSnapshot = (snapshot: DocumentSnapshot) => {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitizedHtml = sanitizeRichTextHtml(snapshot.html);
    editor.innerHTML = sanitizedHtml;
    updateComments(sanitizeComments(snapshot.comments));
    persistLocalDraft(snapshot.comments, sanitizedHtml);
    setDocumentRevision((revision) => revision + 1);
    currentMatchRangeRef.current = null;
    setMatchIndex(-1);
    placeCaretAtEnd(editor, savedRangeRef);
  };

  const undo = () => {
    const currentHistory = historyRef.current;
    if (currentHistory.index <= 0) return;
    const index = currentHistory.index - 1;
    currentHistory.index = index;
    restoreSnapshot(currentHistory.entries[index]);
    setHistoryRevision((revision) => revision + 1);
    setAnnouncement('已撤销上一步修改。');
    onDirty();
  };

  const redo = () => {
    const currentHistory = historyRef.current;
    if (currentHistory.index >= currentHistory.entries.length - 1) return;
    const index = currentHistory.index + 1;
    currentHistory.index = index;
    restoreSnapshot(currentHistory.entries[index]);
    setHistoryRevision((revision) => revision + 1);
    setAnnouncement('已重做上一步修改。');
    onDirty();
  };

  const save = () => {
    const editor = editorRef.current;
    if (!editor) return;
    recordSnapshot();
    if (storageKey) {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            html: sanitizeRichTextHtml(editor.innerHTML),
            comments: sanitizeComments(commentsRef.current),
          }),
        );
      } catch {
        setAnnouncement('内容已提交，但浏览器本地草稿保存失败。');
      }
    }
    onSave(getEditorText(editor).trim());
  };

  const handleKeyboardShortcut = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const target = event.target;
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement) &&
      (key === 'z' || key === 'y')
    ) {
      return;
    }
    if (key === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (key === 'f') {
      event.preventDefault();
      setFindOpen(true);
      return;
    }
    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }
    if (key === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if (key === 'y') {
      event.preventDefault();
      redo();
    }
  };

  const holdEditorSelection = (event: ReactMouseEvent<HTMLButtonElement>) => {
    rememberCurrentSelection(editorRef.current, savedRangeRef);
    event.preventDefault();
  };

  const applyInlineFormat = (tagName: 'strong' | 'em' | 'u') => {
    const range = restoreEditorRange(editorRef.current, savedRangeRef, false);
    if (!range) {
      setAnnouncement('请先选择要设置格式的文字。');
      return;
    }
    wrapRange(range, tagName, undefined, savedRangeRef);
    markDocumentChanged();
  };

  const applyInlineStyle = (style: Partial<CSSStyleDeclaration>) => {
    const range = restoreEditorRange(editorRef.current, savedRangeRef, false);
    if (!range) {
      setAnnouncement('请先选择要设置格式的文字。');
      return;
    }
    wrapRange(range, 'span', style, savedRangeRef);
    markDocumentChanged();
  };

  const applyBlockCommand = (
    command: 'formatBlock' | 'insertUnorderedList' | 'insertOrderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight',
    value?: string,
  ) => {
    const range = restoreEditorRange(editorRef.current, savedRangeRef, true);
    if (!range) {
      setAnnouncement('请将光标放到要设置格式的段落中。');
      return;
    }

    const applied = applyBlockFormatting(
      editorRef.current,
      range,
      savedRangeRef,
      command,
      value,
    );
    if (!applied) {
      setAnnouncement('当前选区暂不支持这项段落格式。');
      return;
    }
    rememberCurrentSelection(editorRef.current, savedRangeRef);
    markDocumentChanged();
  };

  const findNext = () => {
    if (!findText) {
      findInputRef.current?.focus();
      setAnnouncement('请输入要查找的内容。');
      return;
    }
    const nextMatches = buildMatchRanges(editorRef.current, findText);
    if (!nextMatches.length) {
      setMatchIndex(-1);
      setAnnouncement(`未找到“${findText}”。`);
      return;
    }
    const nextIndex = (matchIndex + 1) % nextMatches.length;
    const match = nextMatches[nextIndex];
    selectRange(match.range, savedRangeRef);
    currentMatchRangeRef.current = match.range.cloneRange();
    setMatchIndex(nextIndex);
    setAnnouncement(`已定位第 ${nextIndex + 1} 处，共 ${nextMatches.length} 处。`);
  };

  const replaceCurrent = () => {
    if (!findText) {
      setAnnouncement('请输入要替换的内容。');
      return;
    }
    const nextMatches = buildMatchRanges(editorRef.current, findText);
    if (!nextMatches.length) {
      setAnnouncement(`未找到“${findText}”。`);
      return;
    }
    const index = matchIndex >= 0 && matchIndex < nextMatches.length ? matchIndex : 0;
    replaceRangeText(nextMatches[index].range, replaceText, savedRangeRef);
    markDocumentChanged();
    setAnnouncement('已替换当前匹配内容。');
  };

  const replaceAll = () => {
    if (!findText) {
      setAnnouncement('请输入要替换的内容。');
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    const allMatches = buildMatchRanges(editor, findText);
    if (!allMatches.length) {
      setAnnouncement(`未找到“${findText}”。`);
      return;
    }
    [...allMatches]
      .reverse()
      .forEach(({ range }) => replaceRangeText(range, replaceText, savedRangeRef));
    markDocumentChanged();
    setAnnouncement(`已完成 ${allMatches.length} 处替换。`);
  };

  const beginComment = () => {
    const range = restoreEditorRange(editorRef.current, savedRangeRef, false);
    setSidePanel('comments');
    if (!range) {
      setPendingQuote('');
      pendingCommentRangeRef.current = null;
      setAnnouncement('请先选择一段文字，再添加批注。');
      return;
    }
    pendingCommentRangeRef.current = range.cloneRange();
    setPendingQuote(range.toString().trim());
    setCommentDraft('');
  };

  const addComment = () => {
    const editor = editorRef.current;
    const range = pendingCommentRangeRef.current;
    const body = commentDraft.trim();
    if (!editor || !range || !isRangeInsideEditor(editor, range) || !body) return;

    commentSequenceRef.current += 1;
    const comment: CommentRecord = {
      id: `comment-${Date.now()}-${commentSequenceRef.current}`,
      quote: pendingQuote,
      body,
      resolved: false,
      createdAt: new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()),
    };
    const mark = document.createElement('mark');
    mark.className = 'word-editor-v2__comment-anchor';
    mark.dataset.wordComment = comment.id;
    wrapRangeWithElement(range, mark, savedRangeRef);

    const nextComments = [...commentsRef.current, comment];
    updateComments(nextComments);
    setCommentDraft('');
    setPendingQuote('');
    pendingCommentRangeRef.current = null;
    markDocumentChanged(nextComments);
    setAnnouncement('批注已添加并锚定到所选文字。');
  };

  const toggleCommentResolved = (commentId: string) => {
    const nextComments = commentsRef.current.map((comment) =>
      comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment,
    );
    const resolved = nextComments.find(({ id }) => id === commentId)?.resolved ?? false;
    const anchor = editorRef.current?.querySelector<HTMLElement>(`[data-word-comment="${commentId}"]`);
    if (anchor) {
      anchor.dataset.resolved = String(resolved);
      anchor.classList.toggle('word-editor-v2__comment-anchor--resolved', resolved);
    }
    updateComments(nextComments);
    markDocumentChanged(nextComments);
    setAnnouncement(resolved ? '批注已解决。' : '批注已重新打开。');
  };

  const deleteComment = (commentId: string) => {
    const anchor = editorRef.current?.querySelector<HTMLElement>(`[data-word-comment="${commentId}"]`);
    if (anchor) unwrapElement(anchor);
    const nextComments = commentsRef.current.filter(({ id }) => id !== commentId);
    updateComments(nextComments);
    markDocumentChanged(nextComments);
    setAnnouncement('批注已删除，原文已保留。');
  };

  const sendSelectionToAssistant = () => {
    const range = restoreEditorRange(editorRef.current, savedRangeRef, false);
    const fullSelection = range?.toString().trim() ?? '';
    if (!fullSelection) {
      setAnnouncement('请先选择要针对性修改的内容');
      return;
    }
    if (!onSendSelectionToAssistant) {
      setAnnouncement('AI助手连接暂不可用，请稍后重试。');
      return;
    }
    const selectedText = fullSelection.slice(0, MAX_ASSISTANT_SELECTION_LENGTH);
    onSendSelectionToAssistant(selectedText);
    setAnnouncement(
      fullSelection.length > MAX_ASSISTANT_SELECTION_LENGTH
        ? '选区较长，已截取前4000字填入项目助手输入框。'
        : '已填入项目助手输入框，请补充修改要求。',
    );
  };

  const handleEditorInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeRichTextHtml(editor.innerHTML);
    if (sanitized !== editor.innerHTML) {
      editor.innerHTML = sanitized;
      placeCaretAtEnd(editor, savedRangeRef);
      setAnnouncement('已移除粘贴内容中的不安全格式。');
    }
    markDocumentChanged(commentsRef.current, sanitized);
  };

  const insertTransferredContent = (html: string, plainText: string, preferredRange?: Range) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (preferredRange && isRangeInsideEditor(editor, preferredRange)) {
      selectRange(preferredRange, savedRangeRef);
    }
    let range = restoreEditorRange(editor, savedRangeRef, true);
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    const sanitizedTransferHtml = html ? sanitizeRichTextHtml(html) : '';
    const template = document.createElement('template');
    if (sanitizedTransferHtml) {
      template.innerHTML = sanitizedTransferHtml;
    } else if (plainText) {
      template.content.append(document.createTextNode(plainText));
    } else {
      setAnnouncement('未检测到可插入的文本内容。');
      return;
    }

    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const lastNode = fragment.lastChild;
    if (!lastNode) return;
    range.deleteContents();
    range.insertNode(fragment);
    const caret = document.createRange();
    caret.setStartAfter(lastNode);
    caret.collapse(true);
    selectRange(caret, savedRangeRef);

    const sanitizedDocument = sanitizeRichTextHtml(editor.innerHTML);
    if (sanitizedDocument !== editor.innerHTML) editor.innerHTML = sanitizedDocument;
    markDocumentChanged(commentsRef.current, sanitizedDocument);
    setAnnouncement('内容已安全插入。');
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    insertTransferredContent(
      event.clipboardData.getData('text/html'),
      event.clipboardData.getData('text/plain'),
    );
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    const dropRange = getCaretRangeFromPoint(editorRef.current, event.clientX, event.clientY);
    insertTransferredContent(
      event.dataTransfer.getData('text/html'),
      event.dataTransfer.getData('text/plain'),
      dropRange ?? undefined,
    );
  };

  const updateOutlineTitle = (item: OutlineItem, title: string) => {
    item.element.textContent = title;
    const range = document.createRange();
    range.selectNodeContents(item.element);
    range.collapse(false);
    savedRangeRef.current = range;
    markDocumentChanged();
  };

  const focusOutlineItem = (item: OutlineItem) => {
    item.element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    editorRef.current?.focus();
    const range = document.createRange();
    range.selectNodeContents(item.element);
    range.collapse(true);
    selectRange(range, savedRangeRef);
    setAnnouncement(`已定位到“${item.text || '未命名标题'}”。`);
  };

  const focusFirstPage = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    selectRange(range, savedRangeRef);
    setAnnouncement('已回到第 1 页顶部。');
  };

  return (
    <div
      className="office-word-editor word-editor-v2"
      onKeyDown={handleKeyboardShortcut}
      style={{ '--word-editor-zoom': zoom / 100 } as CSSProperties}
    >
      <div className="office-editor-toolbar word-editor-v2__toolbar" role="toolbar" aria-label="Word 编辑工具栏">
        <div className="word-editor-v2__tool-group" aria-label="历史操作">
          <button aria-label="撤销" disabled={!canUndo} title="撤销 (Ctrl+Z)" type="button" onClick={undo}>
            <Undo2 aria-hidden="true" size={17} />
          </button>
          <button aria-label="重做" disabled={!canRedo} title="重做 (Ctrl+Y)" type="button" onClick={redo}>
            <Redo2 aria-hidden="true" size={17} />
          </button>
        </div>

        <div className="word-editor-v2__tool-group" aria-label="段落和字体">
          <select
            aria-label="段落样式"
            value={paragraphStyle}
            onMouseDown={() => rememberCurrentSelection(editorRef.current, savedRangeRef)}
            onChange={(event) => {
              setParagraphStyle(event.target.value);
              applyBlockCommand('formatBlock', event.target.value);
            }}
          >
            <option value="p">正文</option>
            <option value="h1">标题 1</option>
            <option value="h2">标题 2</option>
          </select>
          <select
            aria-label="字体"
            value={fontFamily}
            onMouseDown={() => rememberCurrentSelection(editorRef.current, savedRangeRef)}
            onChange={(event) => {
              setFontFamily(event.target.value);
              applyInlineStyle({ fontFamily: event.target.value });
            }}
          >
            <option value={'SimSun, "Songti SC", serif'}>宋体</option>
            <option value={'SimHei, "Heiti SC", sans-serif'}>黑体</option>
            <option value={'"Microsoft YaHei", sans-serif'}>微软雅黑</option>
          </select>
          <select
            aria-label="字号"
            value={fontSize}
            onMouseDown={() => rememberCurrentSelection(editorRef.current, savedRangeRef)}
            onChange={(event) => {
              setFontSize(event.target.value);
              applyInlineStyle({ fontSize: event.target.value });
            }}
          >
            <option value="14px">五号</option>
            <option value="16px">小四</option>
            <option value="19px">四号</option>
            <option value="24px">小二</option>
          </select>
        </div>

        <div className="word-editor-v2__tool-group" aria-label="文字格式">
          <button aria-label="加粗" title="加粗" type="button" onMouseDown={holdEditorSelection} onClick={() => applyInlineFormat('strong')}>
            <Bold aria-hidden="true" size={17} />
          </button>
          <button aria-label="斜体" title="斜体" type="button" onMouseDown={holdEditorSelection} onClick={() => applyInlineFormat('em')}>
            <Italic aria-hidden="true" size={17} />
          </button>
          <button aria-label="下划线" title="下划线" type="button" onMouseDown={holdEditorSelection} onClick={() => applyInlineFormat('u')}>
            <Underline aria-hidden="true" size={17} />
          </button>
        </div>

        <div className="word-editor-v2__tool-group" aria-label="列表和对齐">
          <button type="button" onMouseDown={holdEditorSelection} onClick={() => applyBlockCommand('insertUnorderedList')}>项目符号</button>
          <button type="button" onMouseDown={holdEditorSelection} onClick={() => applyBlockCommand('insertOrderedList')}>编号</button>
          <button aria-label="左对齐" title="左对齐" type="button" onMouseDown={holdEditorSelection} onClick={() => applyBlockCommand('justifyLeft')}>左</button>
          <button aria-label="居中对齐" title="居中对齐" type="button" onMouseDown={holdEditorSelection} onClick={() => applyBlockCommand('justifyCenter')}>中</button>
          <button aria-label="右对齐" title="右对齐" type="button" onMouseDown={holdEditorSelection} onClick={() => applyBlockCommand('justifyRight')}>右</button>
        </div>

        <div className="word-editor-v2__tool-group word-editor-v2__tool-group--actions" aria-label="审阅和文件">
          <button type="button" onMouseDown={holdEditorSelection} onClick={beginComment}>添加批注</button>
          <button
            aria-expanded={sidePanel === 'outline'}
            type="button"
            onClick={() => setSidePanel((panel) => (panel === 'outline' ? null : 'outline'))}
          >
            目录/页面预览
          </button>
          <button
            className="office-editor-toolbar__ai"
            type="button"
            onMouseDown={holdEditorSelection}
            onClick={sendSelectionToAssistant}
          >
            <Sparkles aria-hidden="true" size={16} /> AI针对性修改
          </button>
          <button
            aria-label="查找替换"
            aria-expanded={findOpen}
            title="查找替换 (Ctrl+F)"
            type="button"
            onClick={() => setFindOpen((open) => !open)}
          >
            <Search aria-hidden="true" size={16} />
          </button>
          <a
            download
            href={downloadHref}
            aria-label="下载原始 Mock Word"
            title={downloadLabel}
          >
            <Download aria-hidden="true" size={16} /> 下载原始 Mock Word
          </a>
          <button
            className="office-editor-toolbar__save"
            title="保存 (Ctrl+S)"
            type="button"
            onClick={save}
          >
            <Save aria-hidden="true" size={16} /> 保存演示修改
          </button>
        </div>
      </div>

      {findOpen ? (
        <section className="word-editor-v2__find" aria-label="查找替换面板">
          <label>
            <span>查找</span>
            <input ref={findInputRef} value={findText} onChange={(event) => setFindText(event.target.value)} />
          </label>
          <span className="word-editor-v2__match-count" aria-live="polite">
            {matches.length ? `${matchIndex >= 0 ? matchIndex + 1 : 0}/${matches.length}` : '0/0'}
          </span>
          <button type="button" onClick={findNext}>下一个</button>
          <label>
            <span>替换为</span>
            <input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
          </label>
          <button type="button" onClick={replaceCurrent}>替换</button>
          <button type="button" onClick={replaceAll}>全部替换</button>
          <button aria-label="关闭查找替换" type="button" onClick={() => setFindOpen(false)}>×</button>
        </section>
      ) : null}

      <div className={`word-editor-v2__workspace${sidePanel ? ' word-editor-v2__workspace--with-panel' : ''}`}>
        <div className="office-word-stage word-editor-v2__stage">
          <article
            ref={editorRef}
            aria-label={`${isTechnical ? '技术标' : '商务标'}文档内容`}
            aria-multiline="true"
            className="office-word-page"
            contentEditable
            role="textbox"
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyUp={() => rememberCurrentSelection(editorRef.current, savedRangeRef)}
            onMouseUp={() => rememberCurrentSelection(editorRef.current, savedRangeRef)}
            onPaste={handlePaste}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            {isTechnical ? <TechnicalDocument /> : <BusinessDocument />}
          </article>
        </div>

        {sidePanel === 'comments' ? (
          <aside className="word-editor-v2__side-panel" aria-label="批注面板">
            <header>
              <div><strong>批注</strong><span>{comments.filter(({ resolved }) => !resolved).length} 条未解决</span></div>
              <button aria-label="关闭批注面板" type="button" onClick={() => setSidePanel(null)}>×</button>
            </header>
            {pendingQuote ? (
              <div className="word-editor-v2__comment-compose">
                <blockquote>{pendingQuote}</blockquote>
                <label>
                  <span>批注内容</span>
                  <textarea ref={commentInputRef} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} />
                </label>
                <div>
                  <button type="button" onClick={() => {
                    setPendingQuote('');
                    setCommentDraft('');
                    pendingCommentRangeRef.current = null;
                  }}>取消</button>
                  <button disabled={!commentDraft.trim()} type="button" onClick={addComment}>保存批注</button>
                </div>
              </div>
            ) : (
              <p className="word-editor-v2__panel-tip">选择文档文字后点击“添加批注”。</p>
            )}
            <div className="word-editor-v2__comment-list">
              {comments.map((comment) => (
                <article className={comment.resolved ? 'is-resolved' : ''} key={comment.id}>
                  <small>{comment.createdAt} · {comment.resolved ? '已解决' : '待处理'}</small>
                  <blockquote>{comment.quote}</blockquote>
                  <p>{comment.body}</p>
                  <div>
                    <button type="button" onClick={() => toggleCommentResolved(comment.id)}>
                      {comment.resolved ? '重新打开' : '解决'}
                    </button>
                    <button type="button" onClick={() => deleteComment(comment.id)}>删除</button>
                  </div>
                </article>
              ))}
              {!comments.length ? <p className="word-editor-v2__empty">暂无批注</p> : null}
            </div>
          </aside>
        ) : null}

        {sidePanel === 'outline' ? (
          <aside className="word-editor-v2__side-panel" aria-label="目录与页面预览">
            <header>
              <div><strong>目录与页面预览</strong><span>{outline.length} 个标题 · 1 个演示页面</span></div>
              <button aria-label="关闭目录与页面预览" type="button" onClick={() => setSidePanel(null)}>×</button>
            </header>
            <section className="word-editor-v2__outline" aria-label="文档目录">
              <h3>目录</h3>
              {outline.map((item, index) => (
                <div
                  className="word-editor-v2__outline-item"
                  data-level={item.level}
                  key={`${item.level}-${index}`}
                >
                  <input
                    aria-label={`编辑目录标题 ${index + 1}`}
                    value={item.text}
                    onChange={(event) => updateOutlineTitle(item, event.target.value)}
                  />
                  <button
                    aria-label={`定位 ${item.text || `未命名标题 ${index + 1}`}`}
                    type="button"
                    onClick={() => focusOutlineItem(item)}
                  >
                    定位
                  </button>
                </div>
              ))}
              {!outline.length ? <p className="word-editor-v2__empty">正文中暂无标题</p> : null}
            </section>
            <section className="word-editor-v2__pages" aria-label="页面预览（演示画布）">
              <h3>页面预览（演示画布）</h3>
              <p>原生分页需文档服务</p>
              <button type="button" onClick={focusFirstPage}>
                <span>第 1 页</span>
                <small>{outline[0]?.text || '文档正文'}</small>
              </button>
            </section>
          </aside>
        ) : null}

      </div>

      <footer className="word-editor-v2__statusbar">
        <span>演示画布 · 第 1 页</span>
        <span aria-label={`字数 ${wordCount}`}>字数 {wordCount}</span>
        <span>字符 {characterCount}</span>
        <span className="word-editor-v2__announcement" aria-live="polite">{announcement}</span>
        <label>
          <span>缩放</span>
          <select aria-label="缩放比例" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            <option value={75}>75%</option>
            <option value={90}>90%</option>
            <option value={100}>100%</option>
            <option value={110}>110%</option>
            <option value={125}>125%</option>
            <option value={150}>150%</option>
          </select>
        </label>
      </footer>
    </div>
  );
}

function cloneComments(comments: CommentRecord[]) {
  return comments.map((comment) => ({ ...comment }));
}

function sanitizeComments(comments: unknown[]): CommentRecord[] {
  return comments.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const comment = candidate as Partial<CommentRecord>;
    if (
      typeof comment.id !== 'string' ||
      typeof comment.quote !== 'string' ||
      typeof comment.body !== 'string'
    ) {
      return [];
    }
    return [{
      id: comment.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100),
      quote: comment.quote.slice(0, 500),
      body: comment.body.slice(0, 4000),
      resolved: comment.resolved === true,
      createdAt: typeof comment.createdAt === 'string' ? comment.createdAt.slice(0, 100) : '',
    }];
  }).filter(({ id }) => Boolean(id));
}

function sanitizeRichTextHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const dangerousTags = new Set([
    'SCRIPT',
    'STYLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'LINK',
    'META',
    'BASE',
    'FORM',
    'INPUT',
    'BUTTON',
    'TEXTAREA',
    'SELECT',
  ]);
  const allowedTags = new Set([
    'P',
    'DIV',
    'H1',
    'H2',
    'H3',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'S',
    'SUB',
    'SUP',
    'SPAN',
    'BR',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'TABLE',
    'THEAD',
    'TBODY',
    'TR',
    'TH',
    'TD',
    'MARK',
  ]);
  const allowedStyles = new Set([
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-align',
    'text-decoration',
  ]);

  Array.from(template.content.querySelectorAll('*')).forEach((element) => {
    if (dangerousTags.has(element.tagName)) {
      element.remove();
      return;
    }
    if (!allowedTags.has(element.tagName)) {
      unwrapUnknownElement(element);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || ['href', 'src', 'xlink:href', 'formaction'].includes(name)) {
        element.removeAttribute(attribute.name);
        return;
      }
      const allowedAttribute =
        name === 'style' ||
        name === 'colspan' ||
        name === 'rowspan' ||
        name === 'data-word-comment' ||
        name === 'data-resolved' ||
        name === 'class';
      if (!allowedAttribute) element.removeAttribute(attribute.name);
    });

    for (const dataAttribute of ['data-word-comment']) {
      if (!element.hasAttribute(dataAttribute)) continue;
      const safeValue = (element.getAttribute(dataAttribute) ?? '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 100);
      if (safeValue) element.setAttribute(dataAttribute, safeValue);
      else element.removeAttribute(dataAttribute);
    }
    if (
      element.hasAttribute('data-resolved') &&
      !['true', 'false'].includes(element.getAttribute('data-resolved') ?? '')
    ) {
      element.removeAttribute('data-resolved');
    }
    for (const dimensionAttribute of ['colspan', 'rowspan']) {
      if (!element.hasAttribute(dimensionAttribute)) continue;
      const value = Number(element.getAttribute(dimensionAttribute));
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        element.removeAttribute(dimensionAttribute);
      }
    }

    if (element instanceof HTMLElement) {
      const safeStyles: Array<[string, string]> = [];
      for (const property of Array.from(element.style)) {
        const value = element.style.getPropertyValue(property);
        if (
          allowedStyles.has(property) &&
          !/(?:javascript\s*:|expression\s*\(|url\s*\()/i.test(value)
        ) {
          safeStyles.push([property, value]);
        }
      }
      element.removeAttribute('style');
      safeStyles.forEach(([property, value]) => element.style.setProperty(property, value));

      if (element.hasAttribute('class')) {
        const safeClasses = Array.from(element.classList).filter((className) =>
          [
            'word-editor-v2__comment-anchor',
            'word-editor-v2__comment-anchor--resolved',
          ].includes(className),
        );
        element.className = safeClasses.join(' ');
        if (!safeClasses.length) element.removeAttribute('class');
      }
    }
  });
  return template.innerHTML;
}

function unwrapUnknownElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function snapshotsEqual(left: DocumentSnapshot, right: DocumentSnapshot) {
  return left.html === right.html && JSON.stringify(left.comments) === JSON.stringify(right.comments);
}

function getEditorText(editor: HTMLElement | null) {
  return (editor?.innerText ?? editor?.textContent ?? '').replace(/\u00a0/g, ' ');
}

function buildOutline(editor: HTMLElement | null): OutlineItem[] {
  if (!editor) return [];
  return Array.from(editor.querySelectorAll<HTMLHeadingElement>('h1, h2, h3')).map((element) => ({
    element,
    level: Number(element.tagName.slice(1)),
    text: (element.textContent ?? '').replace(/\u00a0/g, ' ').trim(),
  }));
}

function countWords(text: string) {
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = text
    .replace(/[\u3400-\u9fff]/g, ' ')
    .match(/[A-Za-z0-9]+(?:[._'-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return chineseCharacters + latinWords;
}

function isRangeInsideEditor(editor: HTMLElement, range: Range) {
  return editor === range.commonAncestorContainer || editor.contains(range.commonAncestorContainer);
}

function rememberCurrentSelection(editor: HTMLElement | null, rangeRef: { current: Range | null }) {
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (isRangeInsideEditor(editor, range)) rangeRef.current = range.cloneRange();
}

function restoreEditorRange(
  editor: HTMLElement | null,
  rangeRef: { current: Range | null },
  allowCollapsed: boolean,
) {
  if (!editor) return null;
  const directSelection = window.getSelection();
  const directRange = directSelection?.rangeCount ? directSelection.getRangeAt(0) : null;
  const candidate =
    directRange && isRangeInsideEditor(editor, directRange) ? directRange.cloneRange() : rangeRef.current?.cloneRange();
  if (!candidate || !isRangeInsideEditor(editor, candidate) || (!allowCollapsed && candidate.collapsed)) return null;
  selectRange(candidate, rangeRef);
  return candidate;
}

function selectRange(range: Range, rangeRef: { current: Range | null }) {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  rangeRef.current = range.cloneRange();
}

function placeCaretAtEnd(editor: HTMLElement, rangeRef: { current: Range | null }) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selectRange(range, rangeRef);
}

function getCaretRangeFromPoint(editor: HTMLElement | null, x: number, y: number) {
  if (!editor) return null;
  const pointDocument = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null;
    caretPositionFromPoint?: (
      clientX: number,
      clientY: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const directRange = pointDocument.caretRangeFromPoint?.(x, y) ?? null;
  if (directRange && isRangeInsideEditor(editor, directRange)) return directRange;
  const position = pointDocument.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return isRangeInsideEditor(editor, range) ? range : null;
}

function wrapRange(
  range: Range,
  tagName: 'strong' | 'em' | 'u' | 'span',
  style: Partial<CSSStyleDeclaration> | undefined,
  rangeRef: { current: Range | null },
) {
  const element = document.createElement(tagName);
  if (style) Object.assign(element.style, style);
  wrapRangeWithElement(range, element, rangeRef);
}

function wrapRangeWithElement(
  range: Range,
  element: HTMLElement,
  rangeRef: { current: Range | null },
) {
  try {
    range.surroundContents(element);
  } catch {
    const fragment = range.extractContents();
    element.append(fragment);
    range.insertNode(element);
  }
  const selectedRange = document.createRange();
  selectedRange.selectNodeContents(element);
  selectRange(selectedRange, rangeRef);
}

function applyBlockFormatting(
  editor: HTMLElement | null,
  range: Range,
  rangeRef: { current: Range | null },
  command: string,
  value?: string,
) {
  if (!editor) return false;
  const blocks = getSelectedBlocks(editor, range);
  if (!blocks.length) return false;

  if (command === 'formatBlock' && value) {
    if (!['p', 'h1', 'h2'].includes(value)) return false;
    const formatted = blocks.flatMap((block) => {
      if (['li', 'td', 'th'].includes(block.tagName.toLowerCase())) return [];
      if (block.tagName.toLowerCase() === value) return [block];
      const replacement = document.createElement(value);
      replacement.innerHTML = block.innerHTML;
      replacement.className = block.className;
      if (block.getAttribute('style')) replacement.setAttribute('style', block.getAttribute('style')!);
      block.replaceWith(replacement);
      return [replacement];
    });
    if (!formatted.length) return false;
    selectElementContents(formatted, rangeRef);
    return true;
  }

  if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
    const listTag = command === 'insertUnorderedList' ? 'ul' : 'ol';
    const eligibleBlocks = blocks.filter((block) => !['td', 'th'].includes(block.tagName.toLowerCase()));
    if (!eligibleBlocks.length) return false;

    const parentLists = new Set(
      eligibleBlocks
        .map((block) => (block.tagName.toLowerCase() === 'li' ? block.parentElement : null))
        .filter((parent): parent is HTMLElement => Boolean(parent?.matches('ul, ol'))),
    );
    if (parentLists.size === 1 && eligibleBlocks.every((block) => block.tagName.toLowerCase() === 'li')) {
      const currentList = [...parentLists][0];
      if (currentList.tagName.toLowerCase() === listTag) {
        selectElementContents(eligibleBlocks, rangeRef);
        return true;
      }
      const replacementList = document.createElement(listTag);
      replacementList.innerHTML = currentList.innerHTML;
      currentList.replaceWith(replacementList);
      selectElementContents(Array.from(replacementList.children), rangeRef);
      return true;
    }

    const list = document.createElement(listTag);
    eligibleBlocks[0].before(list);
    const items = eligibleBlocks.map((block) => {
      const item = document.createElement('li');
      item.innerHTML = block.innerHTML;
      list.append(item);
      block.remove();
      return item;
    });
    selectElementContents(items, rangeRef);
    return true;
  }

  const alignments: Record<string, string> = {
    justifyLeft: 'left',
    justifyCenter: 'center',
    justifyRight: 'right',
  };
  const alignment = alignments[command];
  if (alignment) {
    blocks.forEach((block) => {
      block.style.textAlign = alignment;
    });
    selectElementContents(blocks, rangeRef);
    return true;
  }
  return false;
}

function getSelectedBlocks(editor: HTMLElement, range: Range) {
  const selector = 'p, h1, h2, h3, li, td, th';
  if (range.collapsed) {
    const node = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as Element);
    const block = node?.closest<HTMLElement>(selector);
    return block && editor.contains(block) ? [block] : [];
  }

  return Array.from(editor.querySelectorAll<HTMLElement>(selector)).filter((block) => {
    try {
      return range.intersectsNode(block);
    } catch {
      return false;
    }
  });
}

function selectElementContents(
  elements: ArrayLike<Element>,
  rangeRef: { current: Range | null },
) {
  if (!elements.length) return;
  const range = document.createRange();
  range.setStart(elements[0], 0);
  range.setEnd(elements[elements.length - 1], elements[elements.length - 1].childNodes.length);
  selectRange(range, rangeRef);
}

function getTextNodes(root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function buildMatchRanges(root: HTMLElement | null, query: string): MatchRange[] {
  if (!root || !query) return [];
  const textNodes = getTextNodes(root);
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let text = '';
  textNodes.forEach((node) => {
    const start = text.length;
    text += node.data;
    segments.push({ node, start, end: text.length });
  });

  const lowerText = text.toLocaleLowerCase('zh-CN');
  const lowerQuery = query.toLocaleLowerCase('zh-CN');
  const result: MatchRange[] = [];
  let cursor = 0;
  while (cursor <= lowerText.length - lowerQuery.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index < 0) break;
    const endIndex = index + query.length;
    const startSegment = segments.find(({ start, end }) => index >= start && index < end);
    const endSegment = segments.find(({ start, end }) => endIndex > start && endIndex <= end);
    if (startSegment && endSegment) {
      const range = document.createRange();
      range.setStart(startSegment.node, index - startSegment.start);
      range.setEnd(endSegment.node, endIndex - endSegment.start);
      result.push({ range, index });
    }
    cursor = index + Math.max(query.length, 1);
  }
  return result;
}

function replaceRangeText(
  range: Range,
  replacement: string,
  rangeRef: { current: Range | null },
) {
  range.deleteContents();
  const text = document.createTextNode(replacement);
  range.insertNode(text);
  const nextRange = document.createRange();
  nextRange.selectNodeContents(text);
  selectRange(nextRange, rangeRef);
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
  parent.normalize();
}

function TechnicalDocument() {
  return (
    <>
      <h2>4&nbsp;&nbsp;供货与实施方案</h2>
      <h3>4.1&nbsp;&nbsp;供货范围</h3>
      <p>本项目的供货范围包括但不限于：汽轮机本体及其附属设备、DCS控制系统、DEH系统、汽机旁路减温减压装置、给水泵组、阀门及管道附件等。</p>
      <h3>4.2&nbsp;&nbsp;实施方案</h3>
      <p>我公司将严格按照招标文件要求及国家相关规范标准，制定详细的实施计划，合理安排资源，确保项目按期、高质量完成。主要实施步骤如下：</p>
      <table>
        <thead><tr><th>序号</th><th>实施阶段</th><th>主要工作内容</th><th>计划工期</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>前期准备</td><td>技术交底、图纸会审、施工方案编制、现场勘查</td><td>7天</td></tr>
          <tr><td>2</td><td>设备供货</td><td>设备制造、出厂检验、运输及到货验收</td><td>45天</td></tr>
          <tr><td>3</td><td>现场施工</td><td>设备安装、管道连接、电气接线、系统调试</td><td>30天</td></tr>
          <tr><td>4</td><td>试运行与验收</td><td>单体试运、联动试运、性能验收、资料移交</td><td>15天</td></tr>
        </tbody>
      </table>
      <p>我们将配备经验丰富的项目团队，建立完善的质量、进度、安全管理体系，确保项目顺利实施并达到预期目标。</p>
    </>
  );
}

function BusinessDocument() {
  return (
    <>
      <h2>2&nbsp;&nbsp;商务响应与投标函</h2>
      <h3>2.1&nbsp;&nbsp;投标函</h3>
      <p>我方已认真研究本项目招标文件、补遗及澄清文件，愿按照招标文件规定承担合同范围内的全部工作。</p>
      <h3>2.2&nbsp;&nbsp;商务条款响应</h3>
      <table>
        <thead><tr><th>序号</th><th>条款</th><th>招标要求</th><th>响应情况</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>交付周期</td><td>合同生效后 90 日内</td><td>完全响应</td></tr>
          <tr><td>2</td><td>质量保证</td><td>验收后 24 个月</td><td>完全响应</td></tr>
          <tr><td>3</td><td>付款方式</td><td>按合同节点支付</td><td>无偏离</td></tr>
        </tbody>
      </table>
      <p>本文件中的修改仅作为当前项目成果版本的演示草稿，保存不会回写企业资料库。</p>
    </>
  );
}
