import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileChartColumn,
  FileSpreadsheet,
  FileText,
  Folder,
  Paperclip,
  Send,
  UploadCloud,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import {
  ALL_ENTERPRISE_ASSETS_FOLDER_ID,
  buildEnterpriseAssetFolders,
} from '../../features/enterprise-assets/category-folders';
import type { EnterpriseAssetCategoryFolder } from '../../features/enterprise-assets/types';
import { PRODUCT_NAME } from '../../shared/product-brand';
import './project-workbench.css';

export type WorkspaceMaterial = {
  id: string;
  name: string;
  categoryId?: string | null;
  status?: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
};

type ProjectSourceRailProps = {
  enterpriseCategories?: readonly EnterpriseAssetCategoryFolder[];
  enterpriseMaterials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
};

export function ProjectSourceRail({
  enterpriseCategories = [],
  enterpriseMaterials,
  onAddEnterpriseFiles,
}: ProjectSourceRailProps) {
  const folderContentId = useId();
  const folders = buildEnterpriseAssetFolders(enterpriseCategories, enterpriseMaterials);
  const [openFolderId, setOpenFolderId] = useState<string | null>(
    ALL_ENTERPRISE_ASSETS_FOLDER_ID,
  );
  const resolvedOpenFolderId = openFolderId === null
    ? null
    : folders.some((folder) => folder.id === openFolderId)
      ? openFolderId
      : ALL_ENTERPRISE_ASSETS_FOLDER_ID;
  const [uploadState, setUploadState] = useState({ error: null as string | null, pending: false });

  const uploadEnterpriseFiles = async (files: File[]) => {
    if (!onAddEnterpriseFiles || uploadState.pending) return;
    setUploadState({ error: null, pending: true });
    try {
      await onAddEnterpriseFiles(files);
      setUploadState({ error: null, pending: false });
    } catch (error) {
      setUploadState({
        error: error instanceof Error && error.message ? error.message : '文件上传失败，请重试',
        pending: false,
      });
    }
  };

  return (
    <aside className="bv-source-rail" aria-label="企业资料">
      <header className="bv-source-rail__header">
        <span>
          <Folder aria-hidden="true" size={22} />
          <h2>
            企业资料
            <small>（{enterpriseMaterials.length}项）</small>
          </h2>
        </span>
        <ChevronDown aria-hidden="true" size={20} />
      </header>

      <nav aria-label="企业资料分类文件夹" className="bv-source-rail__folders">
        {folders.map((folder, index) => {
          const isExpanded = resolvedOpenFolderId === folder.id;
          const contentId = `${folderContentId}-folder-${index}`;
          return (
            <div className="bv-source-folder" data-folder-kind={folder.kind} key={folder.id}>
              <button
                aria-label={`${folder.label}，${folder.items.length}项`}
                aria-controls={contentId}
                aria-expanded={isExpanded}
                className="bv-source-folder__toggle"
                onClick={() => setOpenFolderId(isExpanded ? null : folder.id)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="bv-source-folder__chevron" size={15} />
                <Folder aria-hidden="true" size={18} />
                <span>{folder.label}</span>
                <small aria-hidden="true">{folder.items.length}</small>
              </button>
              {isExpanded ? (
                folder.items.length > 0 ? (
                  <MaterialList id={contentId} label={`${folder.label}文件`} materials={folder.items} />
                ) : (
                  <p className="bv-source-rail__empty" id={contentId} role="status">
                    {folder.kind === 'all'
                      ? '企业资料库暂无可展示资料'
                      : '该文件夹暂无企业资料'}
                  </p>
                )
              ) : null}
            </div>
          );
        })}
      </nav>

      {onAddEnterpriseFiles ? (
        <label
          aria-busy={uploadState.pending || undefined}
          className="bv-source-rail__upload"
        >
          <UploadCloud aria-hidden="true" size={21} />
          <span>{uploadState.pending ? '正在上传企业资料…' : '上传企业资料'}</span>
          <input
            aria-label="上传企业资料并同步资料库"
            disabled={uploadState.pending}
            multiple
            type="file"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              if (files.length > 0) void uploadEnterpriseFiles(files);
            }}
          />
        </label>
      ) : (
        <ReadonlyUploadControl
          label="企业资料上传不可用"
          title="当前页面未提供企业资料上传能力"
        />
      )}
      {uploadState.error ? (
        <p className="bv-source-rail__upload-error" role="alert">
          {uploadState.error}
        </p>
      ) : null}
    </aside>
  );
}

function MaterialList({
  id,
  label,
  materials,
}: {
  id: string;
  label: string;
  materials: readonly WorkspaceMaterial[];
}) {
  return (
    <ul aria-label={label} className="bv-source-rail__files" id={id}>
      {materials.map((material) => (
        <li key={material.id}>
          <MaterialIcon tone={material.tone} />
          <span
            aria-label={material.name}
            className="bv-source-rail__filename"
            data-name={material.name}
            title={material.name}
          />
          <small>{material.status ?? '已识别'}</small>
          <CheckCircle2 aria-hidden="true" size={15} />
        </li>
      ))}
    </ul>
  );
}

function ReadonlyUploadControl({ label, title }: { label: string; title: string }) {
  return (
    <button
      className="bv-source-rail__upload bv-source-rail__upload--readonly"
      disabled
      title={title}
      type="button"
    >
      <UploadCloud aria-hidden="true" size={21} />
      <span>{label}</span>
    </button>
  );
}

function MaterialIcon({ tone = 'blue' }: { tone?: WorkspaceMaterial['tone'] }) {
  const Icon = tone === 'green' ? FileSpreadsheet : tone === 'orange' ? FileArchive : FileText;
  return (
    <span className={`bv-source-file-icon bv-source-file-icon--${tone}`} aria-hidden="true">
      <Icon size={14} />
    </span>
  );
}

type ProjectWorkbenchProps = {
  assistantDraft?: string;
  assistantFocusRequest?: number;
  children: ReactNode;
  enterpriseCategories?: readonly EnterpriseAssetCategoryFolder[];
  enterpriseLibraryKey?: string;
  enterpriseMaterials: WorkspaceMaterial[];
  footerHint?: string;
  heightMode?: 'content' | 'fill';
  /** Retained for page-level compatibility; project materials render in the center workspace. */
  materials?: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantDraftChange?: (value: string) => void;
  onAssistantSend?: (value: string) => void | Promise<void>;
  rightRail: ReactNode;
  workspaceNavigation?: ReactNode;
};

export function ProjectWorkbench({
  assistantDraft,
  assistantFocusRequest,
  heightMode = 'fill',
  children,
  enterpriseCategories = [],
  enterpriseLibraryKey,
  enterpriseMaterials,
  footerHint = '请输入您的问题，如“请分析招标文件的评分细则”',
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantAddFiles,
  onAssistantDraftChange,
  onAssistantSend,
  rightRail,
  workspaceNavigation,
}: ProjectWorkbenchProps) {
  return (
    <div className={`bv-project-workspace bv-project-workspace--${heightMode}`}>
      <ProjectSourceRail
        key={enterpriseLibraryKey}
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />
      <main className={`bv-project-workspace__main${workspaceNavigation ? ' bv-project-workspace__main--with-navigation' : ''}`}>
        {workspaceNavigation}
        {workspaceNavigation ? (
          <div className="bv-project-workspace__content">{children}</div>
        ) : children}
      </main>
      <aside className="bv-project-workspace__right">{rightRail}</aside>
      <ProjectChatBar
        focusRequest={assistantFocusRequest}
        hint={footerHint}
        onAddFiles={onAssistantAddFiles ?? onAddFiles}
        onSend={onAssistantSend}
        onValueChange={onAssistantDraftChange}
        value={assistantDraft}
      />
    </div>
  );
}

export function ProjectChatBar({
  focusRequest,
  hint,
  onAddFiles,
  onSend,
  onValueChange,
  value,
}: {
  focusRequest?: number;
  hint: string;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onSend?: (value: string) => void | Promise<void>;
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState('');
  const [attachmentState, setAttachmentState] = useState<{ error: string | null; pending: boolean }>({
    error: null,
    pending: false,
  });
  const [sendState, setSendState] = useState<{ error: string | null; pending: boolean }>({
    error: null,
    pending: false,
  });
  const currentValue = value ?? localValue;
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;

  useEffect(() => {
    if (!focusRequest) return;
    const input = assistantInputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.scrollIntoView?.({ block: 'nearest' });
  }, [focusRequest]);

  const updateValue = (nextValue: string) => {
    if (value === undefined) setLocalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const addFiles = async (files: File[]) => {
    if (!onAddFiles || attachmentState.pending) return;
    setAttachmentState({ error: null, pending: true });
    try {
      await onAddFiles(files);
      setAttachmentState({ error: null, pending: false });
    } catch (error) {
      setAttachmentState({
        error: error instanceof Error && error.message ? error.message : '文件添加失败，请重试',
        pending: false,
      });
    }
  };

  const sendMessage = async () => {
    const nextValue = currentValue.trim();
    if (!onSend || !nextValue || sendState.pending) return;
    setSendState({ error: null, pending: true });
    try {
      await onSend(nextValue);
      if (currentValueRef.current.trim() === nextValue) updateValue('');
      setSendState({ error: null, pending: false });
    } catch (error) {
      setSendState({
        error: error instanceof Error && error.message ? error.message : '项目助手请求失败，请重试',
        pending: false,
      });
    }
  };

  return (
    <div className="bv-project-chat" aria-label="项目助手输入">
      <button
        disabled={!onAddFiles || attachmentState.pending}
        onClick={() => fileInputRef.current?.click()}
        title={onAddFiles ? '添加当前项目文件' : '当前页面未提供项目文件上传能力'}
        type="button"
      >
        <Paperclip aria-hidden="true" size={21} />
        {attachmentState.pending ? '添加中…' : '添加文件'}
      </button>
      {onAddFiles ? (
        <input
          ref={fileInputRef}
          aria-label="添加当前项目文件"
          className="bv-project-chat__file-input"
          multiple
          type="file"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) void addFiles(files);
          }}
        />
      ) : null}
      <label>
        <span className="bv-visually-hidden">向项目助手提问</span>
        <textarea
          aria-label="向项目助手提问"
          placeholder={hint}
          ref={assistantInputRef}
          rows={2}
          value={currentValue}
          onChange={(event) => updateValue(event.currentTarget.value)}
        />
        {sendState.error || attachmentState.error ? (
          <span className="bv-project-chat__error" role="alert">
            {sendState.error ?? attachmentState.error}
          </span>
        ) : null}
      </label>
      <button
        className="bv-project-chat__send"
        disabled={!onSend || !currentValue.trim() || sendState.pending}
        title={onSend ? '发送给项目助手' : '项目助手接口尚未接入'}
        type="button"
        onClick={() => void sendMessage()}
      >
        {sendState.pending ? '发送中…' : '发送'}
        <Send aria-hidden="true" size={19} />
      </button>
    </div>
  );
}

export function ScoreRing({ label = '综合得分', score }: { label?: string; score: number }) {
  const normalized = Math.min(100, Math.max(0, score));
  return (
    <div
      className="bv-score-ring"
      style={{ '--score': `${normalized * 3.6}deg` } as CSSProperties}
      role="img"
      aria-label={`${label} ${score} 分`}
    >
      <div>
        <span>{label}</span>
        <strong>{score.toFixed(1)}</strong>
        <small>/100</small>
      </div>
    </div>
  );
}

export function ResultCover({
  title,
  tone,
}: {
  title: string;
  tone: 'business' | 'technical' | 'quote';
}) {
  return (
    <div className={`bv-result-cover bv-result-cover--${tone}`} aria-hidden="true">
      <FileChartColumn size={37} />
      <strong>{title}</strong>
      <span>{PRODUCT_NAME}</span>
      <i />
    </div>
  );
}
