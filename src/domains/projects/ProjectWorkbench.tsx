import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileChartColumn,
  FileSpreadsheet,
  FileText,
  Folder,
  LoaderCircle,
  Paperclip,
  Send,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { buildEnterpriseAssetFolders } from '../../features/enterprise-assets/category-folders';
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

export type EnterpriseUploadFeedback = {
  message?: string;
  status: 'idle' | 'uploading' | 'processing' | 'accepted' | 'completed' | 'error';
};

export type EnterpriseUploadResult = {
  assetIds?: string[];
  expectedNewAssetCount?: number;
  message?: string;
  status?: 'processing' | 'accepted' | 'completed';
};

export type EnterpriseUploadHandler = (
  files: File[],
) => EnterpriseUploadResult | void | Promise<EnterpriseUploadResult | void>;

export type EnterpriseMaterialsRefreshHandler = () => void | Promise<void>;

const ENTERPRISE_MATERIALS_REFRESH_INTERVAL_MS = 2_000;
const ENTERPRISE_UPLOAD_PROCESSING_NOTICE_MS = 60_000;

type ProjectSourceRailProps = {
  enterpriseCategories?: readonly EnterpriseAssetCategoryFolder[];
  enterpriseMaterials: WorkspaceMaterial[];
  enterpriseUploadFeedback?: EnterpriseUploadFeedback;
  onAddEnterpriseFiles?: EnterpriseUploadHandler;
  onEnterpriseUploadFeedbackChange?: (feedback: EnterpriseUploadFeedback) => void;
  onOpenEnterpriseUpload?: () => void;
  onRefreshEnterpriseMaterials?: EnterpriseMaterialsRefreshHandler;
};

export function ProjectSourceRail({
  enterpriseCategories = [],
  enterpriseMaterials,
  enterpriseUploadFeedback,
  onAddEnterpriseFiles,
  onEnterpriseUploadFeedbackChange,
  onOpenEnterpriseUpload,
  onRefreshEnterpriseMaterials,
}: ProjectSourceRailProps) {
  const folderContentId = useId();
  const uploadFeedbackId = useId();
  const enterpriseFileInputRef = useRef<HTMLInputElement>(null);
  const folders = buildEnterpriseAssetFolders(enterpriseCategories, enterpriseMaterials, {
    allLabel: '全部资料',
    separateSourceArchives: true,
  });
  const folderGroups = [
    {
      id: 'system',
      label: '系统视图',
      folders: folders.filter((folder) => folder.kind === 'all' || folder.kind === 'source'),
    },
    {
      id: 'business',
      label: '业务分类',
      folders: folders.filter((folder) => folder.kind !== 'all' && folder.kind !== 'source'),
    },
  ];
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const resolvedOpenFolderId = openFolderId === null
    ? null
    : folders.some((folder) => folder.id === openFolderId)
      ? openFolderId
      : null;
  const [localUploadFeedback, setLocalUploadFeedback] = useState<EnterpriseUploadFeedback>({
    status: 'idle',
  });
  const uploadFeedback = enterpriseUploadFeedback ?? localUploadFeedback;
  const uploadBaselineIdsRef = useRef<Set<string>>(
    new Set(enterpriseMaterials.map((material) => material.id)),
  );
  const expectedAssetIdsRef = useRef<Set<string>>(new Set());
  const expectedNewAssetCountRef = useRef(0);
  const refreshEnterpriseMaterialsRef = useRef(onRefreshEnterpriseMaterials);
  const refreshInFlightRef = useRef(false);
  refreshEnterpriseMaterialsRef.current = onRefreshEnterpriseMaterials;
  const publishUploadFeedback = useCallback((nextFeedback: EnterpriseUploadFeedback) => {
    if (enterpriseUploadFeedback === undefined) setLocalUploadFeedback(nextFeedback);
    onEnterpriseUploadFeedbackChange?.(nextFeedback);
  }, [enterpriseUploadFeedback, onEnterpriseUploadFeedbackChange]);

  useEffect(() => {
    if (enterpriseUploadFeedback !== undefined || uploadFeedback.status !== 'processing') return;
    const expectedAssetIds = expectedAssetIdsRef.current;
    const currentAssetIds = new Set(
      enterpriseMaterials.map((material) => material.id.replace(/^enterprise:/, '')),
    );
    const allExpectedAssetsAreVisible = expectedAssetIds.size > 0
      && [...expectedAssetIds].every((assetId) => currentAssetIds.has(assetId));
    const newAssetCount = enterpriseMaterials.reduce(
      (count, material) => count + (uploadBaselineIdsRef.current.has(material.id) ? 0 : 1),
      0,
    );
    const uploadAppearedInList = expectedAssetIds.size > 0
      ? allExpectedAssetsAreVisible
      : expectedNewAssetCountRef.current > 0
        && newAssetCount >= expectedNewAssetCountRef.current;
    if (!uploadAppearedInList) return;
    publishUploadFeedback({
      message: '企业资料列表已同步。识别与归类进度请以各文件的后端状态为准。',
      status: 'completed',
    });
  }, [enterpriseMaterials, enterpriseUploadFeedback, publishUploadFeedback, uploadFeedback.status]);

  useEffect(() => {
    const canRefresh = Boolean(refreshEnterpriseMaterialsRef.current);
    if (uploadFeedback.status !== 'processing' || !canRefresh) return undefined;
    let disposed = false;
    const refresh = async () => {
      if (refreshInFlightRef.current || disposed) return;
      const refreshEnterpriseMaterials = refreshEnterpriseMaterialsRef.current;
      if (!refreshEnterpriseMaterials) return;
      refreshInFlightRef.current = true;
      try {
        await refreshEnterpriseMaterials();
        if (!disposed) {
          publishUploadFeedback({
            message: '文件已受理，正在等待企业资料列表同步。',
            status: 'processing',
          });
        }
      } catch {
        if (!disposed) {
          publishUploadFeedback({
            message: '资料已受理，但列表刷新暂时失败，系统将继续重试。',
            status: 'processing',
          });
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    };
    const intervalId = window.setInterval(
      () => void refresh(),
      ENTERPRISE_MATERIALS_REFRESH_INTERVAL_MS,
    );
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [onRefreshEnterpriseMaterials !== undefined, publishUploadFeedback, uploadFeedback.status]);

  useEffect(() => {
    if (uploadFeedback.status !== 'processing') return undefined;
    const timeoutId = window.setTimeout(() => {
      publishUploadFeedback({
        message: '文件已由后端受理，资料列表仍在后台同步；您可以继续上传，稍后刷新查看结果。',
        status: 'accepted',
      });
    }, ENTERPRISE_UPLOAD_PROCESSING_NOTICE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [publishUploadFeedback, uploadFeedback.status]);

  const uploadEnterpriseFiles = async (files: File[]) => {
    if (!onAddEnterpriseFiles
      || uploadFeedback.status === 'uploading'
      || uploadFeedback.status === 'processing') return;
    uploadBaselineIdsRef.current = new Set(enterpriseMaterials.map((material) => material.id));
    expectedAssetIdsRef.current = new Set();
    expectedNewAssetCountRef.current = files.length;
    publishUploadFeedback({
      message: `正在上传 ${files.length} 个文件，请勿关闭页面。`,
      status: 'uploading',
    });
    try {
      const result = await onAddEnterpriseFiles(files);
      expectedAssetIdsRef.current = new Set(result?.assetIds ?? []);
      expectedNewAssetCountRef.current = result?.expectedNewAssetCount ?? files.length;
      publishUploadFeedback({
        message: result?.message ?? '文件已受理，后台正在解析并同步企业资料库。',
        status: result?.status ?? 'processing',
      });
    } catch (error) {
      publishUploadFeedback({
        message: error instanceof Error && error.message ? error.message : '文件上传失败，请重试',
        status: 'error',
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
        {folderGroups.map((group) => (
          <div
            className={`bv-source-rail__folder-group bv-source-rail__folder-group--${group.id}`}
            key={group.id}
          >
            <span className="bv-source-rail__folder-group-label">{group.label}</span>
            {group.folders.map((folder, index) => {
              const isExpanded = resolvedOpenFolderId === folder.id;
              const contentId = `${folderContentId}-${group.id}-folder-${index}`;
              const FolderIcon = folder.kind === 'source' ? FileArchive : Folder;
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
                    <FolderIcon aria-hidden="true" size={18} />
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
          </div>
        ))}
      </nav>

      {onAddEnterpriseFiles || onOpenEnterpriseUpload ? (
        <>
          <button
            aria-busy={uploadFeedback.status === 'uploading' || uploadFeedback.status === 'processing' || undefined}
            aria-describedby={uploadFeedback.status === 'idle' ? undefined : uploadFeedbackId}
            aria-haspopup={onOpenEnterpriseUpload ? 'dialog' : undefined}
            className="bv-source-rail__upload"
            disabled={uploadFeedback.status === 'uploading' || uploadFeedback.status === 'processing'}
            onClick={() => {
              if (onOpenEnterpriseUpload) {
                onOpenEnterpriseUpload();
                return;
              }
              enterpriseFileInputRef.current?.click();
            }}
            type="button"
          >
            <UploadCloud aria-hidden="true" size={21} />
            <span>
              {uploadFeedback.status === 'uploading'
                ? '正在上传企业资料…'
                : uploadFeedback.status === 'processing'
                  ? '企业资料后台处理中…'
                  : '上传企业资料'}
            </span>
          </button>
          {onAddEnterpriseFiles ? (
            <input
              ref={enterpriseFileInputRef}
              aria-label="上传企业资料并同步资料库"
              className="bv-source-rail__file-input"
              disabled={uploadFeedback.status === 'uploading' || uploadFeedback.status === 'processing'}
              multiple
              type="file"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (files.length > 0) void uploadEnterpriseFiles(files);
              }}
            />
          ) : null}
        </>
      ) : (
        <ReadonlyUploadControl
          label="企业资料上传不可用"
          title="当前页面未提供企业资料上传能力"
        />
      )}
      {uploadFeedback.status !== 'idle' ? (
        <p
          className={`bv-source-rail__upload-feedback bv-source-rail__upload-feedback--${uploadFeedback.status}`}
          id={uploadFeedbackId}
          role={uploadFeedback.status === 'error' ? 'alert' : 'status'}
        >
          <UploadFeedbackIcon status={uploadFeedback.status} />
          <span>
            <strong>{uploadFeedbackTitle(uploadFeedback.status)}</strong>
            {uploadFeedback.message ? <small>{uploadFeedback.message}</small> : null}
          </span>
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
          <MaterialStatusIndicator material={material} />
        </li>
      ))}
    </ul>
  );
}

function MaterialStatusIndicator({ material }: { material: WorkspaceMaterial }) {
  const status = material.status ?? '状态未提供';
  const tone = material.tone ?? 'blue';
  const Icon = tone === 'green'
    ? CheckCircle2
    : tone === 'orange'
      ? AlertCircle
      : tone === 'red'
        ? XCircle
        : LoaderCircle;
  return (
    <span
      aria-label={`资料状态：${status}`}
      className={`bv-source-status-icon bv-source-status-icon--${tone}`}
      role="img"
      title={`资料状态：${status}`}
    >
      <Icon aria-hidden="true" size={15} />
    </span>
  );
}

function UploadFeedbackIcon({ status }: { status: EnterpriseUploadFeedback['status'] }) {
  if (status === 'accepted' || status === 'completed') {
    return <CheckCircle2 aria-hidden="true" size={16} />;
  }
  if (status === 'error') return <XCircle aria-hidden="true" size={16} />;
  return <LoaderCircle aria-hidden="true" size={16} />;
}

function uploadFeedbackTitle(status: EnterpriseUploadFeedback['status']) {
  if (status === 'uploading') return '正在上传';
  if (status === 'processing') return '后台处理中';
  if (status === 'accepted') return '后台已受理';
  if (status === 'completed') return '列表同步完成';
  if (status === 'error') return '上传失败';
  return '';
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
  enterpriseUploadFeedback?: EnterpriseUploadFeedback;
  footerHint?: string;
  heightMode?: 'content' | 'fill';
  /** Retained for page-level compatibility; project materials render in the center workspace. */
  materials?: WorkspaceMaterial[];
  onAddEnterpriseFiles?: EnterpriseUploadHandler;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantDraftChange?: (value: string) => void;
  onAssistantSend?: (value: string) => void | Promise<void>;
  onEnterpriseUploadFeedbackChange?: (feedback: EnterpriseUploadFeedback) => void;
  onOpenEnterpriseUpload?: () => void;
  onRefreshEnterpriseMaterials?: EnterpriseMaterialsRefreshHandler;
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
  enterpriseUploadFeedback,
  footerHint = '请输入您的问题，如“请分析招标文件的评分细则”',
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantAddFiles,
  onAssistantDraftChange,
  onAssistantSend,
  onEnterpriseUploadFeedbackChange,
  onOpenEnterpriseUpload,
  onRefreshEnterpriseMaterials,
  rightRail,
  workspaceNavigation,
}: ProjectWorkbenchProps) {
  return (
    <div className={`bv-project-workspace bv-project-workspace--${heightMode}`}>
      <ProjectSourceRail
        key={enterpriseLibraryKey}
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
        enterpriseUploadFeedback={enterpriseUploadFeedback}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onEnterpriseUploadFeedbackChange={onEnterpriseUploadFeedbackChange}
        onOpenEnterpriseUpload={onOpenEnterpriseUpload}
        onRefreshEnterpriseMaterials={onRefreshEnterpriseMaterials}
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
