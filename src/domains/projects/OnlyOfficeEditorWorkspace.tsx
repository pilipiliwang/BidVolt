import { CheckCircle2, Cloud, Info, LoaderCircle, MessageSquareQuote, Save, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { OutcomeFileAgentContext } from './OutcomeFileWorkspace';
import { OfficeSelectionBridge, type OfficeSelectionBridgeConfig } from './office-selection-bridge';
import { OnlyOfficeSaveControls, officeVersionLabel, type OfficeFileVersion } from './OnlyOfficeSaveControls';
import './onlyoffice-editor-workspace.css';
import { downloadFileUrl, FileDownloadButton } from '../../shared/ui/FileDownloadButton';

export type OnlyOfficeBridgeFile = {
  id: string;
  latestVersion?: number;
  versions?: OfficeFileVersion[];
  sourceKey?: string;
  name: string;
  relative: string;
  size: number;
};

type EditorSession = {
  documentServerUrl: string;
  editorConfig: Record<string, unknown>;
  sessionId: string;
  editablePreparation?: { protectionRemoved?: boolean; fontSubstitutions?: { from: string; to: string }[] };
  selectionBridge?: OfficeSelectionBridgeConfig;
};

type OnlyOfficeConnector = {
  disconnect?: () => void;
  executeMethod?: (
    method: string,
    params: unknown[] | null,
    callback: (result?: unknown) => void,
  ) => void;
};

type DocsEditor = {
  createConnector?: () => OnlyOfficeConnector;
  destroyEditor?: () => void;
};
type DocsApi = { DocEditor: new (elementId: string, config: Record<string, unknown>) => DocsEditor };

declare global {
  interface Window { DocsAPI?: DocsApi }
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8081';
const scriptPromises = new Map<string, Promise<void>>();

export function localOnlyOfficeBridgeUrl() {
  if (typeof window === 'undefined') return null;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return null;
  return (import.meta.env.VITE_ONLYOFFICE_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/$/, '');
}

export async function listOnlyOfficeBridgeFiles(signal?: AbortSignal) {
  const bridgeUrl = localOnlyOfficeBridgeUrl();
  if (!bridgeUrl) return [];
  const response = await fetch(`${bridgeUrl}/api/files`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('本地 Office 文件清单不可用。');
  const payload = await response.json() as { items?: OnlyOfficeBridgeFile[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function importOnlyOfficeBridgeFile(
  sourceKey: string,
  name: string,
  blob: Blob,
  signal?: AbortSignal,
) {
  const bridgeUrl = localOnlyOfficeBridgeUrl();
  if (!bridgeUrl) throw new Error('本地 Office 编辑器仅在本机联调环境启用。');
  const query = new URLSearchParams({ name, sourceKey });
  const response = await fetch(`${bridgeUrl}/api/imported-files?${query}`, {
    body: blob,
    cache: 'no-store',
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    method: 'POST',
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || '原始 Office 文件无法载入本地编辑器。');
  }
  return response.json() as Promise<OnlyOfficeBridgeFile>;
}

export function OnlyOfficeEditorWorkspace({
  bridgeFile,
  displayName,
  mode = 'edit',
  selectedVersion,
  onClose,
  onContextChange,
  onDirtyChange,
  onSendContextToAgent,
  onSaved,
  contextBase,
  toolbarContainer,
  user = { id: 'local-tester', name: 'BidVolt 测试用户' },
}: {
  bridgeFile: OnlyOfficeBridgeFile;
  contextBase?: OutcomeFileAgentContext;
  displayName: string;
  mode?: 'edit' | 'view';
  selectedVersion?: number;
  onClose: () => void;
  onContextChange?: (context: OutcomeFileAgentContext) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSendContextToAgent?: (context: OutcomeFileAgentContext) => void;
  onSaved?: (version: number) => void;
  toolbarContainer?: HTMLElement | null;
  user?: { id: string; name: string };
}) {
  const isTabbed = toolbarContainer !== undefined;
  const reactId = useId();
  const elementId = `onlyoffice-${reactId.replace(/[^a-z0-9_-]/gi, '')}`;
  const editorRef = useRef<DocsEditor | null>(null);
  const connectorRef = useRef<OnlyOfficeConnector | null>(null);
  const selectionBridgeRef = useRef<OfficeSelectionBridge | null>(null);
  const quoteGenerationRef = useRef(0);
  const quoteRequestRef = useRef<symbol | null>(null);
  const quoteCleanupRef = useRef<(() => void) | null>(null);
  const contextRef = useRef(contextBase);
  contextRef.current = contextBase;
  const lastSavedVersionRef = useRef<number | null>(null);
  const hasChangesRef = useRef(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onSavedRef = useRef(onSaved);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<'connecting' | 'ready' | 'dirty' | 'saved' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [preparationNote, setPreparationNote] = useState('');

  useEffect(() => { onDirtyChangeRef.current = onDirtyChange; }, [onDirtyChange]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const closeEditor = () => {
    if (mode === 'edit' && state === 'dirty'
      && !window.confirm('当前文档有未正式保存的修改，请先选择创建新版本或覆盖。仍要关闭吗？')) return;
    onClose();
  };

  const quoteIntoConversation = async () => {
    if (!contextBase || quoteRequestRef.current) return;
    const generation = quoteGenerationRef.current;
    const request = Symbol('office-selection');
    quoteRequestRef.current = request;
    const current = () => generation === quoteGenerationRef.current
      && quoteRequestRef.current === request
      && contextRef.current?.fileId === contextBase.fileId
      && contextRef.current?.version === contextBase.version;
    setQuoting(true);
    setQuoteError('');
    try {
      let selectedText: string;
      const bridge = selectionBridgeRef.current;
      const connector = connectorRef.current;
      if (bridge) {
        selectedText = await bridge.requestSelection();
      } else if (connector?.executeMethod) {
        selectedText = await new Promise<string>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('选区读取超时，请重新选择文字后重试。')), 5_000);
          quoteCleanupRef.current = () => {
            window.clearTimeout(timeout);
            reject(new DOMException('引用已取消', 'AbortError'));
          };
          try {
            connector.executeMethod?.('GetSelectedText', [OFFICE_SELECTED_TEXT_OPTIONS], (value) => {
              window.clearTimeout(timeout);
              resolve(typeof value === 'string' ? value : '');
            });
          } catch (caughtError) {
            window.clearTimeout(timeout);
            reject(caughtError);
          }
        });
      } else {
        throw new Error('选区组件尚未加载，请重新打开文档后重试。');
      }
      if (!current()) return;
      const normalizedSelection = normalizeOfficeSelection(selectedText);
      if (!normalizedSelection) {
        setQuoteError('请先在文档中选中文字，再点击引用到对话框。');
        return;
      }
      const context: OutcomeFileAgentContext = {
        ...contextBase,
        label: `${contextBase.fileName} · 当前选区`,
        location: 'Office 当前选区',
        selectedText: normalizedSelection,
      };
      onContextChange?.(context);
      onSendContextToAgent?.(context);
    } catch (caughtError) {
      if (current()) setQuoteError(caughtError instanceof Error ? caughtError.message : '无法读取当前选区，请重试。');
    } finally {
      if (current()) {
        quoteRequestRef.current = null;
        quoteCleanupRef.current = null;
        setQuoting(false);
      }
    }
  };

  useEffect(() => {
    const bridgeUrl = localOnlyOfficeBridgeUrl();
    const controller = new AbortController();
    const channel = crypto.randomUUID();
    quoteGenerationRef.current += 1;
    let disposed = false;
    if (!bridgeUrl) {
      setState('error');
      setError('本地 Office 编辑器仅在本机联调环境启用。');
      return () => controller.abort();
    }
    setState('connecting');
    setSessionId(null);
    lastSavedVersionRef.current = null;
    hasChangesRef.current = false;
    setError('');
    setQuoting(false);
    setQuoteError('');
    setPreparationNote('');
    void fetch(`${bridgeUrl}/api/editor-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileId: bridgeFile.id, mode, user, version: selectedVersion, displayName,
        selectionBridge: { channel, hostOrigin: window.location.origin },
      }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || '创建 Office 编辑会话失败。');
      }
      return response.json() as Promise<EditorSession>;
    }).then(async (session) => {
      await loadDocsApi(session.documentServerUrl);
      if (disposed || !window.DocsAPI) return;
      setSessionId(session.sessionId);
      const notes = [];
      if (session.editablePreparation?.protectionRemoved) notes.push('已在编辑工作副本中解除原文的批注限制，原始上传文件保留。');
      if (session.editablePreparation?.fontSubstitutions?.length) notes.push(`当前使用替代字体（保存时写入所选版本）：${session.editablePreparation.fontSubstitutions.map(({ from, to }) => `${from} → ${to}`).join('；')}。替代字体并非原字体，分页可能变化。`);
      setPreparationNote(notes.join('\n'));
      if (session.selectionBridge?.channel === channel) {
        selectionBridgeRef.current = new OfficeSelectionBridge(session.selectionBridge);
      }
      const events = {
        onDocumentReady: () => {
          if (disposed) return;
          setState('ready');
          const editor = editorRef.current;
          if (selectionBridgeRef.current || !editor?.createConnector) return;
          try {
            const connector = editor.createConnector();
            if (!connector?.executeMethod) {
              connector?.disconnect?.();
              return;
            }
            connectorRef.current = connector;
          } catch {
            // Automation API is a Developer-edition feature. A Community
            // DocumentServer legitimately reaches this branch.
          }
        },
        onDocumentStateChange: (event: { data?: boolean }) => {
          if (disposed) return;
          const dirty = Boolean(event.data);
          // The editor's autosave acknowledgement is only a draft, not the
          // user's explicit publish/overwrite decision.
          if (dirty) hasChangesRef.current = true;
          setState(hasChangesRef.current ? 'dirty' : 'ready');
          onDirtyChangeRef.current?.(hasChangesRef.current);
        },
        onError: () => { setState('error'); setError('Office 编辑器运行异常。'); },
      };
      editorRef.current = new window.DocsAPI.DocEditor(elementId, {
        ...session.editorConfig,
        height: '100%',
        width: '100%',
        events,
      });
    }).catch((caughtError) => {
      if (controller.signal.aborted) return;
      setState('error');
      setError(caughtError instanceof Error ? caughtError.message : '本地 Office 编辑器不可用。');
    });
    return () => {
      disposed = true;
      quoteGenerationRef.current += 1;
      quoteRequestRef.current = null;
      quoteCleanupRef.current?.();
      quoteCleanupRef.current = null;
      selectionBridgeRef.current?.dispose();
      selectionBridgeRef.current = null;
      controller.abort();
      connectorRef.current?.disconnect?.();
      connectorRef.current = null;
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
    };
  }, [bridgeFile.id, displayName, selectedVersion, elementId, mode, user.id, user.name]);

  const toolbarActions = (
    <>
      <p className="onlyoffice-workspace__status" role="status">
        {state === 'connecting' ? <><LoaderCircle aria-hidden="true" size={14} />正在连接…</>
          : state === 'dirty' ? <><Save aria-hidden="true" size={14} />有修改，待保存</>
            : state === 'saved' ? <><CheckCircle2 aria-hidden="true" size={14} />已保存 · {officeVersionLabel(lastSavedVersionRef.current ?? 0)}</>
              : state === 'ready' ? '已连接' : '连接失败'}
      </p>
      {preparationNote ? <span className="onlyoffice-workspace__preparation" tabIndex={0} aria-label={preparationNote} title={preparationNote}><Info size={15} aria-hidden="true" /></span> : null}
      {mode === 'edit' && localOnlyOfficeBridgeUrl() ? <OnlyOfficeSaveControls
        bridgeUrl={localOnlyOfficeBridgeUrl()!} sessionId={sessionId} fileId={bridgeFile.id}
        displayName={displayName} disabled={state === 'connecting' || state === 'error'}
        onDraftAvailable={() => {
          hasChangesRef.current = true;
          setState('dirty');
          onDirtyChangeRef.current?.(true);
        }}
        onSaved={(version) => {
          hasChangesRef.current = false;
          lastSavedVersionRef.current = version;
          setState('saved');
          onDirtyChangeRef.current?.(false);
          onSavedRef.current?.(version);
        }}
      /> : null}
      {contextBase ? (
        <button
          aria-label="引用到对话框"
          className="onlyoffice-workspace__quote"
          disabled={quoting || state === 'connecting' || state === 'error'}
          onClick={() => void quoteIntoConversation()}
          onPointerDown={(event) => event.preventDefault()}
          title="读取 Office 当前选区并引用到对话框"
          type="button"
        >
          {quoting ? <LoaderCircle aria-hidden="true" size={15} /> : <MessageSquareQuote aria-hidden="true" size={15} />}
          {quoting ? '正在读取选区…' : '引用到对话框'}
        </button>
      ) : null}
      {localOnlyOfficeBridgeUrl() ? <FileDownloadButton
        key={`${bridgeFile.id}:${selectedVersion ?? 'latest'}`}
        className="onlyoffice-workspace__download"
        disabled={state === 'connecting' || state === 'error' || state === 'dirty'}
        title={state === 'dirty' ? '请先保存修改，再下载所选版本' : '下载当前文件的所选已保存版本'}
        onDownload={() => downloadFileUrl(
          `/__office-download/${encodeURIComponent(bridgeFile.id)}/versions/${lastSavedVersionRef.current ?? selectedVersion ?? bridgeFile.latestVersion ?? 0}`,
          displayName,
        )}
      /> : null}
    </>
  );

  return (
    <section className={`onlyoffice-workspace${isTabbed ? ' onlyoffice-workspace--tabbed' : ''}`} aria-label={`${displayName} Office 编辑器`}>
      {isTabbed ? (toolbarContainer ? createPortal(
        <div className="onlyoffice-workspace__toolbar">{toolbarActions}</div>,
        toolbarContainer,
      ) : null) : <header>
        <span><Cloud aria-hidden="true" size={18} /></span>
        <div>
          <strong>{displayName}</strong>
          <small>{bridgeFile.name} · 真实 Office {mode === 'view' ? '预览' : '编辑'}</small>
        </div>
        {toolbarActions}
        <button aria-label="关闭文件预览" onClick={closeEditor} type="button"><X aria-hidden="true" size={18} /></button>
      </header>}
      {error || quoteError ? <div className="onlyoffice-workspace__error" role="alert">{error || quoteError}</div> : null}
      <div className="onlyoffice-workspace__editor">
        <div id={elementId} />
      </div>
    </section>
  );
}

const OFFICE_SELECTED_TEXT_OPTIONS = {
  Math: true,
  NewLineSeparator: '\n',
  Numbering: true,
  ParaSeparator: '\n',
  TableCellSeparator: '\t',
  TableRowSeparator: '\n',
  TabSymbol: '\t',
};

function normalizeOfficeSelection(value?: string) {
  return value?.replace(/\r\n?/g, '\n').trim() || undefined;
}

function loadDocsApi(documentServerUrl: string) {
  if (window.DocsAPI) return Promise.resolve();
  const src = `${documentServerUrl.replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`;
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('无法加载 ONLYOFFICE 编辑器。'));
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}
