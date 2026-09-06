import { FileText, UploadCloud, X } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';

import { documentUpdatedLifecycleMessage } from '../../app/bidvolt-lifecycle';
import type {
  EnterpriseAssetCategoryFolder,
  EnterpriseAssetPreview,
} from '../../features/enterprise-assets';
import {
  loadLocalPackageModel,
  useLocalPackage,
  type LocalPackageFile,
} from '../../features/project-materials/components/LocalPackagePreview';
import type { AgentRunViewModel } from '../../shared/task-events';
import { AgentActivityTimeline } from '../../shared/ui/AgentActivityTimeline';
import { FileDownloadButton } from '../../shared/ui/FileDownloadButton';
import {
  AgentWorkspaceComposer,
  type AgentWorkspaceAttachment,
  type AgentWorkspaceContextReference,
} from '../../shared/ui/AgentWorkspaceComposer';
import { useAgentMessageQueue } from '../../shared/ui/useAgentMessageQueue';
import type { ReviewFinding } from '../review/types';
import {
  OutcomeFileWorkspace,
  type OutcomeFileAgentContext,
  type OutcomeFileDraft,
  type OutcomeWorkspaceFile,
} from './OutcomeFileWorkspace';
import { ProjectCompletionDashboard } from './ProjectCompletionDashboard';
import {
  importOnlyOfficeBridgeFile,
  listOnlyOfficeBridgeFiles,
  OnlyOfficeEditorWorkspace,
  type OnlyOfficeBridgeFile,
} from './OnlyOfficeEditorWorkspace';
import { officeVersionLabel } from './OnlyOfficeSaveControls';
import type { ProjectOutcomeReviewViewModel } from './ProjectOutcomeReviewPanel';
import {
  ProjectResourceRail,
  PROJECT_RESULT_CATEGORIES,
  type ProjectResultFile,
  type ProjectResultGenerationState,
  type ProjectEnterpriseFile,
  type ProjectTenderMaterial,
} from './ProjectResourceRail';
import { ProjectResultWorkspace } from './ProjectResultWorkspace';
import {
  adaptOutcomeWorkspaceFile,
  adaptProjectEnterpriseCategories,
  adaptProjectEnterpriseFiles,
  adaptProjectResultFiles,
  adaptProjectTenderMaterials,
  extractOutcomeWorkbook,
  extractOutcomeWordDocument,
  type DeliverableContentAdapterInput,
} from './project-result-adapters';
import type {
  ProjectDeliverableView,
  ProjectOverviewVersionOption,
} from './ProjectOverviewPage';
import type {
  EnterpriseUploadHandler,
  WorkspaceMaterial,
} from './ProjectWorkbench';
import type { ProjectWorkflowTaskSummary } from './ProjectWorkflow';
import './project-generation-workspace.css';

type AgentAnswerResult = {
  queued?: boolean;
  reply?: string | null;
};

type AgentSendResult = {
  queued?: boolean;
  reply?: string | null;
  returncode?: number;
  message?: string;
  status?: string;
};

export type ProjectResultsChange = {
  reason: 'office-save' | 'version-select';
  fileId?: string;
  version?: number | string;
  localOnly?: boolean;
};

export type ProjectGenerationWorkspaceProps = {
  agentRun: AgentRunViewModel;
  /** Undefined permits legacy fallback; an empty array is an authoritative empty catalog. */
  artifactFiles?: readonly ProjectResultFile[];
  answeringAskId?: string | null;
  deliverables: readonly ProjectDeliverableView[];
  enterpriseCategories?: readonly EnterpriseAssetCategoryFolder[];
  enterpriseMaterials: readonly WorkspaceMaterial[];
  localOfficeEnabled?: boolean;
  findings?: readonly ReviewFinding[];
  materials: readonly WorkspaceMaterial[];
  onAddEnterpriseFiles?: EnterpriseUploadHandler;
  onAnswerInteraction?: (
    askId: string,
    answers: string[],
  ) => AgentAnswerResult | Promise<AgentAnswerResult | void> | void;
  onAssistantAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantSend?: (value: string, mode?: 'queue' | 'steer') => AgentSendResult | Promise<AgentSendResult | void> | void;
  onDownloadAllResults?: () => void | Promise<void>;
  onDownloadArtifact?: (file: ProjectResultFile) => void | Promise<void>;
  onDownloadDeliverable?: (deliverable: ProjectDeliverableView) => void | Promise<void>;
  onLoadDeliverableContent?: (
    deliverable: ProjectDeliverableView,
  ) => DeliverableContentAdapterInput | Promise<DeliverableContentAdapterInput | void> | void;
  onLoadResourcePreview?: (
    fileId: string,
    fileName: string,
  ) => EnterpriseAssetPreview | Promise<EnterpriseAssetPreview>;
  onOpenReview?: () => void;
  onRefreshProjectResults?: (change: ProjectResultsChange) => void | Promise<void>;
  outcomeReview: ProjectOutcomeReviewViewModel;
  /** True only after the caller has linked the catalog/version to this generation task. */
  resultsReady?: boolean;
  /** Time before an unanswered request is labelled uncertain (never automatically retried). */
  queueAcknowledgementTimeoutMs?: number;
  sendingAgentMessage?: boolean;
  task: ProjectWorkflowTaskSummary;
  versionOptions?: readonly ProjectOverviewVersionOption[];
};

type PreviewState =
  | { status: 'closed' }
  | { sourceFile: ProjectResultFile; status: 'loading' }
  | {
    /** A failed Office bridge import can still safely fall back to the original file. */
    downloadAvailable?: boolean;
    sourceFile: ProjectResultFile;
    message: string;
    status: 'error';
  }
  | {
    bridgeFile?: OnlyOfficeBridgeFile;
    sourceFile: ProjectResultFile;
    deliverable?: ProjectDeliverableView;
    file: OutcomeWorkspaceFile;
    status: 'ready';
  };

type OpenPreview = Exclude<PreviewState, { status: 'closed' }> & { key: string };

export function ProjectGenerationWorkspace({
  agentRun,
  artifactFiles,
  answeringAskId = null,
  deliverables,
  enterpriseCategories = [],
  enterpriseMaterials,
  localOfficeEnabled = true,
  findings = [],
  materials,
  onAddEnterpriseFiles,
  onAnswerInteraction,
  onAssistantAddFiles,
  onAssistantSend,
  onDownloadAllResults,
  onDownloadArtifact,
  onDownloadDeliverable,
  onLoadDeliverableContent,
  onLoadResourcePreview,
  onOpenReview,
  onRefreshProjectResults,
  outcomeReview,
  resultsReady: resultsReadyOverride,
  queueAcknowledgementTimeoutMs = 30_000,
  task,
  versionOptions = [],
}: ProjectGenerationWorkspaceProps) {
  const previewRequestsRef = useRef(new Map<string, symbol>());
  const resourcePreviewUrlsRef = useRef(new Map<string, string>());
  const localPackage = useLocalPackage(agentRun.projectId, agentRun.taskId, localOfficeEnabled && artifactFiles === undefined);
  const [openPreviews, setOpenPreviews] = useState<OpenPreview[]>([]);
  useEffect(() => {
    const urls = resourcePreviewUrlsRef.current;
    const requests = previewRequestsRef.current;
    return () => {
      requests.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const preview: PreviewState = openPreviews.find((item) => item.key === activePreviewKey)
    ?? { status: 'closed' };
  const [agentContext, setAgentContext] = useState<OutcomeFileAgentContext | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<AgentWorkspaceAttachment[]>([]);
  const [composerDraft, setComposerDraft] = useState('');
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [localDrafts, setLocalDrafts] = useState<Record<string, OutcomeFileDraft>>({});
  const messageQueue = useAgentMessageQueue({
    scopeKey: `${agentRun.projectId}:${agentRun.taskId}`,
    onSend: onAssistantSend,
    timeoutMs: queueAcknowledgementTimeoutMs,
  });
  const [selectedPackageVersion, setSelectedPackageVersion] = useState<string | null>(null);
  const [bridgeFiles, setBridgeFiles] = useState<OnlyOfficeBridgeFile[]>([]);
  const [resultsRefreshState, setResultsRefreshState] = useState<'idle' | 'loading' | 'error'>('idle');
  const resultsRefreshRequestRef = useRef(0);
  const lastResultsChangeRef = useRef<ProjectResultsChange | null>(null);
  useEffect(() => () => { resultsRefreshRequestRef.current += 1; }, [agentRun.projectId, agentRun.taskId]);
  const refreshProjectResults = async (change: ProjectResultsChange) => {
    if (!onRefreshProjectResults) return;
    const request = ++resultsRefreshRequestRef.current;
    lastResultsChangeRef.current = change;
    setResultsRefreshState('loading');
    try {
      await onRefreshProjectResults(change);
      if (resultsRefreshRequestRef.current === request) setResultsRefreshState('idle');
    } catch {
      if (resultsRefreshRequestRef.current === request) setResultsRefreshState('error');
    }
  };
  const [dirtyPreviewKeys, setDirtyPreviewKeys] = useState<Set<string>>(() => new Set());
  const [previewToolbarContainer, setPreviewToolbarContainer] = useState<HTMLDivElement | null>(null);
  const previewKey = (file: ProjectResultFile) => [
    file.category,
    file.id,
    file.selectedVersionId ?? 'latest',
    file.officeVersion ?? 'office-latest',
    ...(file.id.startsWith('artifact:') ? [file.remoteRevision ?? 'remote-unversioned'] : []),
  ].join(':');
  const setOpenPreview = (next: Exclude<PreviewState, { status: 'closed' }>, activate = true) => {
    const key = previewKey(next.sourceFile);
    setOpenPreviews((current) => {
      const index = current.findIndex((item) => item.key === key);
      if (index < 0) return [...current, { ...next, key }];
      const updated = [...current];
      updated[index] = { ...next, key };
      return updated;
    });
    if (activate) setActivePreviewKey(key);
  };
  const releaseResourcePreviewUrl = (key: string) => {
    const url = resourcePreviewUrlsRef.current.get(key);
    if (!url) return;
    URL.revokeObjectURL(url);
    resourcePreviewUrlsRef.current.delete(key);
  };
  const beginPreviewRequest = (file: ProjectResultFile) => {
    const key = previewKey(file);
    // Release only when this file is explicitly reloaded/closed, not from an
    // older render's effect which could race with a newly returned response.
    releaseResourcePreviewUrl(key);
    const request = Symbol(key);
    previewRequestsRef.current.set(key, request);
    return () => previewRequestsRef.current.get(key) === request;
  };
  const updatePreviewDirty = (key: string | null, dirty: boolean) => {
    if (!key) return;
    setDirtyPreviewKeys((current) => {
      if (current.has(key) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const backendResultFiles = useMemo(
    () => withResultFileVersions(adaptProjectResultFiles(deliverables), versionOptions),
    [deliverables, versionOptions],
  );
  const localPackageResultFiles = useMemo(
    () => localPackage?.files.map((file) => adaptLocalPackageResultFile(
      file,
      bridgeFiles.find((bridgeFile) => (
        bridgeFile.name.toLocaleLowerCase() === `${file.id}${file.extension}`.toLocaleLowerCase()
      )),
    )) ?? [],
    [bridgeFiles, localPackage],
  );
  const availableResultFiles = useMemo(
    () => artifactFiles !== undefined ? artifactFiles : localPackage
      ? mergeLocalPackageResultFiles(localPackageResultFiles, backendResultFiles)
      : backendResultFiles,
    [artifactFiles, backendResultFiles, localPackage, localPackageResultFiles],
  );
  const resultFiles = useMemo(() => availableResultFiles.map((file) => {
    // The local package selector represents the immutable response-package
    // version. Office saves create per-file versions, so do not overwrite a
    // file's live Vn badge with the package's V1 label.
    if (artifactFiles !== undefined || localPackage || !selectedPackageVersion) return file;
    const version = file.versions?.find((item) => item.id === selectedPackageVersion);
    return version ? {
      ...file,
      name: version.name ?? file.name,
      selectedVersionId: version.id,
      sizeLabel: version.sizeLabel ?? file.sizeLabel,
      versionLabel: version.label ?? formatVersionLabel(version.id),
    } : file;
  }), [artifactFiles, availableResultFiles, localPackage, selectedPackageVersion]);

  useEffect(() => {
    if (selectedPackageVersion) return;
    const currentVersion = availableResultFiles
      .flatMap((file) => file.versions ?? [])
      .find((version) => version.isCurrent);
    if (currentVersion) setSelectedPackageVersion(currentVersion.id);
  }, [availableResultFiles, selectedPackageVersion]);

  useEffect(() => {
    if (!localOfficeEnabled) { setBridgeFiles([]); return; }
    const controller = new AbortController();
    void listOnlyOfficeBridgeFiles(controller.signal)
      .then((files) => setBridgeFiles(files.filter((file) => (
        file.relative.startsWith(`project-${agentRun.projectId}/`)
        || file.sourceKey?.startsWith(`${agentRun.projectId}:`)
      ))))
      .catch(() => setBridgeFiles([]));
    return () => controller.abort();
  }, [agentRun.projectId, localPackage, localOfficeEnabled]);
  const resultsReady = artifactFiles !== undefined
    ? artifactFiles.length > 0 && (resultsReadyOverride ?? true)
    : Boolean(localPackage) || (resultsReadyOverride ?? resultFiles.length > 0);
  const resultGeneration = useMemo(
    () => generationState(agentRun, resultFiles, resultsReady),
    [agentRun, resultFiles, resultsReady],
  );
  const enterpriseFolders = useMemo(
    () => adaptProjectEnterpriseCategories(enterpriseCategories),
    [enterpriseCategories],
  );
  const enterpriseFiles = useMemo(
    () => adaptProjectEnterpriseFiles(enterpriseMaterials).map((file) => ({
      ...file,
      officeVersions: bridgeFiles.find((bridge) => bridge.sourceKey === `${agentRun.projectId}:enterprise:${file.id}`)?.versions,
    })),
    [enterpriseMaterials, bridgeFiles, agentRun.projectId],
  );
  const tenderMaterials = useMemo(
    () => adaptProjectTenderMaterials(materials.filter((material) => (
      material.purpose !== 'completed_bid'
    ))).map((file) => ({
      ...file,
      officeVersions: bridgeFiles.find((bridge) => bridge.sourceKey === `${agentRun.projectId}:tender:${file.id}`)?.versions,
    })),
    [materials, bridgeFiles, agentRun.projectId],
  );
  const selectedResourceFile = preview.status === 'closed'
    ? null
    : preview.sourceFile.id.startsWith('enterprise:')
      ? { id: preview.sourceFile.id.slice('enterprise:'.length), source: 'enterprise' as const }
      : preview.sourceFile.id.startsWith('tender:')
        ? { id: preview.sourceFile.id.slice('tender:'.length), source: 'tender' as const }
        : null;
  const selectedResultFile = preview.status === 'closed' || selectedResourceFile
    ? null
    : {
        category: preview.sourceFile.category,
        id: preview.sourceFile.id,
        versionId: preview.sourceFile.selectedVersionId,
      };
  const canSwitchPreview = (nextKey: string) => {
    if (!activePreviewKey || !dirtyPreviewKeys.has(activePreviewKey)) return true;
    if (nextKey === activePreviewKey) return false;
    return window.confirm('当前文档有未正式保存的修改。建议取消并选择新版本或覆盖后再切换。仍要离开当前文档吗？');
  };

  const openResultFile = async (file: ProjectResultFile) => {
    if (!canSwitchPreview(previewKey(file))) return;
    if (typeof file.officeVersion === 'number') file = { ...file, versionLabel: officeVersionLabel(file.officeVersion) };
    if (file.id.startsWith('artifact:')) {
      const isCurrentRequest = beginPreviewRequest(file);
      setOpenPreview({ sourceFile: file, status: 'loading' });
      let loaded: EnterpriseAssetPreview | undefined;
      try {
        if (!onLoadResourcePreview) throw new Error('成果文件预览暂不可用，请稍后重试。');
        loaded = await onLoadResourcePreview(file.id, file.name);
        if (!isCurrentRequest()) return;
        const fallbackFile: OutcomeWorkspaceFile = {
          categoryId: file.category,
          categoryLabel: '标书成果',
          id: file.id,
          kind: 'other',
          name: file.name,
          readOnly: true,
          version: file.versionLabel ?? '版本待返回',
        };
        if (loaded.kind === 'office') {
          if (!localOfficeEnabled) throw new Error('当前环境尚未启用在线 Office 预览，可下载后端原件查看。');
          const bridgeFile = await importOnlyOfficeBridgeFile(
            `${agentRun.projectId}:${file.id}:${file.remoteRevision ?? file.selectedVersionId ?? file.versionLabel ?? 'current'}`,
            file.name,
            loaded.blob,
          );
          if (!isCurrentRequest()) return;
          setBridgeFiles((current) => [...current.filter((item) => item.id !== bridgeFile.id), bridgeFile]);
          setOpenPreview({
            bridgeFile,
            file: { ...fallbackFile, kind: /\.xlsx?$/i.test(file.name) ? 'spreadsheet' : 'word', readOnly: false },
            sourceFile: file,
            status: 'ready',
          }, false);
          return;
        }
        const outcomeFile = resourcePreviewOutcome(fallbackFile, loaded);
        if ('blob' in loaded && outcomeFile.previewUrl) {
          resourcePreviewUrlsRef.current.set(previewKey(file), outcomeFile.previewUrl);
        }
        setOpenPreview({ file: outcomeFile, sourceFile: file, status: 'ready' }, false);
      } catch (error) {
        if (!isCurrentRequest()) return;
        setOpenPreview({
          downloadAvailable: loaded?.kind === 'office' || canRetryArtifactDownload(error),
          sourceFile: file,
          message: artifactPreviewFailureMessage(error, loaded?.kind === 'office' ? 'office' : 'source'),
          status: 'error',
        }, false);
      }
      return;
    }
    const localFile = localPackage?.files.find((item) => item.id === file.id);
    if (localFile && localPackage) {
      const isCurrentRequest = beginPreviewRequest(file);
      setOpenPreview({ sourceFile: file, status: 'loading' });
      try {
        const model = await loadLocalPackageModel(localPackage.projectId, localFile.id);
        if (!isCurrentRequest()) return;
        const savedDraft = localDrafts[localFile.id]
          ?? readLocalPackageDraft(localPackage.projectId, localPackage.taskId, localFile.id);
        setOpenPreview({
          file: localPackageOutcomeFile(localPackage.projectId, localFile, model, savedDraft),
          sourceFile: file,
          status: 'ready',
        }, false);
      } catch {
        if (!isCurrentRequest()) return;
        // The original Office-to-HTML preview remains a safe fallback when the
        // local structured model cannot be read.
        setOpenPreview({
          file: localPackageOutcomeFile(localPackage.projectId, localFile),
          sourceFile: file,
          status: 'ready',
        }, false);
      }
      return;
    }
    const baseDeliverable = deliverables.find((item) => item.id === resultDeliverableId(file));
    if (!baseDeliverable) return;
    const deliverable: ProjectDeliverableView = file.selectedVersionId
      ? {
          ...baseDeliverable,
          title: file.name,
          versionId: file.selectedVersionId,
        }
      : baseDeliverable;
    const isCurrentRequest = beginPreviewRequest(file);
    setOpenPreview({ sourceFile: file, status: 'loading' });
    try {
      const content = await onLoadDeliverableContent?.(deliverable);
      if (!isCurrentRequest()) return;
      const outcomeFile = adaptOutcomeWorkspaceFile(deliverable, content ?? undefined);
      if (!outcomeFile) {
        setOpenPreview({
          sourceFile: file,
          message: '后端未返回该成果的可预览文件模型。',
          status: 'error',
        }, false);
        return;
      }
      setOpenPreview({ deliverable, file: outcomeFile, sourceFile: file, status: 'ready' }, false);
    } catch (error) {
      if (!isCurrentRequest()) return;
      setOpenPreview({
        sourceFile: file,
        message: error instanceof Error && error.message
          ? error.message
          : '成果内容加载失败，请重试。',
        status: 'error',
      }, false);
    }
  };

  const openResourceFile = async (
    file: ProjectEnterpriseFile | ProjectTenderMaterial,
    source: 'enterprise' | 'tender',
  ) => {
    const extension = file.name.split('.').pop()?.toLocaleLowerCase();
    const kind: OutcomeWorkspaceFile['kind'] = extension === 'xlsx' || extension === 'xls'
      ? 'spreadsheet'
      : extension === 'docx' || extension === 'doc'
        ? 'word'
        : extension === 'pdf'
          ? 'pdf'
          : extension === 'html' || extension === 'htm'
            ? 'html'
            : 'other';
    const sourceFile: ProjectResultFile = {
      category: 'internal',
      id: `${source}:${file.id}`,
      name: file.name,
      sizeLabel: file.sizeLabel,
      versionLabel: typeof file.officeVersion === 'number' ? officeVersionLabel(file.officeVersion) : source === 'enterprise' ? '企业资料' : '招标材料',
      officeVersion: file.officeVersion,
      officeVersions: file.officeVersions,
    };
    if (!canSwitchPreview(previewKey(sourceFile))) return;
    const isCurrentRequest = beginPreviewRequest(sourceFile);
    const fallbackFile: OutcomeWorkspaceFile = {
        categoryId: source,
        categoryLabel: source === 'enterprise' ? '企业资料' : '招标材料',
        id: sourceFile.id,
        kind,
        name: file.name,
        readOnly: true,
        version: file.statusLabel ?? '当前版本',
        ...(kind === 'word' ? { wordDocument: { pages: [] } } : {}),
        ...(kind === 'spreadsheet' ? { workbook: { sheets: [] } } : {}),
    };
    if (!file.fileId || !onLoadResourcePreview) {
      setOpenPreview({ file: fallbackFile, sourceFile, status: 'ready' });
      return;
    }
    setOpenPreview({ sourceFile, status: 'loading' });
    try {
      const loaded = await onLoadResourcePreview(file.fileId, file.name);
      if (!isCurrentRequest()) return;
      if (loaded.kind === 'office') {
        if (!localOfficeEnabled) throw new Error('只读预览不连接本地 Office 服务。');
        const bridgeFile = await importOnlyOfficeBridgeFile(
          `${agentRun.projectId}:${source}:${file.id}`,
          file.name,
          loaded.blob,
        );
        if (!isCurrentRequest()) return;
        setBridgeFiles((current) => [...current.filter((item) => item.id !== bridgeFile.id), bridgeFile]);
        setOpenPreview({ bridgeFile, file: { ...fallbackFile, readOnly: false }, sourceFile, status: 'ready' }, false);
        return;
      }
      const outcomeFile = resourcePreviewOutcome(fallbackFile, loaded);
      if ('blob' in loaded && outcomeFile.previewUrl) {
        resourcePreviewUrlsRef.current.set(previewKey(sourceFile), outcomeFile.previewUrl);
      }
      setOpenPreview({
        file: outcomeFile,
        sourceFile,
        status: 'ready',
      }, false);
    } catch (error) {
      if (!isCurrentRequest()) return;
      setOpenPreview({
        sourceFile,
        message: error instanceof Error && error.message
          ? error.message
          : '资料内容加载失败，请重试。',
        status: 'error',
      }, false);
    }
  };

  const closePreview = (key = activePreviewKey, confirmed = false) => {
    if (!key) return;
    if (!confirmed && dirtyPreviewKeys.has(key)
      && !window.confirm('当前文档有未保存或正在保存的修改，确定要关闭吗？')) return;
    previewRequestsRef.current.delete(key);
    releaseResourcePreviewUrl(key);
    setOpenPreviews((current) => {
      const next = current.filter((item) => item.key !== key);
      setActivePreviewKey((active) => active === key ? next.at(-1)?.key ?? null : active);
      return next;
    });
    setDirtyPreviewKeys((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const closePreviewWorkspace = () => {
    const unsavedFiles = openPreviews.filter((item) => dirtyPreviewKeys.has(item.key));
    if (unsavedFiles.length > 0 && !window.confirm(
      `以下文档有未保存或正在保存的修改：\n${unsavedFiles.map((item) => item.sourceFile.name).join('\n')}\n\n建议取消并保存后再关闭。确定关闭全部文件和预览编辑区域吗？`,
    )) return;
    // In-flight responses must not reopen tabs after the whole pane is closed.
    previewRequestsRef.current.clear();
    resourcePreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    resourcePreviewUrlsRef.current.clear();
    setOpenPreviews([]);
    setActivePreviewKey(null);
    setDirtyPreviewKeys(new Set());
  };

  const downloadFailedArtifact = async (file: ProjectResultFile) => {
    if (!onDownloadArtifact) return;
    try {
      await onDownloadArtifact(file);
    } catch (error) {
      // Download failure must not reopen a tab the user has since closed.
      throw new Error(artifactPreviewFailureMessage(error, 'download'), { cause: error });
    }
  };

  const sendMessage = (value: string) => {
    const sentAttachments = composerAttachments;
    // Explicit references are inserted into the editable draft. The visible
    // draft, including any user edits/removals, is the only message source.
    const message = appendAttachmentReferences(value, sentAttachments);
    if (!onAssistantSend) return undefined;

    setComposerAttachments([]);
    const result = messageQueue.send(message, {
      summary: value.trim() || summarizeAttachments(sentAttachments),
      afterSequence: agentRun.conversation.reduce((latest, entry) => Math.max(latest, entry.seq), 0),
      onFailure: () => setComposerAttachments((current) => restoreAttachments(current, sentAttachments)),
    });
    if (result) setAgentContext(null);
    else setComposerAttachments((current) => restoreAttachments(current, sentAttachments));
    return result;
  };

  const quoteContextIntoComposer = (context: OutcomeFileAgentContext) => {
    const quote = formatContextReference(context);
    setAgentContext(context);
    setComposerDraft((current) => {
      if (current.includes(quote)) return current;
      const prefix = current;
      return `${prefix ? `${prefix}\n\n` : ''}${quote}\n\n`;
    });
    setComposerFocusRequest((value) => value + 1);
  };

  const removeComposerReference = () => {
    if (!agentContext) return;
    const reference = formatContextReference(agentContext);
    setComposerDraft((current) => removeUneditedContextReference(current, reference));
    setAgentContext(null);
  };

  const updateLocalDraft = (fileId: string, draft: OutcomeFileDraft) => {
    setLocalDrafts((current) => ({ ...current, [fileId]: draft }));
  };

  const saveLocalDraft = (fileId: string, draft: OutcomeFileDraft) => {
    updateLocalDraft(fileId, draft);
    if (!localPackage) return;
    persistLocalPackageDraft(localPackage.projectId, localPackage.taskId, fileId, draft);
    const savedFile = localPackage.files.find((file) => file.id === fileId);
    if (savedFile && onAssistantSend) {
      void Promise.resolve(onAssistantSend(
        documentUpdatedLifecycleMessage(savedFile.name),
      )).catch(() => undefined);
    }
  };

  const uploadEnterpriseFiles = async (files: File[]) => {
    if (!onAddEnterpriseFiles) return;
    await onAddEnterpriseFiles(files);
  };

  const addComposerAttachments = async (files: File[]) => {
    if (!onAssistantAddFiles) throw new Error('附件上传接口尚未接入。');
    await onAssistantAddFiles(files);
    setComposerAttachments((current) => {
      const fingerprints = new Set(current.map((attachment) => attachment.localId));
      const additions = files.flatMap((file) => {
        const fingerprint = attachmentFingerprint(file);
        if (fingerprints.has(fingerprint)) return [];
        fingerprints.add(fingerprint);
        return [{
          detail: `${formatLocalFileSize(file.size)} · 已上传至项目补充资料`,
          localId: fingerprint,
          name: file.name,
        }];
      });
      return [...current, ...additions];
    });
  };

  const downloadAllResults = async () => {
    if (onDownloadAllResults) {
      await onDownloadAllResults();
      return;
    }
    if (artifactFiles !== undefined) {
      if (onDownloadArtifact) {
        for (const file of artifactFiles) await onDownloadArtifact(file);
      }
      return;
    }
    if (!onDownloadDeliverable) return;
    const downloadedDeliverables = new Set<string>();
    for (const resultFile of resultFiles) {
      const deliverable = deliverables.find((item) => item.id === resultDeliverableId(resultFile));
      if (deliverable && !downloadedDeliverables.has(deliverable.id)) {
        downloadedDeliverables.add(deliverable.id);
        await onDownloadDeliverable({
        ...deliverable,
        versionId: resultFile.selectedVersionId ?? deliverable.versionId,
        });
      }
    }
  };

  const contextReferences: AgentWorkspaceContextReference[] = agentContext
    ? [{
        detail: agentContext.selectedText
          ? `选中：“${summarizeSelectedText(agentContext.selectedText)}”`
          : agentContext.location
            ?? agentContext.range
            ?? agentContext.sheetName
            ?? (agentContext.pageNumber ? `第 ${agentContext.pageNumber} 页` : undefined),
        id: agentContext.fileId,
        label: agentContext.label,
      }]
    : [];

  const activity = (
    <div className={`project-generation-workspace__activity-stack${resultsRefreshState !== 'idle' ? ' project-generation-workspace__activity-stack--refreshing' : ''}`}>
      {resultsRefreshState !== 'idle' ? (
        <div className="project-generation-workspace__results-refresh" role="status">
          <span>{resultsRefreshState === 'loading'
            ? '正在刷新成果与评分…'
            : '成果与评分刷新失败，当前评分可能不是最新结果。'}</span>
          {resultsRefreshState === 'error' ? <button
            onClick={() => { if (lastResultsChangeRef.current) void refreshProjectResults(lastResultsChangeRef.current); }}
            type="button"
          >重试刷新</button> : null}
        </div>
      ) : null}
      <AgentActivityTimeline
        answeringAskId={answeringAskId}
        compact={preview.status !== 'closed'}
        localMessages={messageQueue.localMessages}
        onAnswerInteraction={onAnswerInteraction}
        run={agentRun}
      />
    </div>
  );

  const composer = (
    <AgentWorkspaceComposer
      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
      attachments={composerAttachments}
      contextReferences={contextReferences}
      disabled={!onAssistantSend && !onAssistantAddFiles}
      focusRequest={composerFocusRequest}
      onAddFiles={onAssistantAddFiles ? addComposerAttachments : undefined}
      onDeleteQueued={messageQueue.deleteQueued}
      onSteerQueued={messageQueue.steer}
      onRemoveAttachment={(attachment) => setComposerAttachments((current) => (
        current.filter((item) => item.localId !== attachment.localId)
      ))}
      onRemoveContextReference={removeComposerReference}
      onSend={onAssistantSend ? (message) => sendMessage(message) : undefined}
      onValueChange={setComposerDraft}
      pending={messageQueue.hasInFlight}
      placeholder="补充要求或询问当前进度，可上传图片/文件…"
      queuedMessages={messageQueue.queuedMessages}
      value={composerDraft}
    />
  );
  const activeBridgeFile = preview.status === 'ready'
    ? preview.bridgeFile ?? (localPackage
      ? bridgeFileForPreview(preview.sourceFile, localPackage.files, bridgeFiles)
      : undefined)
    : undefined;
  const recordFile = findCompilationRecordFile(resultFiles);
  const recordDeliverable = recordFile
    ? deliverables.find((item) => item.id === resultDeliverableId(recordFile))
    : undefined;
  const hasCurrentArtifactCatalog = artifactFiles !== undefined
    && preview.status !== 'closed' && preview.sourceFile.id.startsWith('artifact:');
  const latestPreviewArtifact = hasCurrentArtifactCatalog
    ? artifactFiles?.find((file) => file.id === preview.sourceFile.id)
    : undefined;
  const artifactPreviewIsRemoved = hasCurrentArtifactCatalog && !latestPreviewArtifact;
  const artifactPreviewIsOutdated = Boolean(latestPreviewArtifact && preview.status !== 'closed'
    && latestPreviewArtifact.remoteRevision !== preview.sourceFile.remoteRevision);

  return (
    <ProjectResultWorkspace
      activity={activity}
      summary={(status) => (
        <ProjectCompletionDashboard
          findings={findings}
          onDownloadRecordFile={recordFile?.id.startsWith('artifact:') && onDownloadArtifact
            ? onDownloadArtifact
            : onDownloadDeliverable && recordDeliverable
            ? (file) => onDownloadDeliverable({
                ...recordDeliverable,
                title: file.name,
                versionId: file.selectedVersionId ?? recordDeliverable.versionId,
              })
            : undefined}
          onOpenRecordFile={(file: ProjectResultFile) => void openResultFile(file)}
          onOpenReview={onOpenReview}
          recordFile={recordFile}
          review={outcomeReview}
          status={status}
          task={task}
        />
      )}
      composer={composer}
      fileCount={resultFiles.length}
      fileWorkspace={preview.status === 'closed' ? undefined : (
        <div className={`project-generation-workspace__preview-tabs-shell${artifactPreviewIsRemoved || artifactPreviewIsOutdated ? ' project-generation-workspace__preview-tabs-shell--changed' : ''}`}>
          <div className="project-generation-workspace__preview-tabbar">
          <nav aria-label="已打开文件" className="project-generation-workspace__preview-tabs">
            {openPreviews.map((item) => (
              <div className={item.key === activePreviewKey ? 'is-active' : undefined} key={item.key}>
                <button
                  aria-current={item.key === activePreviewKey ? 'page' : undefined}
                  onClick={() => { if (canSwitchPreview(item.key)) setActivePreviewKey(item.key); }}
                  title={item.sourceFile.name}
                  type="button"
                >
                  <FileText aria-hidden="true" size={14} />
                  <span>{item.sourceFile.name}</span>
                  {item.sourceFile.versionLabel ? <small>{item.sourceFile.versionLabel}</small> : null}
                </button>
                <button
                  aria-label={`关闭 ${item.sourceFile.name}`}
                  onClick={() => closePreview(item.key)}
                  title={`关闭当前文件：${item.sourceFile.name}`}
                  type="button"
                ><X aria-hidden="true" size={15} /></button>
              </div>
            ))}
          </nav>
          <div className="project-generation-workspace__preview-tools" ref={setPreviewToolbarContainer} />
          <button
            aria-label="关闭预览编辑区域"
            className="project-generation-workspace__close-preview"
            onClick={closePreviewWorkspace}
            title="关闭整个预览编辑区域（关闭所有文件）"
            type="button"
          ><X aria-hidden="true" size={19} /></button>
          </div>
          {artifactPreviewIsRemoved || artifactPreviewIsOutdated ? (
            <div className="project-generation-workspace__preview-revision-notice" role="status">
              <span>{artifactPreviewIsRemoved
                ? '该文件已不在当前成果目录中，当前预览不会自动关闭。'
                : '后端文件已更新，当前预览为旧版本。'}</span>
              {artifactPreviewIsOutdated && latestPreviewArtifact ? <button
                onClick={() => void openResultFile(latestPreviewArtifact)}
                type="button"
              >打开最新版本</button> : null}
            </div>
          ) : null}
          {preview.status === 'ready' && activeBridgeFile ? (
            <OnlyOfficeEditorWorkspace
              key={activePreviewKey}
              bridgeFile={activeBridgeFile}
              contextBase={outcomeFileBaseContext(preview.file)}
              displayName={preview.sourceFile.name}
              mode="edit"
              selectedVersion={preview.sourceFile.officeVersion}
              localCopyOnly={preview.sourceFile.id.startsWith('artifact:')}
              onDownloadOriginal={preview.sourceFile.id.startsWith('artifact:') && onDownloadArtifact
                ? () => onDownloadArtifact(preview.sourceFile)
                : undefined}
              toolbarContainer={previewToolbarContainer}
              onClose={() => closePreview(activePreviewKey, true)}
              onDirtyChange={(dirty) => updatePreviewDirty(activePreviewKey, dirty)}
              onSaved={(version) => {
                // Opening an existing local session can replay its saved snapshot.
                // Only a save following edits represents a new document change.
                if (activePreviewKey && dirtyPreviewKeys.has(activePreviewKey)) {
                  void refreshProjectResults({ reason: 'office-save', fileId: preview.sourceFile.id, version, localOnly: true });
                }
                const localVersionLabel = preview.sourceFile.id.startsWith('artifact:')
                  ? `${preview.sourceFile.versionLabel?.split(' · 本机')[0] ?? '后端原件'} · 本机 ${officeVersionLabel(version)}`
                  : officeVersionLabel(version);
                const savedSourceFile = { ...preview.sourceFile, officeVersion: version, versionLabel: localVersionLabel };
                const savedPreviewKey = previewKey(savedSourceFile);
                const savedBridgeFile = activeBridgeFile;
                if (savedBridgeFile) setBridgeFiles((current) => current.map((file) => (
                  file.id === savedBridgeFile.id ? { ...file, latestVersion: Math.max(file.latestVersion ?? 0, version) } : file
                )));
                void listOnlyOfficeBridgeFiles().then((files) => setBridgeFiles(files.filter((file) => (
                  file.relative.startsWith(`project-${agentRun.projectId}/`)
                  || file.sourceKey?.startsWith(`${agentRun.projectId}:`)
                )))).catch(() => undefined);
                if (activePreviewKey) setDirtyPreviewKeys((current) => {
                  const next = new Set(current);
                  next.delete(activePreviewKey);
                  return next;
                });
                setOpenPreviews((current) => current.map((item) => item.key === activePreviewKey
                  ? {
                      ...item,
                      key: savedPreviewKey,
                      file: item.status === 'ready' ? { ...item.file, saveStatus: 'saved', version: localVersionLabel } : undefined,
                      sourceFile: savedSourceFile,
                    } as OpenPreview
                  : item));
                if (activePreviewKey && activePreviewKey !== savedPreviewKey) {
                  const resourceUrl = resourcePreviewUrlsRef.current.get(activePreviewKey);
                  if (resourceUrl) {
                    resourcePreviewUrlsRef.current.delete(activePreviewKey);
                    resourcePreviewUrlsRef.current.set(savedPreviewKey, resourceUrl);
                  }
                  setActivePreviewKey(savedPreviewKey);
                }
              }}
              onSendContextToAgent={quoteContextIntoComposer}
            />
          ) : preview.status === 'loading' ? (
        <PreviewStatePanel message="正在读取文件内容…" title="正在打开文件" />
      ) : preview.status === 'error' ? (
        <PreviewStatePanel
          actionLabel="重试"
          downloadActionLabel={preview.downloadAvailable && onDownloadArtifact ? '下载原文件' : undefined}
          message={preview.message}
          onAction={() => void openResultFile(preview.sourceFile)}
          onClose={() => closePreview(activePreviewKey, true)}
          onDownload={preview.downloadAvailable && onDownloadArtifact
            ? () => downloadFailedArtifact(preview.sourceFile)
            : undefined}
          title="文件加载失败"
        />
      ) : preview.status === 'ready' ? (
        <OutcomeFileWorkspace
          key={activePreviewKey}
          file={preview.file}
          toolbarContainer={previewToolbarContainer}
          onClose={() => closePreview(activePreviewKey, true)}
          onDirtyChange={(dirty) => updatePreviewDirty(activePreviewKey, dirty)}
          onDownload={preview.sourceFile.id.startsWith('artifact:') && onDownloadArtifact
            ? () => onDownloadArtifact(preview.sourceFile)
            : onDownloadDeliverable && preview.deliverable
            ? () => onDownloadDeliverable(preview.deliverable as ProjectDeliverableView)
            : undefined}
          onDraftChange={localPackage?.files.some((item) => item.id === preview.sourceFile.id)
            ? (_file, draft) => {
                updateLocalDraft(preview.sourceFile.id, draft);
                if (activePreviewKey) setDirtyPreviewKeys((current) => new Set(current).add(activePreviewKey));
              }
            : undefined}
          onSave={localPackage?.files.some((item) => item.id === preview.sourceFile.id)
            && preview.file.readOnly === false
            ? (_file, draft) => {
                saveLocalDraft(preview.sourceFile.id, draft);
                if (activePreviewKey) setDirtyPreviewKeys((current) => {
                  const next = new Set(current);
                  next.delete(activePreviewKey);
                  return next;
                });
              }
            : undefined}
          onSendContextToAgent={quoteContextIntoComposer}
        />
      ) : null}
        </div>
      )}
      rail={(
        <ProjectResourceRail
          enterpriseCategories={enterpriseFolders}
          enterpriseFiles={enterpriseFiles}
          enterpriseUploadControl={onAddEnterpriseFiles
            ? <EnterpriseUploadControl onUpload={uploadEnterpriseFiles} />
            : undefined}
          onDownloadAllResults={onDownloadAllResults || (artifactFiles !== undefined ? onDownloadArtifact && artifactFiles.length > 0 : onDownloadDeliverable) ? downloadAllResults : undefined}
          onSelectEnterpriseFile={(file) => openResourceFile(file, 'enterprise')}
          onSelectResultFile={(file) => void openResultFile(file)}
          onSelectResultVersion={(version) => {
            if (version === selectedPackageVersion) return;
            setSelectedPackageVersion(version);
            void refreshProjectResults({ reason: 'version-select', ...(version ? { version } : {}) });
          }}
          onSelectTenderMaterial={(file) => openResourceFile(file, 'tender')}
          resultFiles={resultFiles}
          resultGeneration={resultGeneration}
          selectedResourceFile={selectedResourceFile}
          selectedResultFile={selectedResultFile}
          selectedResultVersionId={selectedPackageVersion}
          tenderMaterials={tenderMaterials}
        />
      )}
      resultsReady={resultsReady}
      run={agentRun}
      task={task}
    />
  );
}

function EnterpriseUploadControl({ onUpload }: { onUpload: EnterpriseUploadHandler }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    setPending(true);
    setError('');
    try {
      await onUpload(files);
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.message
        ? caughtError.message
        : '企业资料上传失败。');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="project-generation-workspace__enterprise-upload">
      <button disabled={pending} onClick={() => inputRef.current?.click()} type="button">
        <UploadCloud aria-hidden="true" size={17} />
        {pending ? '上传中…' : '上传企业资料'}
      </button>
      <input
        aria-label="选择企业资料"
        hidden
        multiple
        onChange={(event) => void upload(event)}
        ref={inputRef}
        type="file"
      />
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function PreviewStatePanel({
  actionLabel,
  downloadActionLabel,
  message,
  onAction,
  onClose,
  onDownload,
  title,
}: {
  actionLabel?: string;
  downloadActionLabel?: string;
  message: string;
  onAction?: () => void;
  onClose?: () => void;
  onDownload?: () => void | Promise<void>;
  title: string;
}) {
  return (
    <section className="project-generation-workspace__preview-state" role="status">
      <strong>{title}</strong>
      <p>{message}</p>
      <div>
        {onAction && actionLabel ? <button onClick={onAction} type="button">{actionLabel}</button> : null}
        {onDownload && downloadActionLabel ? <FileDownloadButton onDownload={onDownload} label={downloadActionLabel} /> : null}
        {onClose ? <button onClick={onClose} type="button">关闭预览</button> : null}
      </div>
    </section>
  );
}

function responseStatus(error: unknown): number | null {
  return typeof error === 'object' && error !== null
    && 'status' in error && typeof error.status === 'number'
    ? error.status
    : null;
}

/**
 * The artifact list is authoritative, but a file's binary and the optional
 * local Office bridge are independent requests. Do not expose a transport
 * response or a bridge implementation error as if it were a business log.
 */
function artifactPreviewFailureMessage(
  error: unknown,
  phase: 'source' | 'office' | 'download',
) {
  if (phase === 'office') {
    return '当前环境暂时无法打开此 Office 文件进行在线预览。可下载原文件后在本机查看。';
  }
  const status = responseStatus(error);
  if (status === 401) return '登录状态已失效，请重新登录后打开该成果。';
  if (status === 403) {
    return '当前账号没有读取该成果原文件的权限，请确认权限后重新打开。';
  }
  if (status === 404) {
    return '暂未找到可读取的成果原文件，请刷新成果目录后重新打开。';
  }
  if (status === 409) {
    return '成果状态已变化，请刷新成果目录后重新打开。';
  }
  if (phase === 'download') {
    return '原文件暂时无法下载。请稍后重试；若仍失败，请刷新成果目录后重新打开。';
  }
  return '暂时无法读取该成果原文件。它可能正在同步或服务暂不可用；可下载原文件后查看，或稍后重试。';
}

function canRetryArtifactDownload(error: unknown) {
  const status = responseStatus(error);
  // A missing file and a permission failure cannot be repaired by immediately
  // issuing the same download request. Other failures may be transient.
  return status !== 401 && status !== 403 && status !== 404;
}

function generationState(
  run: AgentRunViewModel,
  files: readonly ProjectResultFile[],
  resultsReady: boolean,
): ProjectResultGenerationState {
  const overall = run.completion === 'complete'
    ? resultsReady ? 'completed' : 'generating'
    : run.completion === 'failed'
      || run.completion === 'cancelled'
      || run.completion === 'incomplete'
      ? 'failed'
      : 'generating';
  const folders = Object.fromEntries(PROJECT_RESULT_CATEGORIES.map((category) => {
    const hasFile = files.some((file) => file.category === category);
    if (hasFile) return [category, 'completed'];
    if (overall === 'generating') return [category, 'generating'];
    if (overall === 'failed') return [category, 'failed'];
    // A completed task does not prove that every optional result folder has a file.
    return [category, 'pending'];
  })) as ProjectResultGenerationState['folders'];
  return { folders, overall };
}

function findCompilationRecordFile(files: readonly ProjectResultFile[]) {
  return files.find((file) => (
    file.category === 'internal'
    && /(?:编制逻辑|评分响应|响应记录|评分记录)/u.test(file.name)
  ));
}

/**
 * The local project-207 response package is a development fallback for the
 * three customer-facing result folders. Internal management records remain
 * authoritative backend data and must never be hidden by that fallback.
 */
export function mergeLocalPackageResultFiles(
  localFiles: readonly ProjectResultFile[],
  backendFiles: readonly ProjectResultFile[],
): ProjectResultFile[] {
  const backendInternalFiles = backendFiles.filter((file) => file.category === 'internal');
  return [
    ...localFiles.filter((file) => file.category !== 'internal'),
    ...(backendInternalFiles.length > 0
      ? backendInternalFiles
      : localFiles.filter((file) => file.category === 'internal')),
  ];
}

function adaptLocalPackageResultFile(
  file: LocalPackageFile,
  bridgeFile?: OnlyOfficeBridgeFile,
): ProjectResultFile {
  const latestFileVersion = Math.max(1, bridgeFile?.latestVersion ?? 1);
  return {
    category: file.category,
    id: file.id,
    mediaType: file.extension === '.xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: file.name,
    sizeLabel: formatLocalFileSize(file.size),
    selectedVersionId: '1',
    versionLabel: `V${latestFileVersion}`,
    versions: [{ id: '1', isCurrent: true, label: 'V1' }],
    officeVersions: bridgeFile?.versions,
  };
}

function resourcePreviewOutcome(
  fallback: OutcomeWorkspaceFile,
  preview: EnterpriseAssetPreview,
): OutcomeWorkspaceFile {
  if (preview.kind === 'text') {
    const pages = new Map<number, typeof preview.blocks>();
    preview.blocks.forEach((block) => {
      const page = Math.max(1, block.pageNo ?? 1);
      pages.set(page, [...(pages.get(page) ?? []), block]);
    });
    return {
      ...fallback,
      kind: 'word',
      wordDocument: {
        pages: [...pages.entries()].sort(([left], [right]) => left - right).map(([page, blocks]) => ({
          blocks: blocks.map((block) => ({
            id: block.id,
            text: block.text,
            type: 'paragraph' as const,
          })),
          id: `page-${page}`,
          label: `第 ${page} 页`,
        })),
      },
    };
  }
  if ('blob' in preview) {
    const previewUrl = URL.createObjectURL(new Blob([preview.blob], { type: preview.mimeType }));
    return {
      ...fallback,
      downloadUrl: previewUrl,
      kind: preview.kind === 'pdf' || preview.kind === 'html' ? preview.kind : 'other',
      mimeType: preview.mimeType,
      previewUrl,
      ...(preview.kind === 'html' && preview.unavailableReason
        ? { previewUnavailableReason: preview.unavailableReason }
        : {}),
    };
  }
  const message = 'message' in preview
    ? preview.message
    : '当前资料暂时无法在线预览。';
  return {
    ...fallback,
    kind: 'word',
    wordDocument: {
      pages: [{
        blocks: [{ id: 'unsupported', text: message, type: 'paragraph' }],
        id: 'page-1',
      }],
    },
  };
}

function bridgeFileForPreview(
  sourceFile: ProjectResultFile,
  localFiles: readonly LocalPackageFile[],
  bridgeFiles: readonly OnlyOfficeBridgeFile[],
) {
  const localFile = localFiles.find((file) => file.id === sourceFile.id);
  if (!localFile) return undefined;
  const mountedName = `${localFile.id}${localFile.extension}`.toLocaleLowerCase();
  return bridgeFiles.find((file) => file.name.toLocaleLowerCase() === mountedName);
}

function localPackageOutcomeFile(
  projectId: string,
  file: LocalPackageFile,
  model?: unknown,
  draft?: OutcomeFileDraft,
): OutcomeWorkspaceFile {
  const base = `/__local-package/${encodeURIComponent(projectId)}/${file.id}`;
  const kind = file.extension === '.xlsx' ? 'spreadsheet' : 'word';
  const wordDocument = draft?.kind === 'word'
    ? draft.document
    : extractOutcomeWordDocument(model);
  const workbook = draft?.kind === 'spreadsheet'
    ? draft.workbook
    : extractOutcomeWorkbook(model);
  const hasStructuredContent = kind === 'spreadsheet'
    ? workbook.sheets.length > 0
    : wordDocument.pages.length > 0;
  return {
    categoryId: file.category,
    categoryLabel: file.category === 'business'
      ? '商务文件'
      : file.category === 'technical'
        ? '技术文件'
        : '价格文件',
    downloadUrl: `${base}/download`,
    id: file.id,
    kind,
    mimeType: file.extension === '.xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: file.name,
    previewUrl: `${base}/preview`,
    readOnly: !hasStructuredContent,
    version: hasStructuredContent ? '本地成果包 · 浏览器草稿' : '本地成果包',
    ...(kind === 'spreadsheet' ? { workbook } : { wordDocument }),
  };
}

function formatLocalFileSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(2)} MB`
    : `${Math.max(0, size / 1024).toFixed(1)} KB`;
}

function removeUneditedContextReference(value: string, reference: string) {
  // Only the last explicitly inserted, unchanged block may be removed. Never
  // trim or reconstruct the draft: edited reference text belongs to the user.
  const index = value.lastIndexOf(reference);
  if (index < 0) return value;
  const end = index + reference.length;
  const startsOnOwnLine = index === 0 || value[index - 1] === '\n';
  const endsOnOwnLine = end === value.length || value[end] === '\n';
  if (!startsOnOwnLine || !endsOnOwnLine) return value;
  return value.slice(0, index) + value.slice(end);
}

function appendAttachmentReferences(
  value: string,
  attachments: readonly AgentWorkspaceAttachment[],
) {
  if (attachments.length === 0) return value;
  const attachmentLine = `项目补充资料（已上传，请按文件名读取）：${attachments.map((attachment) => `「${attachment.name}」`).join('、')}`;
  return [value.trim(), attachmentLine].filter(Boolean).join('\n\n');
}

function summarizeAttachments(attachments: readonly AgentWorkspaceAttachment[]) {
  if (attachments.length === 0) return '发送已上传资料';
  const names = attachments.map((attachment) => attachment.name).join('、');
  return attachments.length === 1
    ? `引用已上传资料：${names}`
    : `引用 ${attachments.length} 份已上传资料：${names}`;
}

function restoreAttachments(
  current: readonly AgentWorkspaceAttachment[],
  sent: readonly AgentWorkspaceAttachment[],
) {
  const existing = new Set(current.map((attachment) => (
    attachment.localId ?? `${attachment.name}:${attachment.detail ?? ''}`
  )));
  const restored = sent.filter((attachment) => {
    const key = attachment.localId ?? `${attachment.name}:${attachment.detail ?? ''}`;
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return [...restored, ...current];
}

function attachmentFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatContextReference(context: OutcomeFileAgentContext) {
  const location = [
    context.sheetName,
    context.range,
    context.pageNumber ? `第 ${context.pageNumber} 页` : undefined,
    context.location,
  ].filter(Boolean).join(' · ');
  const selectedText = context.selectedText?.trim();
  return [
    `引用成果：${context.fileName}${location ? ` · ${location}` : ''}`,
    selectedText ? `选中内容：${selectedText}` : undefined,
  ].filter((part): part is string => Boolean(part)).join('\n');
}

function outcomeFileBaseContext(file: OutcomeWorkspaceFile): OutcomeFileAgentContext {
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

function localPackageDraftKey(projectId: string, taskId: string, fileId: string) {
  return `bidvolt:local-result-draft:${projectId}:${taskId}:${fileId}`;
}

function readLocalPackageDraft(projectId: string, taskId: string, fileId: string) {
  try {
    const raw = window.localStorage.getItem(localPackageDraftKey(projectId, taskId, fileId));
    if (!raw) return undefined;
    const candidate = JSON.parse(raw) as Partial<OutcomeFileDraft>;
    if (candidate.kind === 'word' && candidate.document
      && Array.isArray(candidate.document.pages)) return candidate as OutcomeFileDraft;
    if (candidate.kind === 'spreadsheet' && candidate.workbook
      && Array.isArray(candidate.workbook.sheets)) return candidate as OutcomeFileDraft;
  } catch {
    // A corrupt or unavailable browser draft must never block the source file.
  }
  return undefined;
}

function persistLocalPackageDraft(
  projectId: string,
  taskId: string,
  fileId: string,
  draft: OutcomeFileDraft,
) {
  try {
    window.localStorage.setItem(
      localPackageDraftKey(projectId, taskId, fileId),
      JSON.stringify(draft),
    );
  } catch {
    throw new Error('浏览器无法保存本地草稿，请检查可用存储空间。');
  }
}

function withResultFileVersions(
  files: readonly ProjectResultFile[],
  options: readonly ProjectOverviewVersionOption[],
): ProjectResultFile[] {
  return files.map((file) => {
    const deliverableId = resultDeliverableId(file);
    const versions = options
      .filter((option) => option.deliverableId === deliverableId)
      .map((option) => ({
        id: option.versionId,
        isCurrent: option.isCurrent,
        label: formatVersionLabel(option.versionId),
      }));
    if (versions.length === 0) return file;
    const selectedVersion = versions.find((version) => version.isCurrent) ?? versions[0];
    return {
      ...file,
      selectedVersionId: selectedVersion.id,
      versionLabel: selectedVersion.label,
      versions,
    };
  });
}

function resultDeliverableId(file: Pick<ProjectResultFile, 'category' | 'id'>) {
  if (file.category === 'business') return 'business';
  if (file.category === 'technical') return 'technical';
  if (file.category === 'price') return 'quote';
  // Internal result rows may use the backing file id as their stable list key.
  // The deliverable view, however, is addressed by its category route id.
  return 'internal';
}

function formatVersionLabel(versionId: string) {
  const normalized = versionId.trim();
  return /^v/i.test(normalized) ? `V${normalized.slice(1)}` : `V${normalized}`;
}

function summarizeSelectedText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 52 ? `${normalized.slice(0, 52)}…` : normalized;
}
