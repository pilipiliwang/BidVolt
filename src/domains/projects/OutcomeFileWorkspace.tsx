import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Italic,
  ListTree,
  Lock,
  MessageSquareQuote,
  PencilLine,
  Save,
  Underline,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { safeOutcomeImageSource } from './outcome-image-source';

import './outcome-file-workspace.css';
import { FileDownloadButton } from '../../shared/ui/FileDownloadButton';

export type OutcomeFileKind = 'word' | 'spreadsheet' | 'pdf' | 'html' | 'other';
export type OutcomeFileSaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export type OutcomeWordBlock = {
  format?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
  id: string;
  level?: 1 | 2 | 3;
  image?: { src?: string; alt?: string; width?: number; height?: number };
  text: string;
  type?: 'heading' | 'paragraph' | 'list-item' | 'quote' | 'image';
};

export type OutcomeWordPage = {
  blocks: OutcomeWordBlock[];
  id: string;
  label?: string;
};

export type OutcomeWordOutlineItem = {
  blockId?: string;
  id: string;
  label: string;
  level?: 1 | 2 | 3;
  pageId: string;
};

export type OutcomeWordDocument = {
  outline?: OutcomeWordOutlineItem[];
  pages: OutcomeWordPage[];
};

export type OutcomeSpreadsheetCellValue = string | number | boolean | null;

export type OutcomeSpreadsheetCell = {
  displayValue?: string;
  format?: {
    bold?: boolean;
    horizontalAlignment?: 'left' | 'center' | 'right';
    numberFormat?: 'general' | 'number' | 'currency' | 'percent';
  };
  formula?: string;
  readOnly?: boolean;
  value: OutcomeSpreadsheetCellValue;
};

export type OutcomeSpreadsheetCellInput = OutcomeSpreadsheetCellValue | OutcomeSpreadsheetCell;

export type OutcomeSpreadsheetSheet = {
  id: string;
  name: string;
  rows: OutcomeSpreadsheetCellInput[][];
};

export type OutcomeWorkbook = {
  sheets: OutcomeSpreadsheetSheet[];
};

export type OutcomeWorkspaceFile = {
  categoryId: string;
  categoryLabel: string;
  contentRevision?: number | string;
  downloadUrl?: string;
  htmlSource?: string;
  previewUnavailableReason?: string;
  id: string;
  kind: OutcomeFileKind;
  mimeType?: string;
  name: string;
  previewUrl?: string;
  readOnly?: boolean;
  saveStatus?: OutcomeFileSaveStatus;
  version?: string;
  wordDocument?: OutcomeWordDocument;
  workbook?: OutcomeWorkbook;
};

export type OutcomeFileAgentContext = {
  categoryId: string;
  categoryLabel: string;
  fileId: string;
  fileKind: OutcomeFileKind;
  fileName: string;
  label: string;
  location?: string;
  pageId?: string;
  pageNumber?: number;
  range?: string;
  selectedText?: string;
  sheetId?: string;
  sheetName?: string;
  version?: string;
};

export type OutcomeFileDraft =
  | { kind: 'word'; document: OutcomeWordDocument }
  | { kind: 'spreadsheet'; workbook: OutcomeWorkbook };

export type OutcomeFileWorkspaceProps = {
  file: OutcomeWorkspaceFile;
  onClose: () => void;
  onContextChange?: (context: OutcomeFileAgentContext) => void;
  onDownload?: (file: OutcomeWorkspaceFile) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftChange?: (file: OutcomeWorkspaceFile, draft: OutcomeFileDraft) => void;
  onSave?: (file: OutcomeWorkspaceFile, draft: OutcomeFileDraft) => Promise<void> | void;
  onSendContextToAgent?: (context: OutcomeFileAgentContext) => void;
  toolbarContainer?: HTMLElement | null;
};

type SelectedCell = {
  columnIndex: number;
  rowIndex: number;
  sheetId: string;
};

type FocusedWordBlock = {
  blockId: string;
  pageId: string;
};

type WordFormatKey = keyof NonNullable<OutcomeWordBlock['format']>;

type StoredBrowserDraft = {
  draft: OutcomeFileDraft;
  fileId: string;
  savedAt: string;
  version?: string;
};

const SAVE_LABELS: Record<OutcomeFileSaveStatus, string> = {
  clean: '未修改',
  dirty: '有未保存修改',
  error: '保存失败',
  saved: '已保存',
  saving: '正在保存',
};

const KIND_LABELS: Record<OutcomeFileKind, string> = {
  html: 'HTML',
  other: '文件',
  pdf: 'PDF',
  spreadsheet: 'Excel',
  word: 'Word',
};

export function OutcomeFileWorkspace({
  file,
  onClose,
  onContextChange,
  onDownload,
  onDirtyChange,
  onDraftChange,
  onSave,
  onSendContextToAgent,
  toolbarContainer,
}: OutcomeFileWorkspaceProps) {
  const embedded = toolbarContainer !== undefined;
  const fileStateKey = JSON.stringify([file.id, file.version, file.contentRevision]);
  const [statusFileKey, setStatusFileKey] = useState(fileStateKey);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const activeFileKeyRef = useRef(fileStateKey);
  const [wordDocument, setWordDocument] = useState<OutcomeWordDocument>(() =>
    cloneWordDocument(file.wordDocument),
  );
  const [workbook, setWorkbook] = useState<OutcomeWorkbook>(() => cloneWorkbook(file.workbook));
  const [saveStatus, setSaveStatus] = useState<OutcomeFileSaveStatus>(file.saveStatus ?? 'clean');
  const [browserDraftMode, setBrowserDraftMode] = useState(false);
  const [hasStoredBrowserDraft, setHasStoredBrowserDraft] = useState(false);
  const [agentContext, setAgentContext] = useState<OutcomeFileAgentContext>(() =>
    createBaseContext(file),
  );

  useEffect(() => {
    activeFileKeyRef.current = fileStateKey;
    setWordDocument(cloneWordDocument(file.wordDocument));
    setWorkbook(cloneWorkbook(file.workbook));
    setSaveStatus(file.saveStatus ?? 'clean');
    setStatusFileKey(fileStateKey);
    setBrowserDraftMode(false);
    setHasStoredBrowserDraft(Boolean(readStoredBrowserDraft(browserDraftStorageKey(file), file)));
  }, [fileStateKey]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    // Wait for a switched file's status to settle before reporting to its tab.
    if (statusFileKey !== fileStateKey) return;
    onDirtyChangeRef.current?.(['dirty', 'saving', 'error'].includes(saveStatus));
  }, [fileStateKey, saveStatus, statusFileKey]);

  useEffect(() => {
    const context = createBaseContext(file);
    setAgentContext(context);
    onContextChange?.(context);
  }, [
    file.categoryId,
    file.categoryLabel,
    file.id,
    file.kind,
    file.name,
    file.version,
    onContextChange,
  ]);

  useEffect(() => {
    if (file.saveStatus) setSaveStatus(file.saveStatus);
  }, [file.saveStatus]);

  const hasStructuredEditor = file.kind === 'word'
    ? wordDocument.pages.length > 0
    : file.kind === 'spreadsheet' && workbook.sheets.length > 0;
  const canCreateBrowserDraft = !onSave && hasStructuredEditor;
  const cloudEditable = file.readOnly === false && Boolean(onSave);
  const readOnly = !cloudEditable && !browserDraftMode;
  const publishContext = (context: OutcomeFileAgentContext) => {
    setAgentContext(context);
    onContextChange?.(context);
  };

  const markWordChanged = (nextDocument: OutcomeWordDocument) => {
    setWordDocument(nextDocument);
    setSaveStatus('dirty');
    onDraftChange?.(file, { kind: 'word', document: cloneWordDocument(nextDocument) });
  };

  const markWorkbookChanged = (nextWorkbook: OutcomeWorkbook) => {
    setWorkbook(nextWorkbook);
    setSaveStatus('dirty');
    onDraftChange?.(file, { kind: 'spreadsheet', workbook: cloneWorkbook(nextWorkbook) });
  };

  const save = async () => {
    if (readOnly || saveStatus === 'saving') return;
    const draft = currentDraft(file.kind, wordDocument, workbook);
    if (!draft) return;
    setSaveStatus('saving');
    if (browserDraftMode) {
      try {
        const storedDraft: StoredBrowserDraft = {
          draft,
          fileId: file.id,
          savedAt: new Date().toISOString(),
          version: file.version,
        };
        window.localStorage.setItem(browserDraftStorageKey(file), JSON.stringify(storedDraft));
        setHasStoredBrowserDraft(true);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
      return;
    }
    if (!onSave) {
      setSaveStatus('error');
      return;
    }
    try {
      await onSave(file, draft);
      if (activeFileKeyRef.current === fileStateKey) setSaveStatus('saved');
    } catch {
      if (activeFileKeyRef.current === fileStateKey) setSaveStatus('error');
    }
  };

  const createBrowserDraft = () => {
    if (!canCreateBrowserDraft) return;
    const stored = readStoredBrowserDraft(browserDraftStorageKey(file), file);
    if (stored?.draft.kind === 'word') setWordDocument(cloneWordDocument(stored.draft.document));
    if (stored?.draft.kind === 'spreadsheet') setWorkbook(cloneWorkbook(stored.draft.workbook));
    setBrowserDraftMode(true);
    setSaveStatus(stored ? 'saved' : 'clean');
  };

  const requestClose = () => {
    if (saveStatus === 'dirty' && !window.confirm('当前文档有未保存的修改，确定关闭并放弃修改吗？')) return;
    onClose();
  };

  const safeDownloadUrl = safePreviewUrl(file.downloadUrl);
  const hasPreviewUrl = Boolean(safePreviewUrl(file.previewUrl));
  const editStatus = (
    <>
      {browserDraftMode ? (
        <span aria-label="文件编辑能力" className="is-browser-draft" role="status" title="浏览器编辑副本 · 未同步云端">
          {embedded ? '本地副本' : '浏览器编辑副本 · 未同步云端'}
        </span>
      ) : null}
      {!readOnly ? (
        <span aria-label="文件保存状态" className={`is-${saveStatus}`} role="status" title={SAVE_LABELS[saveStatus]}>
          {SAVE_LABELS[saveStatus]}
        </span>
      ) : (
        <span aria-label="文件编辑能力" role="status" title="只读预览">
          <Lock aria-hidden="true" size={12} />只读预览
        </span>
      )}
    </>
  );
  const actions = (
    <div className={`outcome-file-workspace__actions${embedded ? ' outcome-file-workspace__actions--embedded' : ''}`}>
      {onSendContextToAgent ? (
        <button
          aria-label="引用当前定位"
          className="outcome-file-workspace__context-action"
          onClick={() => onSendContextToAgent(agentContext)}
          title={agentContext.location ? `引用 ${agentContext.location}` : '引用当前文件'}
          type="button"
        >
          <MessageSquareQuote aria-hidden="true" size={16} />
          <span>引用到对话框</span>
        </button>
      ) : null}
      {canCreateBrowserDraft && !browserDraftMode ? (
        <button
          aria-label={hasStoredBrowserDraft ? '继续编辑浏览器草稿' : '创建浏览器草稿'}
          className="outcome-file-workspace__draft-action"
          onClick={createBrowserDraft}
          title="创建独立的浏览器编辑副本；不会修改或同步云端原文件"
          type="button"
        >
          <PencilLine aria-hidden="true" size={16} />
          {!embedded ? <span>{hasStoredBrowserDraft ? '继续本地草稿' : '创建编辑副本'}</span> : null}
        </button>
      ) : null}
      {onDownload ? <FileDownloadButton key={file.id}
        className="outcome-file-workspace__download-action"
        title={browserDraftMode ? '下载源文件（不含浏览器草稿修改）' : '下载当前文件'}
        onDownload={async () => {
          if (browserDraftMode && !window.confirm('下载的是源文件，不含浏览器草稿修改。继续下载吗？')) return;
          await onDownload(file);
        }}
      /> : safeDownloadUrl ? <a aria-label="下载文件" className="outcome-file-workspace__download-action"
        download href={safeDownloadUrl} title="下载源文件" onClick={(event) => {
          if (browserDraftMode && !window.confirm('下载的是源文件，不含浏览器草稿修改。继续下载吗？')) event.preventDefault();
        }}><Download aria-hidden="true" size={16} /><span>下载文件</span></a> : null}
      {!readOnly ? (
        <button
          aria-label={browserDraftMode ? '保存浏览器草稿' : '保存文件'}
          disabled={saveStatus === 'saving' || saveStatus === 'clean'}
          onClick={() => void save()}
          title={browserDraftMode ? '保存浏览器草稿' : '保存文件'}
          type="button"
        >
          <Save aria-hidden="true" size={17} />
        </button>
      ) : null}
      {!embedded ? (
        <button aria-label="关闭文件预览" onClick={requestClose} title="关闭文件预览" type="button">
          <X aria-hidden="true" size={19} />
        </button>
      ) : null}
    </div>
  );

  return (
    <section className={`outcome-file-workspace${embedded ? ' outcome-file-workspace--embedded' : ''}`} aria-label={`${file.name}文件工作区`}>
      {embedded ? (toolbarContainer ? createPortal(
        <div className="outcome-file-workspace__tab-toolbar" aria-label="文件操作工具栏" role="toolbar">
          <div className="outcome-file-workspace__metadata">{editStatus}</div>
          {actions}
        </div>,
        toolbarContainer,
      ) : null) : (
      <header className="outcome-file-workspace__header">
        <span className="outcome-file-workspace__file-icon" aria-hidden="true">
          {file.kind === 'spreadsheet' ? <FileSpreadsheet /> : <FileText />}
        </span>
        <div className="outcome-file-workspace__identity">
          <nav aria-label="文件位置">
            <span>{file.categoryLabel}</span>
            <ChevronRight aria-hidden="true" size={14} />
            <strong title={file.name}>{file.name}</strong>
          </nav>
          <div className="outcome-file-workspace__metadata">
            <span>{KIND_LABELS[file.kind]}</span>
            {file.version ? <span>版本 {file.version}</span> : <span>版本待返回</span>}
            {editStatus}
          </div>
        </div>
        {actions}
      </header>
      )}

      {browserDraftMode ? (
        <div className="outcome-file-workspace__draft-notice" role="status">
          当前正在编辑浏览器副本；保存内容仅留在此浏览器，不会修改原文件，也不代表已同步云端。
        </div>
      ) : null}

      {file.kind === 'word' ? (
        wordDocument.pages.length > 0 ? (
          <WordFileCanvas
            contextBase={createBaseContext(file)}
            document={wordDocument}
            onChange={markWordChanged}
            onContextChange={publishContext}
            onSendContextToAgent={onSendContextToAgent}
            readOnly={readOnly}
          />
        ) : hasPreviewUrl ? (
          <ReadOnlyFileCanvas
            emptyMessage="Word 预览暂时不可用，请下载原文件查看。"
            file={file}
            title="Word 预览"
          />
        ) : (
          <EmptyFileCanvas message="后端尚未返回可预览的文档内容。" title="文档内容待返回" />
        )
      ) : null}

      {file.kind === 'spreadsheet' ? (
        workbook.sheets.length > 0 ? (
          <SpreadsheetFileCanvas
            contextBase={createBaseContext(file)}
            onChange={markWorkbookChanged}
            onContextChange={publishContext}
            onSendContextToAgent={onSendContextToAgent}
            readOnly={readOnly}
            workbook={workbook}
          />
        ) : hasPreviewUrl ? (
          <ReadOnlyFileCanvas
            emptyMessage="Excel 预览暂时不可用，请下载原文件查看。"
            file={file}
            title="Excel 预览"
          />
        ) : (
          <EmptyFileCanvas message="后端尚未返回可预览的工作表内容。" title="工作表待返回" />
        )
      ) : null}

      {file.kind === 'pdf' ? (
        <ReadOnlyFileCanvas
          emptyMessage="PDF 预览地址尚未返回，可稍后重试或下载原文件。"
          file={file}
          title="PDF 预览"
        />
      ) : null}

      {file.kind === 'html' ? (
        <ReadOnlyFileCanvas
          emptyMessage="网页预览内容尚未返回，可稍后重试或下载原文件。"
          file={file}
          title="HTML 预览"
        />
      ) : null}

      {file.kind === 'other' ? (
        hasPreviewUrl ? (
          <ReadOnlyFileCanvas
            emptyMessage="文件预览地址尚未返回，可稍后重试或下载原文件。"
            file={file}
            title={file.mimeType?.startsWith('image/') ? '图片预览' : '文件预览'}
          />
        ) : (
          <EmptyFileCanvas
            message="该格式暂不支持在线预览，请下载原文件后查看。"
            title="暂不支持在线预览"
          />
        )
      ) : null}
    </section>
  );
}

function WordFileCanvas({
  contextBase,
  document,
  onChange,
  onContextChange,
  onSendContextToAgent,
  readOnly,
}: {
  contextBase: OutcomeFileAgentContext;
  document: OutcomeWordDocument;
  onChange: (document: OutcomeWordDocument) => void;
  onContextChange: (context: OutcomeFileAgentContext) => void;
  onSendContextToAgent?: (context: OutcomeFileAgentContext) => void;
  readOnly: boolean;
}) {
  const [navigationMode, setNavigationMode] = useState<'outline' | 'pages'>('outline');
  const [activePageId, setActivePageId] = useState(document.pages[0]?.id ?? '');
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<FocusedWordBlock | null>(null);
  const [selectionAction, setSelectionAction] = useState<{
    context: OutcomeFileAgentContext;
    left: number;
    pageId: string;
    top: number;
  } | null>(null);
  const [zoom, setZoom] = useState(90);
  const pageRefs = useRef(new Map<string, HTMLElement>());
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const outline = useMemo(() => buildWordOutline(document), [document]);
  const focusedBlockValue = focusedBlock
    ? document.pages.find((page) => page.id === focusedBlock.pageId)
      ?.blocks.find((block) => block.id === focusedBlock.blockId)
    : undefined;

  useEffect(() => {
    if (!document.pages.some((page) => page.id === activePageId)) {
      setActivePageId(document.pages[0]?.id ?? '');
    }
  }, [activePageId, document.pages]);

  useEffect(() => {
    setActiveOutlineId(null);
    setFocusedBlock(null);
    setSelectionAction(null);
  }, [contextBase.fileId, contextBase.version]);

  const navigateTo = (pageId: string, blockId?: string) => {
    setActivePageId(pageId);
    const target = (blockId ? blockRefs.current.get(`${pageId}:${blockId}`) : undefined)
      ?? pageRefs.current.get(pageId);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const pageIndex = document.pages.findIndex((page) => page.id === pageId);
    const item = outline.find((entry) => entry.blockId === blockId && entry.pageId === pageId);
    setActiveOutlineId(item?.id ?? null);
    setSelectionAction(null);
    onContextChange({
      ...contextBase,
      label: `${contextBase.fileName} · ${item?.label ?? `第 ${pageIndex + 1} 页`}`,
      location: item?.label ?? `第 ${pageIndex + 1} 页`,
      pageId,
      pageNumber: pageIndex + 1,
    });
  };

  const updateBlock = (pageId: string, blockId: string, text: string) => {
    onChange({
      ...document,
      pages: document.pages.map((page) => page.id === pageId ? {
        ...page,
        blocks: page.blocks.map((block) => block.id === blockId ? { ...block, text } : block),
      } : page),
    });
  };

  const toggleBlockFormat = (format: WordFormatKey) => {
    if (readOnly || !focusedBlock) return;
    onChange({
      ...document,
      pages: document.pages.map((page) => page.id === focusedBlock.pageId ? {
        ...page,
        blocks: page.blocks.map((block) => block.id === focusedBlock.blockId ? {
          ...block,
          format: {
            ...block.format,
            [format]: !block.format?.[format],
          },
        } : block),
      } : page),
    });
  };

  const publishWordSelection = (event: MouseEvent<HTMLElement>, page: OutcomeWordPage) => {
    const selection = window.getSelection();
    const root = event.currentTarget;
    const selectedText = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
    const anchorElement = selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    if (selectedText && (!anchorElement || !root.contains(anchorElement))) return;

    const selectedBlock = anchorElement?.closest<HTMLElement>('[data-word-block-id]');
    const outlineItem = selectedBlock
      ? outlineItemForWordBlock(page, selectedBlock.dataset.wordBlockId, outline)
      : undefined;
    const pageIndex = document.pages.findIndex((item) => item.id === page.id);
    setActivePageId(page.id);
    setActiveOutlineId(outlineItem?.id ?? null);
    const context: OutcomeFileAgentContext = {
      ...contextBase,
      label: selectedText
        ? `${contextBase.fileName} · ${outlineItem?.label ?? `第 ${pageIndex + 1} 页`} · 已选文字`
        : `${contextBase.fileName} · ${outlineItem?.label ?? `第 ${pageIndex + 1} 页`}`,
      location: outlineItem?.label ?? `第 ${pageIndex + 1} 页`,
      pageId: page.id,
      pageNumber: pageIndex + 1,
      selectedText: selectedText || undefined,
    };
    if (!selectedText) {
      setSelectionAction(null);
      onContextChange(context);
      return;
    }

    const bounds = root.getBoundingClientRect();
    setSelectionAction({
      context,
      left: Math.max(12, Math.min(event.clientX - bounds.left, Math.max(12, bounds.width - 156))),
      pageId: page.id,
      top: Math.max(12, Math.min(event.clientY - bounds.top + 12, Math.max(12, bounds.height - 42))),
    });
  };

  const attachSelectionToConversation = () => {
    if (!selectionAction) return;
    onContextChange(selectionAction.context);
    onSendContextToAgent?.(selectionAction.context);
    setSelectionAction(null);
    window.getSelection()?.removeAllRanges();
  };

  if (document.pages.length === 0) {
    return (
      <EmptyFileCanvas
        message="后端尚未返回可分页的文档内容。文件到达后，这里将显示目录、页面和正文。"
        title="文档内容待返回"
      />
    );
  }

  return (
    <div className="outcome-word" data-read-only={readOnly || undefined}>
      <div className="outcome-word__ribbon" role="toolbar" aria-label="Word 文件工具栏">
        <strong>文件</strong>
        <button
          aria-pressed={Boolean(focusedBlockValue?.format?.bold)}
          className="outcome-office-format-action"
          disabled={readOnly || !focusedBlockValue}
          onClick={() => toggleBlockFormat('bold')}
          title={readOnly ? '只读预览不可编辑' : focusedBlockValue ? '切换当前段落的加粗格式' : '请先选择正文或标题'}
          type="button"
        >
          <Bold aria-hidden="true" size={14} />加粗
        </button>
        <button
          aria-pressed={Boolean(focusedBlockValue?.format?.italic)}
          className="outcome-office-format-action"
          disabled={readOnly || !focusedBlockValue}
          onClick={() => toggleBlockFormat('italic')}
          title={readOnly ? '只读预览不可编辑' : focusedBlockValue ? '切换当前段落的斜体格式' : '请先选择正文或标题'}
          type="button"
        >
          <Italic aria-hidden="true" size={14} />斜体
        </button>
        <button
          aria-pressed={Boolean(focusedBlockValue?.format?.underline)}
          className="outcome-office-format-action"
          disabled={readOnly || !focusedBlockValue}
          onClick={() => toggleBlockFormat('underline')}
          title={readOnly ? '只读预览不可编辑' : focusedBlockValue ? '切换当前段落的下划线格式' : '请先选择正文或标题'}
          type="button"
        >
          <Underline aria-hidden="true" size={14} />下划线
        </button>
        <button
          aria-pressed={navigationMode === 'outline'}
          onClick={() => setNavigationMode('outline')}
          type="button"
        >
          <ListTree aria-hidden="true" size={15} />目录
        </button>
        <button
          aria-pressed={navigationMode === 'pages'}
          onClick={() => setNavigationMode('pages')}
          type="button"
        >
          <FileText aria-hidden="true" size={15} />页面
        </button>
        <span className="outcome-word__ribbon-spacer" />
        <button aria-label="缩小文档" disabled={zoom <= 60} onClick={() => setZoom((value) => Math.max(60, value - 10))} type="button">
          <ZoomOut aria-hidden="true" size={15} />
        </button>
        <output aria-label="文档缩放比例">{zoom}%</output>
        <button aria-label="放大文档" disabled={zoom >= 140} onClick={() => setZoom((value) => Math.min(140, value + 10))} type="button">
          <ZoomIn aria-hidden="true" size={15} />
        </button>
      </div>
      <div className="outcome-word__body">
        <aside className="outcome-word__navigation" aria-label="文档导航">
          <header>
            <strong>{navigationMode === 'outline' ? '文档目录' : '页面'}</strong>
            <small>{document.pages.length} 页</small>
          </header>
          {navigationMode === 'outline' ? (
            outline.length > 0 ? (
              <ol className="outcome-word__outline">
                {outline.map((item) => (
                  <li key={item.id} data-level={item.level ?? 1}>
                    <button
                      aria-current={item.id === activeOutlineId ? 'location' : undefined}
                      onClick={() => navigateTo(item.pageId, item.blockId)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="outcome-word__navigation-empty">暂未识别到标题目录</p>
          ) : (
            <ol className="outcome-word__thumbnails">
              {document.pages.map((page, index) => (
                <li key={page.id}>
                  <button
                    aria-current={page.id === activePageId ? 'page' : undefined}
                    onClick={() => navigateTo(page.id)}
                    type="button"
                  >
                    <span aria-hidden="true"><i /><i /><i /><i /></span>
                    <small>{page.label ?? `第 ${index + 1} 页`}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>
        <main className="outcome-word__viewport" aria-label="Word 文档页面">
          <div className="outcome-word__page-stack" style={{ '--word-zoom': zoom / 100 } as React.CSSProperties}>
            {document.pages.map((page, pageIndex) => (
              <article
                className="outcome-word__page"
                data-active={page.id === activePageId || undefined}
                key={page.id}
                onMouseUp={(event) => publishWordSelection(event, page)}
                ref={(element) => {
                  if (element) pageRefs.current.set(page.id, element);
                  else pageRefs.current.delete(page.id);
                }}
              >
                <span className="outcome-word__page-number">{pageIndex + 1}</span>
                {page.blocks.length > 0 ? page.blocks.map((block) => (
                  <WordBlockView
                    block={block}
                    key={block.id}
                    onChange={(text) => updateBlock(page.id, block.id, text)}
                    onFocus={() => setFocusedBlock({ blockId: block.id, pageId: page.id })}
                    readOnly={readOnly}
                    register={(element) => {
                      const blockKey = `${page.id}:${block.id}`;
                      if (element) blockRefs.current.set(blockKey, element);
                      else blockRefs.current.delete(blockKey);
                    }}
                  />
                )) : (
                  <p className="outcome-word__empty-page">本页暂无可展示内容</p>
                )}
                {selectionAction?.pageId === page.id ? (
                  <button
                    className="outcome-word__selection-action"
                    onClick={attachSelectionToConversation}
                    onMouseDown={(event) => event.preventDefault()}
                    style={{ left: selectionAction.left, top: selectionAction.top }}
                    type="button"
                  >
                    <MessageSquareQuote aria-hidden="true" size={15} />
                    引用到对话框
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </main>
      </div>
      <footer className="outcome-office-statusbar">
        <span>第 {Math.max(1, document.pages.findIndex((page) => page.id === activePageId) + 1)} 页，共 {document.pages.length} 页</span>
        <span>{readOnly ? '只读预览' : '可编辑文档'}</span>
        <span>{zoom}%</span>
      </footer>
    </div>
  );
}

function WordBlockView({
  block,
  onChange,
  onFocus,
  readOnly,
  register,
}: {
  block: OutcomeWordBlock;
  onChange: (text: string) => void;
  onFocus: () => void;
  readOnly: boolean;
  register: (element: HTMLElement | null) => void;
}) {
  if (block.type === 'image') return <WordImageBlock block={block} register={register} />;
  const commonProps = {
    'aria-label': `${block.type === 'heading' ? '标题' : '正文'}：${block.text || '空白'}`,
    'contentEditable': !readOnly,
    'data-word-block-id': block.id,
    'data-word-bold': block.format?.bold || undefined,
    'data-word-italic': block.format?.italic || undefined,
    'data-word-underline': block.format?.underline || undefined,
    'onFocus': onFocus,
    'onInput': (event: FormEvent<HTMLElement>) => onChange(event.currentTarget.textContent ?? ''),
    'ref': register,
    'suppressContentEditableWarning': true,
  };

  if (block.type === 'heading') {
    if (block.level === 1) return <h1 {...commonProps}>{block.text}</h1>;
    if (block.level === 3) return <h3 {...commonProps}>{block.text}</h3>;
    return <h2 {...commonProps}>{block.text}</h2>;
  }
  if (block.type === 'quote') return <blockquote {...commonProps}>{block.text}</blockquote>;
  if (block.type === 'list-item') return <p className="is-list-item" {...commonProps}>{block.text}</p>;
  return <p {...commonProps}>{block.text}</p>;
}

function WordImageBlock({ block, register }: {
  block: OutcomeWordBlock;
  register: (element: HTMLElement | null) => void;
}) {
  const source = safeOutcomeImageSource(block.image?.src);
  const [failedSource, setFailedSource] = useState<string>();
  const caption = block.text.trim();
  const alt = block.image?.alt || caption || '文档图片';
  return (
    <figure className="outcome-word__image" data-word-block-id={block.id} ref={register}>
      {source && failedSource !== source ? (
        <img alt={alt} decoding="async" height={block.image?.height} loading="lazy"
          onError={() => setFailedSource(source)} referrerPolicy="no-referrer" src={source} width={block.image?.width} />
      ) : (
        <div className="outcome-word__image-unavailable" role="status">
          <strong>{alt}</strong>
          <span>{source ? '图片加载失败，请下载原文件核对。' : '预览未提供可访问的图片资源，请下载原文件核对。'}</span>
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function SpreadsheetFileCanvas({
  contextBase,
  onChange,
  onContextChange,
  onSendContextToAgent,
  readOnly,
  workbook,
}: {
  contextBase: OutcomeFileAgentContext;
  onChange: (workbook: OutcomeWorkbook) => void;
  onContextChange: (context: OutcomeFileAgentContext) => void;
  onSendContextToAgent?: (context: OutcomeFileAgentContext) => void;
  readOnly: boolean;
  workbook: OutcomeWorkbook;
}) {
  const activeSheetByFile = useRef(new Map<string, string>());
  const rememberedSheet = activeSheetByFile.current.get(contextBase.fileId);
  const [activeSheetId, setActiveSheetId] = useState(
    rememberedSheet && workbook.sheets.some((sheet) => sheet.id === rememberedSheet)
      ? rememberedSheet
      : workbook.sheets[0]?.id ?? '',
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [formulaDraft, setFormulaDraft] = useState('');
  const [zoom, setZoom] = useState(100);
  const activeSheet = workbook.sheets.find((sheet) => sheet.id === activeSheetId)
    ?? workbook.sheets[0];
  const normalizedRows = useMemo(
    () => activeSheet?.rows.map((row) => row.map(normalizeCell)) ?? [],
    [activeSheet],
  );
  const columnCount = normalizedRows.reduce((count, row) => Math.max(count, row.length), 0);
  const selected = selectedCell && selectedCell.sheetId === activeSheet?.id
    ? normalizedRows[selectedCell.rowIndex]?.[selectedCell.columnIndex]
    : undefined;
  const selectedAddress = selectedCell && selectedCell.sheetId === activeSheet?.id
    ? cellAddress(selectedCell.rowIndex, selectedCell.columnIndex)
    : '';
  const activeSheetIndex = activeSheet
    ? workbook.sheets.findIndex((sheet) => sheet.id === activeSheet.id)
    : -1;

  useEffect(() => {
    if (!activeSheet || workbook.sheets.some((sheet) => sheet.id === activeSheetId)) return;
    setActiveSheetId(workbook.sheets[0]?.id ?? '');
    setSelectedCell(null);
  }, [activeSheet, activeSheetId, workbook.sheets]);

  useEffect(() => {
    const remembered = activeSheetByFile.current.get(contextBase.fileId);
    const nextSheetId = remembered && workbook.sheets.some((sheet) => sheet.id === remembered)
      ? remembered
      : workbook.sheets[0]?.id ?? '';
    setActiveSheetId(nextSheetId);
    setSelectedCell(null);
  }, [contextBase.fileId, contextBase.version, workbook.sheets]);

  useEffect(() => {
    setFormulaDraft(selected ? selected.formula ?? stringCellValue(selected.value) : '');
  }, [selected, selectedAddress]);

  const selectSheet = (sheet: OutcomeSpreadsheetSheet) => {
    activeSheetByFile.current.set(contextBase.fileId, sheet.id);
    setActiveSheetId(sheet.id);
    setSelectedCell(null);
    setFormulaDraft('');
    onContextChange({
      ...contextBase,
      label: `${contextBase.fileName} · ${sheet.name}`,
      location: sheet.name,
      sheetId: sheet.id,
      sheetName: sheet.name,
    });
  };

  const selectCell = (sheet: OutcomeSpreadsheetSheet, rowIndex: number, columnIndex: number) => {
    const cell = normalizeCell(sheet.rows[rowIndex]?.[columnIndex] ?? null);
    setSelectedCell({ columnIndex, rowIndex, sheetId: sheet.id });
    setFormulaDraft(cell.formula ?? stringCellValue(cell.value));
    onContextChange(spreadsheetCellContext(contextBase, sheet, rowIndex, columnIndex));
  };

  const attachSelectedCellToConversation = () => {
    if (!activeSheet || !selectedCell || !selectedAddress) return;
    const context = spreadsheetCellContext(
      contextBase,
      activeSheet,
      selectedCell.rowIndex,
      selectedCell.columnIndex,
    );
    onContextChange(context);
    onSendContextToAgent?.(context);
  };

  const updateCell = (
    sheetId: string,
    rowIndex: number,
    columnIndex: number,
    value: string,
    formula?: string,
  ) => {
    const nextWorkbook: OutcomeWorkbook = {
      sheets: workbook.sheets.map((sheet) => {
        if (sheet.id !== sheetId) return sheet;
        const rows = sheet.rows.map((row) => [...row]);
        const row = rows[rowIndex] ? [...rows[rowIndex]] : [];
        const previous = normalizeCell(row[columnIndex] ?? null);
        row[columnIndex] = {
          ...previous,
          displayValue: undefined,
          formula,
          value: formula ? value : coerceCellValue(previous.value, value),
        };
        rows[rowIndex] = row;
        return { ...sheet, rows };
      }),
    };
    onChange(nextWorkbook);
  };

  const commitFormula = () => {
    if (!activeSheet || !selectedCell || readOnly || selected?.readOnly) return;
    updateCell(
      activeSheet.id,
      selectedCell.rowIndex,
      selectedCell.columnIndex,
      formulaDraft,
      formulaDraft.startsWith('=') ? formulaDraft : undefined,
    );
  };

  const updateSelectedCellFormat = (
    patch: NonNullable<OutcomeSpreadsheetCell['format']>,
  ) => {
    if (!activeSheet || !selectedCell || readOnly || selected?.readOnly) return;
    const nextWorkbook: OutcomeWorkbook = {
      sheets: workbook.sheets.map((sheet) => {
        if (sheet.id !== activeSheet.id) return sheet;
        const rows = sheet.rows.map((row) => [...row]);
        const row = rows[selectedCell.rowIndex] ? [...rows[selectedCell.rowIndex]] : [];
        const previous = normalizeCell(row[selectedCell.columnIndex] ?? null);
        row[selectedCell.columnIndex] = {
          ...previous,
          format: { ...previous.format, ...patch },
        };
        rows[selectedCell.rowIndex] = row;
        return { ...sheet, rows };
      }),
    };
    onChange(nextWorkbook);
  };

  const formatDisabled = readOnly || !selected || Boolean(selected.readOnly);

  if (workbook.sheets.length === 0) {
    return (
      <EmptyFileCanvas
        message="后端尚未返回工作表。工作簿到达后，底部会按真实 Sheet 列表生成标签。"
        title="工作表待返回"
      />
    );
  }

  return (
    <div className="outcome-spreadsheet" data-read-only={readOnly || undefined}>
      <div className="outcome-spreadsheet__ribbon" role="toolbar" aria-label="Excel 文件工具栏">
        <strong>开始</strong>
        <button
          aria-label="加粗单元格"
          aria-pressed={Boolean(selected?.format?.bold)}
          className="outcome-office-format-action"
          disabled={formatDisabled}
          onClick={() => updateSelectedCellFormat({ bold: !selected?.format?.bold })}
          title={readOnly ? '只读预览不可编辑' : selected ? '切换当前单元格加粗' : '请先选择单元格'}
          type="button"
        ><Bold aria-hidden="true" size={14} />加粗</button>
        <span className="outcome-spreadsheet__format-group" aria-label="单元格对齐方式" role="group">
          <button
            aria-label="左对齐"
            aria-pressed={(selected?.format?.horizontalAlignment ?? 'left') === 'left'}
            disabled={formatDisabled}
            onClick={() => updateSelectedCellFormat({ horizontalAlignment: 'left' })}
            type="button"
          ><AlignLeft aria-hidden="true" size={14} /></button>
          <button
            aria-label="居中对齐"
            aria-pressed={selected?.format?.horizontalAlignment === 'center'}
            disabled={formatDisabled}
            onClick={() => updateSelectedCellFormat({ horizontalAlignment: 'center' })}
            type="button"
          ><AlignCenter aria-hidden="true" size={14} /></button>
          <button
            aria-label="右对齐"
            aria-pressed={selected?.format?.horizontalAlignment === 'right'}
            disabled={formatDisabled}
            onClick={() => updateSelectedCellFormat({ horizontalAlignment: 'right' })}
            type="button"
          ><AlignRight aria-hidden="true" size={14} /></button>
        </span>
        <select
          aria-label="数字格式"
          disabled={formatDisabled}
          onChange={(event) => updateSelectedCellFormat({
            numberFormat: event.target.value as NonNullable<OutcomeSpreadsheetCell['format']>['numberFormat'],
          })}
          title={readOnly ? '只读预览不可编辑' : selected ? '设置当前单元格数字格式' : '请先选择单元格'}
          value={selected?.format?.numberFormat ?? 'general'}
        >
          <option value="general">常规</option>
          <option value="number">数值</option>
          <option value="currency">人民币</option>
          <option value="percent">百分比</option>
        </select>
        <span className="outcome-spreadsheet__ribbon-spacer" />
        <button aria-label="缩小表格" disabled={zoom <= 70} onClick={() => setZoom((value) => Math.max(70, value - 10))} type="button">
          <ZoomOut aria-hidden="true" size={15} />
        </button>
        <output aria-label="表格缩放比例">{zoom}%</output>
        <button aria-label="放大表格" disabled={zoom >= 140} onClick={() => setZoom((value) => Math.min(140, value + 10))} type="button">
          <ZoomIn aria-hidden="true" size={15} />
        </button>
      </div>
      <div
        className="outcome-spreadsheet__formula-row"
        data-has-context-action={Boolean(selected && onSendContextToAgent) || undefined}
      >
        <input aria-label="名称框" readOnly value={selectedAddress} placeholder="单元格" />
        <span aria-hidden="true">fx</span>
        <input
          aria-label="公式栏"
          disabled={!selected}
          onBlur={commitFormula}
          onChange={(event) => setFormulaDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commitFormula();
            event.currentTarget.blur();
          }}
          readOnly={readOnly || selected?.readOnly}
          value={formulaDraft}
        />
        {selected && onSendContextToAgent ? (
          <button
            className="outcome-spreadsheet__context-action"
            onClick={attachSelectedCellToConversation}
            type="button"
          >
            <MessageSquareQuote aria-hidden="true" size={14} />引用单元格
          </button>
        ) : null}
      </div>
      <main className="outcome-spreadsheet__viewport" aria-label={`${activeSheet?.name ?? ''}工作表视图`}>
        {activeSheet && columnCount > 0 && normalizedRows.length > 0 ? (
          <div className="outcome-spreadsheet__zoom" style={{ '--sheet-zoom': zoom / 100 } as React.CSSProperties}>
            <table aria-label={`${activeSheet.name}工作表`} role="grid">
              <thead>
                <tr>
                  <th aria-label="行号" className="outcome-spreadsheet__corner" />
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <th key={columnIndex} scope="col">{columnLabel(columnIndex)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {normalizedRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <th scope="row">{rowIndex + 1}</th>
                    {Array.from({ length: columnCount }, (_, columnIndex) => {
                      const cell = row[columnIndex] ?? normalizeCell(null);
                      const address = cellAddress(rowIndex, columnIndex);
                      const isSelected = selectedAddress === address;
                      return (
                        <td
                          aria-label={`${activeSheet.name} ${address}`}
                          aria-readonly={readOnly || cell.readOnly || undefined}
                          aria-selected={isSelected}
                          contentEditable={!readOnly && !cell.readOnly}
                          data-address={address}
                          data-cell-align={cell.format?.horizontalAlignment ?? 'left'}
                          data-cell-bold={cell.format?.bold || undefined}
                          data-number-format={cell.format?.numberFormat ?? 'general'}
                          key={columnIndex}
                          onClick={() => selectCell(activeSheet, rowIndex, columnIndex)}
                          onFocus={() => selectCell(activeSheet, rowIndex, columnIndex)}
                          onInput={(event) => {
                            if (readOnly || cell.readOnly) return;
                            updateCell(activeSheet.id, rowIndex, columnIndex, event.currentTarget.textContent ?? '');
                          }}
                          role="gridcell"
                          suppressContentEditableWarning
                          tabIndex={0}
                          title={cell.formula || undefined}
                        >
                          {formattedCellValue(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="outcome-spreadsheet__empty-sheet">
            <FileSpreadsheet aria-hidden="true" />
            <strong>{activeSheet?.name}</strong>
            <span>该工作表暂无单元格数据</span>
          </div>
        )}
      </main>
      <footer className="outcome-spreadsheet__footer">
        <div className="outcome-spreadsheet__sheet-nav" aria-label="工作表导航">
          <button
            aria-label="上一个工作表"
            disabled={activeSheetIndex <= 0}
            onClick={() => {
              const previous = workbook.sheets[activeSheetIndex - 1];
              if (previous) selectSheet(previous);
            }}
            type="button"
          ><ChevronLeft aria-hidden="true" size={15} /></button>
          <button
            aria-label="下一个工作表"
            disabled={activeSheetIndex < 0 || activeSheetIndex >= workbook.sheets.length - 1}
            onClick={() => {
              const next = workbook.sheets[activeSheetIndex + 1];
              if (next) selectSheet(next);
            }}
            type="button"
          ><ChevronRight aria-hidden="true" size={15} /></button>
        </div>
        <div className="outcome-spreadsheet__tabs" role="tablist" aria-label="工作表">
          {workbook.sheets.map((sheet) => (
            <button
              aria-selected={sheet.id === activeSheet?.id}
              key={sheet.id}
              onClick={() => selectSheet(sheet)}
              role="tab"
              type="button"
            >
              {sheet.name}
            </button>
          ))}
        </div>
        <div className="outcome-spreadsheet__footer-meta">
          <span>{normalizedRows.length} 行 · {columnCount} 列</span>
          <span>{zoom}%</span>
        </div>
      </footer>
    </div>
  );
}

function ReadOnlyFileCanvas({
  emptyMessage,
  file,
  title,
}: {
  emptyMessage: string;
  file: OutcomeWorkspaceFile;
  title: string;
}) {
  const previewUrl = safePreviewUrl(file.previewUrl);
  if (file.kind === 'html' && file.previewUnavailableReason) {
    return <EmptyFileCanvas message={file.previewUnavailableReason} title="HTML 文件未包含可预览正文" />;
  }
  if (!previewUrl && !(file.kind === 'html' && file.htmlSource)) {
    return <EmptyFileCanvas message={emptyMessage} title={`${title}待加载`} />;
  }

  return (
    <div className={`outcome-readonly-preview outcome-readonly-preview--${file.kind}`}>
      <div className="outcome-readonly-preview__toolbar">
        <strong>{title}</strong>
        <span><Lock aria-hidden="true" size={13} />只读预览</span>
      </div>
      {file.mimeType?.startsWith('image/') && previewUrl ? (
        <div className="outcome-readonly-preview__image-canvas">
          <img alt={file.name} src={previewUrl} />
        </div>
      ) : file.kind === 'html' && file.htmlSource ? (
        <iframe
          referrerPolicy="no-referrer"
          sandbox=""
          srcDoc={file.htmlSource}
          title={`${file.name} HTML 内容`}
        />
      ) : (
        <iframe
          referrerPolicy="no-referrer"
          sandbox={file.kind === 'html' ? '' : undefined}
          src={previewUrl}
          title={`${file.name} ${title}`}
        />
      )}
      <footer className="outcome-office-statusbar">
        <span>{file.name}</span>
        <span>只读预览</span>
      </footer>
    </div>
  );
}

function EmptyFileCanvas({ message, title }: { message: string; title: string }) {
  return (
    <div className="outcome-file-empty" role="status">
      <span aria-hidden="true"><File /></span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

function buildWordOutline(document: OutcomeWordDocument) {
  if (document.outline?.length) return document.outline;
  return document.pages.flatMap((page) => page.blocks
    .filter((block) => block.type === 'heading' && block.text.trim())
    .map((block) => ({
      blockId: block.id,
      id: `outline-${page.id}-${block.id}`,
      label: block.text,
      level: block.level ?? 1,
      pageId: page.id,
    } satisfies OutcomeWordOutlineItem)));
}

function outlineItemForWordBlock(
  page: OutcomeWordPage,
  blockId: string | undefined,
  outline: readonly OutcomeWordOutlineItem[],
) {
  if (!blockId) return undefined;
  const direct = outline.find((item) => item.pageId === page.id && item.blockId === blockId);
  if (direct) return direct;
  const selectedBlockIndex = page.blocks.findIndex((block) => block.id === blockId);
  if (selectedBlockIndex < 0) return undefined;
  return outline.reduce<OutcomeWordOutlineItem | undefined>((nearest, item) => {
    if (item.pageId !== page.id || !item.blockId) return nearest;
    const headingIndex = page.blocks.findIndex((block) => block.id === item.blockId);
    if (headingIndex < 0 || headingIndex > selectedBlockIndex) return nearest;
    if (!nearest?.blockId) return item;
    const nearestIndex = page.blocks.findIndex((block) => block.id === nearest.blockId);
    return headingIndex >= nearestIndex ? item : nearest;
  }, undefined);
}

function createBaseContext(file: OutcomeWorkspaceFile): OutcomeFileAgentContext {
  return {
    categoryId: file.categoryId,
    categoryLabel: file.categoryLabel,
    fileId: file.id,
    fileKind: file.kind,
    fileName: file.name,
    label: file.name,
    version: file.version,
  };
}

function cloneWordDocument(document?: OutcomeWordDocument): OutcomeWordDocument {
  return {
    outline: document?.outline?.map((item) => ({ ...item })),
    pages: document?.pages.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => ({ ...block })),
    })) ?? [],
  };
}

function cloneWorkbook(workbook?: OutcomeWorkbook): OutcomeWorkbook {
  return {
    sheets: workbook?.sheets.map((sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row) => row.map((cell) => (
        isCellObject(cell) ? { ...cell, format: cell.format ? { ...cell.format } : undefined } : cell
      ))),
    })) ?? [],
  };
}

function currentDraft(
  kind: OutcomeFileKind,
  document: OutcomeWordDocument,
  workbook: OutcomeWorkbook,
): OutcomeFileDraft | null {
  if (kind === 'word') return { kind: 'word', document: cloneWordDocument(document) };
  if (kind === 'spreadsheet') return { kind: 'spreadsheet', workbook: cloneWorkbook(workbook) };
  return null;
}

function isCellObject(cell: OutcomeSpreadsheetCellInput): cell is OutcomeSpreadsheetCell {
  return typeof cell === 'object' && cell !== null && 'value' in cell;
}

function normalizeCell(cell: OutcomeSpreadsheetCellInput): OutcomeSpreadsheetCell {
  return isCellObject(cell) ? cell : { value: cell };
}

function stringCellValue(value: OutcomeSpreadsheetCellValue) {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function formattedCellValue(cell: OutcomeSpreadsheetCell) {
  const format = cell.format?.numberFormat ?? 'general';
  if (format === 'general' || typeof cell.value !== 'number') {
    return cell.displayValue ?? stringCellValue(cell.value);
  }
  if (format === 'currency') {
    return new Intl.NumberFormat('zh-CN', {
      currency: 'CNY',
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(cell.value);
  }
  if (format === 'percent') {
    return new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: 2,
      style: 'percent',
    }).format(cell.value);
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(cell.value);
}

function coerceCellValue(previous: OutcomeSpreadsheetCellValue, value: string): OutcomeSpreadsheetCellValue {
  if (typeof previous === 'number' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (typeof previous === 'boolean') {
    if (/^true$/i.test(value.trim())) return true;
    if (/^false$/i.test(value.trim())) return false;
  }
  return value;
}

function cellAddress(rowIndex: number, columnIndex: number) {
  return `${columnLabel(columnIndex)}${rowIndex + 1}`;
}

function spreadsheetCellContext(
  contextBase: OutcomeFileAgentContext,
  sheet: OutcomeSpreadsheetSheet,
  rowIndex: number,
  columnIndex: number,
): OutcomeFileAgentContext {
  const cell = normalizeCell(sheet.rows[rowIndex]?.[columnIndex] ?? null);
  const address = cellAddress(rowIndex, columnIndex);
  return {
    ...contextBase,
    label: `${contextBase.fileName} · ${sheet.name}!${address}`,
    location: `${sheet.name}!${address}`,
    range: address,
    selectedText: cell.displayValue ?? stringCellValue(cell.value),
    sheetId: sheet.id,
    sheetName: sheet.name,
  };
}

function columnLabel(columnIndex: number) {
  let value = columnIndex + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function browserDraftStorageKey(file: OutcomeWorkspaceFile) {
  return [
    'bidvolt:outcome-browser-draft',
    file.categoryId,
    file.id,
    file.version ?? 'latest',
    file.contentRevision ?? 'current',
  ].map(String).join(':');
}

function readStoredBrowserDraft(
  storageKey: string,
  file: OutcomeWorkspaceFile,
): StoredBrowserDraft | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return null;
    const stored = JSON.parse(value) as Partial<StoredBrowserDraft>;
    if (stored.fileId !== file.id || !stored.draft) return null;
    if (file.kind === 'word' && stored.draft.kind === 'word') return stored as StoredBrowserDraft;
    if (file.kind === 'spreadsheet' && stored.draft.kind === 'spreadsheet') {
      return stored as StoredBrowserDraft;
    }
    return null;
  } catch {
    return null;
  }
}

export function safePreviewUrl(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, window.location.origin);
    return ['http:', 'https:', 'blob:'].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
