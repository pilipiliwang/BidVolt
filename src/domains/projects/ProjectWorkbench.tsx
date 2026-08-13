import {
  CheckCircle2,
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

import './project-workbench.css';

export type WorkspaceMaterial = {
  id: string;
  name: string;
  status?: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
};

type ProjectSourceRailProps = {
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
  onAddFiles?: (files: File[]) => void | Promise<void>;
};

type UploadScope = 'enterprise' | 'project';

type UploadState = {
  error: string | null;
  pending: boolean;
  scope: UploadScope;
};

export function ProjectSourceRail({
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
}: ProjectSourceRailProps) {
  const [activeSource, setActiveSource] = useState<'enterprise' | 'project'>('project');
  const panelId = useId();
  const enterpriseTabId = `${panelId}-enterprise-tab`;
  const projectTabId = `${panelId}-project-tab`;
  const [uploadState, setUploadState] = useState<UploadState>({
    error: null,
    pending: false,
    scope: 'project',
  });
  const showingEnterprise = activeSource === 'enterprise';
  const activeScope: UploadScope = showingEnterprise ? 'enterprise' : 'project';
  const activeUploadState = uploadState.scope === activeScope ? uploadState : undefined;
  const visibleMaterials = showingEnterprise ? enterpriseMaterials : materials;
  const heading = showingEnterprise ? '企业资料' : '当前招标材料';

  const uploadFiles = async (
    scope: UploadScope,
    files: File[],
    handler: (selectedFiles: File[]) => void | Promise<void>,
  ) => {
    setUploadState({ error: null, pending: true, scope });
    try {
      await handler(files);
      setUploadState({ error: null, pending: false, scope });
    } catch (error) {
      setUploadState({
        error: error instanceof Error && error.message ? error.message : '文件上传失败，请重试',
        pending: false,
        scope,
      });
    }
  };

  return (
    <aside className="bv-source-rail" aria-label="项目资料">
      <div className="bv-source-rail__tabs" role="tablist" aria-label="资料范围">
        <button
          aria-controls={panelId}
          aria-selected={showingEnterprise}
          id={enterpriseTabId}
          onClick={() => setActiveSource('enterprise')}
          role="tab"
          type="button"
        >
          企业资料
        </button>
        <button
          aria-controls={panelId}
          aria-selected={!showingEnterprise}
          id={projectTabId}
          onClick={() => setActiveSource('project')}
          role="tab"
          type="button"
        >
          当前招标材料
        </button>
      </div>

      <div
        aria-labelledby={showingEnterprise ? enterpriseTabId : projectTabId}
        id={panelId}
        role="tabpanel"
      >
        <div className="bv-source-rail__heading">
          <span>
            <Folder aria-hidden="true" size={17} />
            {heading}（{visibleMaterials.length}项）
          </span>
          <span aria-hidden="true">⌄</span>
        </div>

        {visibleMaterials.length > 0 ? (
          <ul className="bv-source-rail__files">
            {visibleMaterials.map((material) => (
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
        ) : (
          <p className="bv-source-rail__empty" role="status">
            {showingEnterprise ? '企业资料库暂无可展示资料' : '当前项目尚未上传招标材料'}
          </p>
        )}

        {showingEnterprise && onAddEnterpriseFiles ? (
          <label
            aria-busy={activeUploadState?.pending || undefined}
            className="bv-source-rail__upload"
          >
            <UploadCloud aria-hidden="true" size={21} />
            <span>{activeUploadState?.pending ? '正在上传企业资料…' : '上传企业资料'}</span>
            <input
              aria-label="上传企业资料并同步资料库"
              disabled={activeUploadState?.pending}
              multiple
              type="file"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (files.length > 0) {
                  void uploadFiles('enterprise', files, onAddEnterpriseFiles);
                }
              }}
            />
          </label>
        ) : showingEnterprise ? (
          <ReadonlyUploadControl
            label="企业资料上传不可用"
            title="当前页面未提供企业资料上传能力"
          />
        ) : onAddFiles ? (
          <label
            aria-busy={activeUploadState?.pending || undefined}
            className="bv-source-rail__upload"
          >
            <UploadCloud aria-hidden="true" size={21} />
            <span>{activeUploadState?.pending ? '正在上传资料…' : '上传资料'}</span>
            <input
              aria-label="补充上传当前项目资料"
              disabled={activeUploadState?.pending}
              multiple
              type="file"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (files.length > 0) void uploadFiles('project', files, onAddFiles);
              }}
            />
          </label>
        ) : (
          <ReadonlyUploadControl
            label="添加项目文件不可用"
            title="当前页面未提供项目文件上传能力"
          />
        )}
        {activeUploadState?.error ? (
          <p className="bv-source-rail__upload-error" role="alert">
            {activeUploadState.error}
          </p>
        ) : null}
      </div>
    </aside>
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
  enterpriseMaterials: WorkspaceMaterial[];
  footerHint?: string;
  heightMode?: 'content' | 'fill';
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantDraftChange?: (value: string) => void;
  onAssistantSend?: (value: string) => void | Promise<void>;
  rightRail: ReactNode;
};

export function ProjectWorkbench({
  assistantDraft,
  assistantFocusRequest,
  heightMode = 'fill',
  children,
  enterpriseMaterials,
  footerHint = '请输入您的问题，如“请分析招标文件的评分细则”',
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantDraftChange,
  onAssistantSend,
  rightRail,
}: ProjectWorkbenchProps) {
  return (
    <div className={`bv-project-workspace bv-project-workspace--${heightMode}`}>
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={materials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
      />
      <main className="bv-project-workspace__main">{children}</main>
      <aside className="bv-project-workspace__right">{rightRail}</aside>
      <ProjectChatBar
        focusRequest={assistantFocusRequest}
        hint={footerHint}
        onAddFiles={onAddFiles}
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
      <span>AI电网投标助手</span>
      <i />
    </div>
  );
}
