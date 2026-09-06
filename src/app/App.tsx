import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { LoginPage, type LoginCredentials, type RegisterCredentials } from '../domains/auth/LoginPage';
import {
  DeliverableEditorPage,
  backendQuoteRows,
  toBackendEditorContent,
  type OfficeMockSavePayload,
} from '../domains/editor';
import { LandingPage } from '../domains/marketing/LandingPage';
import { PricingCenter } from '../domains/pricing/PricingCenter';
import type {
  HistoryPriceSample,
  QuoteAiSuggestionView,
  QuoteCalculationInput,
  QuoteCalculationView,
  QuoteRecalculationView,
} from '../domains/pricing/types';
import { ProjectListPage } from '../domains/projects/ProjectListPage';
import {
  ProjectOverviewPage,
  type DeliverablesRequestView,
  type ProjectDeliverableView,
  type ProjectOverviewView,
  type ProjectTaskStatus,
} from '../domains/projects/ProjectOverviewPage';
import type { ProjectSummary } from '../domains/projects/project-view-model';
import {
  rememberGenerateWorkflow,
} from '../domains/projects/project-workflow-mode';
import { buildProjectOutcomeReviewViewModel } from '../domains/projects/ProjectOutcomeReviewPanel';
import { buildProjectReviewSidebarViewModel } from '../domains/projects/ProjectReviewSidebar';
import type {
  EnterpriseUploadResult,
  WorkspaceMaterial,
} from '../domains/projects/ProjectWorkbench';
import type {
  ProjectWorkflowFacts,
  ProjectWorkflowResourceState,
  ProjectWorkflowTaskSummary,
} from '../domains/projects/ProjectWorkflow';
import { ReviewCenter } from '../domains/review/ReviewCenter';
import type { ReviewProvider, ReviewRunView } from '../domains/review/types';
import {
  EnterpriseAssetsPage,
  type EnterpriseAsset,
  type EnterpriseAssetPreview,
  type EnterpriseAssetCategoryFolder,
} from '../features/enterprise-assets';
import { loadHtmlAssetPreview } from '../features/enterprise-assets/html-preview';
import {
  BID_MARKET_MOCK_ITEMS,
  BidMarketLibraryPage,
} from '../features/bid-market-library';
import {
  ProjectMaterialsPage,
  summarizeTenderPreparation,
  type ProjectMaterial,
  type ProjectRequirement,
  type ProjectSnapshot,
} from '../features/project-materials';
import {
  applyAgentStreamEnd,
  createAgentRunViewModel,
  mergeAgentStreamMessage,
  type AgentRunViewModel,
  type PublicTaskEvent,
} from '../shared/task-events';
import {
  BackendApiError,
  adaptBackendDeliverableCards,
  adaptBackendEnterpriseAssets,
  adaptBackendEnterpriseCategories,
  adaptBackendHistorySamples,
  adaptBackendProjectOverview,
  adaptBackendProjectMaterials,
  adaptBackendProject,
  adaptBackendProjects,
  adaptBackendQuoteCalculation,
  adaptBackendRequirements,
  adaptBackendReviewProviders,
  adaptBackendReviewRun,
  adaptBackendSnapshots,
  adaptBackendTaskEvent,
  backendApi,
  isBackendTaskTerminal,
  scoreSummaryForOverview,
  subscribeToBackendApiRequests,
  type BackendApiRequestEvent,
  type BackendTask,
  type BackendTaskStreamUpdate,
  type Deliverable,
  type DeliverableContent,
  type EditorSession,
  type EnterpriseCategory,
  type JsonObject,
  type ImageDescribeProgress,
  type MeResponse,
  type ScoreSummary,
  type TenderNoticeImportJob,
} from '../shared/backend-api';
import { TaskProgressDrawer } from '../shared/ui/TaskProgressDrawer';
import { publicAgentReply } from '../shared/ui/agent-timeline-classification';
import { isUnconfirmedAgentRequestError } from '../shared/ui/useAgentMessageQueue';
import { PRODUCT_NAME } from '../shared/product-brand';
import { ApiTestPanel } from './ApiTestPanel';
import { AppShell } from './AppShell';
import { BackendApiStatusBar } from './BackendApiStatusBar';
import { shouldShowApiTestPanel } from './api-test-panel-gate';
import {
  BACKEND_SESSION_EXPIRED_EVENT,
  clearBackendSession,
  getBackendAccessToken,
  getBackendRefreshToken,
  saveBackendSession,
} from './backend-session';
import { AppLink, deliverableEditorPath, navigate, type DeliverableRouteId, useUrlRoute } from './router';
import { mergeProjectPage, upsertProjectSummary } from './project-state';
import {
  findLatestActiveBidGenerateTask,
  findLatestGenerationTask,
  agentRunFallbackFromGenerationTask,
  findCurrentProjectSubmissionTask,
  hasTaskEnteredTerminalState,
  isActiveTaskStatus,
  isProjectNotFound,
  isReviewScoreUnavailable,
  mergePendingAgentRunTaskReceipt,
  mergeTaskStreamUpdate,
  resolveTaskPollingInterval,
  shouldReloadProjectAfterAgentPoll,
  shouldShowImageDescribeProgress,
  shouldUseAgentRunForGenerationTask,
  type ProjectResourceErrors,
  type ProjectResourceKey,
} from './project-resource-state';
import { getEditorDraftScopeKey, type AppSession } from './session';
import { createEmptyTenantDomainState, createTenantGenerationGuard } from './tenant-isolation';
import { readUploadOutcome, uploadExpansionMessage, uploadOutcomeError } from './upload-outcome';
import { buildEnterpriseUploadRecords } from './enterprise-upload-records';
import { createEditorSaveGate } from './editor-save-gate';
import { updateProjectMetadata } from '../shared/project-metadata';
import { deliverableVersionSignature, scoreIsOutdated } from './score-freshness';
import { adaptArtifactResources, artifactIdentityFromResourceId, artifactResourcesRevision } from './artifact-resources';
import type { AgentArtifactSummary } from '../shared/backend-api/artifacts';
import { buildPageApiActivity } from './page-api-activity';
import { pageApiCatalog } from './page-api-catalog';
import {
  documentUpdatedLifecycleMessage,
  enterpriseUploadLifecycleMessage,
  sendBidVoltLifecycleMessage,
  waitForEnterpriseUploadLifecycle,
  type EnterpriseUploadLifecycleTarget,
} from './bidvolt-lifecycle';
import { tenderNoticeImportErrorMessage } from './backend-capability-errors';
import {
  initialBackendReachabilityState,
  reduceBackendReachability,
} from './backend-reachability';
import {
  fetchEnterpriseAssetBundle,
  fetchEnterpriseOverview,
  refreshEnterpriseAfterUpload,
} from './enterprise-data';
import {
  buildProjectOverviewVersionOptions,
  findTaskDeliverableEditorTarget,
  isCurrentDeliverableVersionFromTask,
  loadDeliverableVersionLists,
  type DeliverableTaskIdentity,
  type DeliverableVersionsById,
} from './deliverable-versions';
import {
  isLocalPreviewAvailable,
  localPreviewWriteError,
} from './local-preview-gate';

type LocalPreviewPayload = typeof import('./local-preview');

const loadLocalPreviewPayload = import.meta.env.DEV
  ? () => import('./local-preview')
  : undefined;

type ProjectData = {
  artifacts?: AgentArtifactSummary[];
  invalidatedScoreId?: number;
  localOfficeChanges?: boolean;
  agentRun?: AgentRunViewModel;
  deliverables: Deliverable[];
  deliverableVersions: DeliverableVersionsById;
  materials: ProjectMaterial[];
  overview?: ProjectOverviewView;
  quote: QuoteCalculationView;
  quoteSamples: HistoryPriceSample[];
  requirements: ProjectRequirement[];
  reviewRun: ReviewRunView;
  score?: ScoreSummary;
  snapshots: ProjectSnapshot[];
  tenderNotices: TenderNoticeImportJob[];
  tasks: PublicTaskEvent[];
};

type ActiveEditor = {
  content: DeliverableContent;
  deliverable: Deliverable;
  readOnlyReason?: string;
  session?: EditorSession;
};

type ProjectRouteFailure = {
  message: string;
  projectId: string;
};

type TaskStreamConnection = {
  key: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'fallback';
};

async function loadBackendTaskSnapshots(projectId: string) {
  const response = await backendApi.tasks.list(projectId);
  const snapshots = [...response.items];
  const activeTaskIndexes = response.items.flatMap((task, index) =>
    isBackendTaskTerminal(task) ? [] : [index]).slice(0, 8);
  const detailResults = await Promise.allSettled(activeTaskIndexes.map((index) =>
    backendApi.tasks.get(response.items[index].task_id)));
  detailResults.forEach((result, detailIndex) => {
    if (result.status === 'fulfilled') snapshots[activeTaskIndexes[detailIndex]] = result.value;
  });
  return snapshots;
}

function latestBackendAgentTask(tasks: readonly BackendTask[]) {
  return tasks.reduce<BackendTask | undefined>((latest, task) => {
    if (task.task_type !== 'agent_pipeline') return latest;
    if (!latest) return task;
    const taskCreatedAt = Date.parse(task.created_at ?? '');
    const latestCreatedAt = Date.parse(latest.created_at ?? '');
    if (Number.isFinite(taskCreatedAt) && Number.isFinite(latestCreatedAt)) {
      return taskCreatedAt > latestCreatedAt ? task : latest;
    }
    return Number(task.task_id) > Number(latest.task_id) ? task : latest;
  }, undefined);
}

function hasDeliverableVersionForGenerationTask(
  data: ProjectData | undefined,
  task: PublicTaskEvent | undefined,
  agentRun: AgentRunViewModel | undefined,
) {
  if (!data) return false;
  const taskIdentity = task ?? (agentRun ? { task_id: agentRun.taskId } : null);
  if (!taskIdentity) {
    return data.deliverables.some((deliverable) =>
      Number.isInteger(deliverable.current_version_no)
      && (deliverable.current_version_no ?? 0) > 0);
  }
  return data.deliverables.some((deliverable) => {
    const currentVersionNo = deliverable.current_version_no;
    const currentVersion = data.deliverableVersions[String(deliverable.deliverable_id)]
      ?.find((version) => version.version_no === currentVersionNo);
    return isCurrentDeliverableVersionFromTask({
      currentVersion,
      currentVersionNo,
      task: taskIdentity,
    });
  });
}

const backendApiBaseLabel = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const DELIVERABLE_SYNC_INTERVAL_MS = 4_000;
const DELIVERABLE_SYNC_MAX_ATTEMPTS = 20;

const projectTaskStatuses = new Set<ProjectTaskStatus>([
  'queued',
  'running',
  'retrying',
  'waiting_user',
  'succeeded',
  'failed',
]);

function toProjectTaskStatus(status: PublicTaskEvent['status']): ProjectTaskStatus | undefined {
  if (status === 'cancel_requested') return 'running';
  if (status === 'cancelled' || status === 'unknown') return 'failed';
  return projectTaskStatuses.has(status as ProjectTaskStatus)
    ? status as ProjectTaskStatus
    : undefined;
}

const terminalStreamProgressStatuses = new Set([
  'done',
  'succeeded',
  'cancelled',
  'canceled',
  'failed',
]);

function isTerminalTaskStreamUpdate(update: BackendTaskStreamUpdate) {
  return terminalStreamProgressStatuses.has(update.progress.status.toLocaleLowerCase())
    || (update.type === 'snapshot' && [3, 5, 6].includes(update.status));
}

const projectResourceLabels: Record<ProjectResourceKey, string> = {
  materials: '项目材料',
  requirements: '招标要求',
  snapshots: '项目快照',
  tenderNotices: '招标公告导入记录',
  tasks: '任务进度',
  agent: 'BidVolt 主会话',
  deliverables: '成果版本',
  review: '评审结果',
  score: '最新评分',
  quote: '报价测算',
};

const emptyQuote = (projectId: string): QuoteCalculationView => ({
  id: `project-${projectId}-no-calculation`,
  status: 'needs_input',
  algorithmVersion: '尚未测算',
  sampleSnapshotId: '',
  querySnapshotId: '',
  message: '当前项目尚无确定性报价测算结果。',
  strategies: [],
});

const emptyReview = (): ReviewRunView => ({
  id: '',
  status: 'idle',
  projectSnapshotId: '',
  deliverableVersions: [],
  findings: [],
});

export function App() {
  const route = useUrlRoute();
  const showApiTestPanel = shouldShowApiTestPanel();
  const routeProjectId = 'projectId' in route ? route.projectId : undefined;
  const [authState, setAuthState] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [localPreviewActive, setLocalPreviewActive] = useState(false);
  const bidMarketDemoActive = import.meta.env.DEV || localPreviewActive;
  const [localPreviewProjectId, setLocalPreviewProjectId] = useState<string | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loginError, setLoginError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [imageDescribeProgress, setImageDescribeProgress] = useState<ImageDescribeProgress | null>(null);
  const [projectData, setProjectData] = useState<Record<string, ProjectData>>({});
  const [enterpriseAssets, setEnterpriseAssets] = useState<EnterpriseAsset[]>([]);
  const [enterpriseCategories, setEnterpriseCategories] = useState<EnterpriseAssetCategoryFolder[]>([]);
  const [enterpriseDataState, setEnterpriseDataState] = useState<ProjectWorkflowResourceState>('loading');
  const [reviewProviders, setReviewProviders] = useState<ReviewProvider[]>([]);
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState<string | null>(null);
  const [answeringAgentAskId, setAnsweringAgentAskId] = useState<string | null>(null);
  const [downloadingResponsePackage, setDownloadingResponsePackage] = useState(false);
  const [resumingAgentRun, setResumingAgentRun] = useState(false);
  const [pendingAgentMessageCount, setPendingAgentMessageCount] = useState(0);
  const [agentStreamRefresh, setAgentStreamRefresh] = useState(0);
  const sendingAgentMessage = pendingAgentMessageCount > 0;
  const [taskStreamConnection, setTaskStreamConnection] = useState<TaskStreamConnection>({
    key: null,
    status: 'idle',
  });
  const [statusMessage, setStatusMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [backendReachability, setBackendReachability] = useState(initialBackendReachabilityState);
  const [snapshotDetail, setSnapshotDetail] = useState<{ id: string; value: unknown } | null>(null);
  const [editor, setEditor] = useState<ActiveEditor | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [missingProjectId, setMissingProjectId] = useState<string | null>(null);
  const [projectRouteFailure, setProjectRouteFailure] = useState<ProjectRouteFailure | null>(null);
  const [projectRetryNonce, setProjectRetryNonce] = useState(0);
  const [projectResourceErrors, setProjectResourceErrors] = useState<Record<string, ProjectResourceErrors>>({});
  const [backendRequestEvents, setBackendRequestEvents] = useState<Record<string, BackendApiRequestEvent>>({});
  const editorLoadKeyRef = useRef('');
  const activeEditorRef = useRef<ActiveEditor | null>(null);
  const projectDataRef = useRef<Record<string, ProjectData>>({});
  const scoreRefreshErrorRef = useRef<Record<string, string | undefined>>({});
  const resultRefreshGenerationRef = useRef<Record<string, number>>({});
  const projectIdentityRevisionRef = useRef<Record<string, number>>({});
  const editorSaveGateRef = useRef(createEditorSaveGate());
  const tenantGuardRef = useRef(createTenantGenerationGuard());
  const projectListRequestRef = useRef(0);
  const projectLoadGenerationRef = useRef(0);
  const projectResourceGenerationRef = useRef<Record<string, number>>({});
  const taskEventsRef = useRef<Record<string, PublicTaskEvent[]>>({});
  const pendingAgentTaskReceiptRef = useRef<Record<string, string>>({});
  const pendingGenerationEditorNavigationRef = useRef<{
    hasReachedOverview: boolean;
    projectId: string;
    taskId: string;
  } | null>(null);
  const taskLoadGenerationRef = useRef<Record<string, number>>({});
  const taskSnapshotRequestRef = useRef(new Map<string, Promise<BackendTask[]>>());
  const enterpriseCategoryRecordsRef = useRef<EnterpriseCategory[]>([]);
  const enterpriseAssetDetailRequestRef = useRef(new Map<string, Promise<EnterpriseAsset | void>>());
  const enterpriseOverviewRequestRef = useRef(0);
  const responsePackageRequestRef = useRef(new Map<string, Promise<void>>());
  const agentStreamOpenRef = useRef<{ projectId: string; taskId: string } | null>(null);
  const localPreviewPayloadRef = useRef<LocalPreviewPayload | null>(null);
  const localPreviewLoadRef = useRef(false);
  const apiRouteStartedAtRef = useRef(Date.now());
  const routeProjectIdRef = useRef(routeProjectId);
  routeProjectIdRef.current = routeProjectId;
  activeEditorRef.current = editor;
  projectDataRef.current = projectData;

  const clearTenantDomainState = useCallback(() => {
    const empty = createEmptyTenantDomainState();
    tenantGuardRef.current.invalidate();
    projectListRequestRef.current += 1;
    setProjects(empty.projects);
    setProjectsTotal(empty.projectsTotal);
    setImageDescribeProgress(null);
    setProjectData(empty.projectData);
    setEnterpriseAssets(empty.enterpriseAssets);
    setEnterpriseCategories(empty.enterpriseCategories);
    setEnterpriseDataState('loading');
    setReviewProviders(empty.reviewProviders);
    setLocalPreviewProjectId(null);
    localPreviewPayloadRef.current = null;
    setTaskDrawerProjectId(empty.taskDrawerProjectId);
    setAnsweringAgentAskId(null);
    setDownloadingResponsePackage(false);
    responsePackageRequestRef.current.clear();
    agentStreamOpenRef.current = null;
    setResumingAgentRun(false);
    setPendingAgentMessageCount(0);
    setTaskStreamConnection({ key: null, status: 'idle' });
    setSnapshotDetail(empty.snapshotDetail);
    setEditor(empty.editor);
    activeEditorRef.current = null;
    editorSaveGateRef.current.reset();
    setLoadingProjectId(empty.loadingProjectId);
    setMissingProjectId(null);
    setProjectRouteFailure(null);
    setProjectResourceErrors({});
    scoreRefreshErrorRef.current = {};
    resultRefreshGenerationRef.current = {};
    projectIdentityRevisionRef.current = {};
    apiRouteStartedAtRef.current = Date.now();
    setBackendRequestEvents({});
    setBackendReachability(initialBackendReachabilityState);
    setStatusMessage(empty.statusMessage);
    editorLoadKeyRef.current = '';
    projectResourceGenerationRef.current = {};
    taskEventsRef.current = {};
    pendingAgentTaskReceiptRef.current = {};
    pendingGenerationEditorNavigationRef.current = null;
    taskLoadGenerationRef.current = {};
    taskSnapshotRequestRef.current.clear();
    enterpriseCategoryRecordsRef.current = [];
    enterpriseAssetDetailRequestRef.current.clear();
    enterpriseOverviewRequestRef.current += 1;
  }, []);

  const becomeAnonymous = useCallback((options: { clearStoredSession?: boolean } = {}) => {
    if (options.clearStoredSession !== false) clearBackendSession();
    clearTenantDomainState();
    setAuthSubmitting(false);
    setSession(null);
    setAuthState('anonymous');
  }, [clearTenantDomainState]);

  const setError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof BackendApiError
      && error.accessToken
      && error.accessToken !== getBackendAccessToken()) return;
    if (error instanceof BackendApiError && error.status === 401) {
      becomeAnonymous();
      navigate('/login', { replace: true });
      return;
    }
    // Transport failures are rendered by the independent reachability state.
    // They must not replace a confirmed business result such as an accepted upload.
    if (error instanceof BackendApiError && error.status === 0) return;
    if (error instanceof Error && error.name === 'AbortError') return;
    setStatusMessage({ tone: 'error', text: readableError(error, fallback) });
  }, [becomeAnonymous]);

  const apiRouteActivityKey = route.name === 'deliverable-editor'
    ? `${route.name}:${route.projectId}:${route.deliverableId}:${route.versionId}`
    : `${route.name}:${routeProjectId ?? ''}`;

  useEffect(() => subscribeToBackendApiRequests((event) => {
    setBackendReachability((current) => reduceBackendReachability(current, event));
    if (Date.parse(event.startedAt) < apiRouteStartedAtRef.current) return;
    setBackendRequestEvents((current) => {
      const next = { ...current, [event.requestId]: event };
      const retained = Object.values(next)
        .sort((left, right) => right.sequence - left.sequence)
        .slice(0, 500);
      return Object.fromEntries(retained.map((item) => [item.requestId, item]));
    });
  }), []);

  useEffect(() => {
    apiRouteStartedAtRef.current = Date.now();
    setBackendRequestEvents({});
  }, [apiRouteActivityKey]);

  const establishSession = useCallback(async (
    me?: MeResponse,
    generation = tenantGuardRef.current.capture(),
  ) => {
    const profile = me ?? await backendApi.auth.me();
    const developerAdminEmails = import.meta.env.DEV
      ? (import.meta.env.VITE_DEV_ADMIN_EMAILS ?? '')
        .split(',')
        .map((email: string) => email.trim().toLocaleLowerCase())
        .filter(Boolean)
      : [];
    const permissions = developerAdminEmails.includes(profile.email.trim().toLocaleLowerCase())
      ? Array.from(new Set([...profile.permissions, 'admin.user']))
      : profile.permissions;
    const nextSession: AppSession = {
      enterpriseId: String(profile.enterprise_id),
      enterpriseName: profile.enterprise_name || '企业名称未提供',
      permissions,
      userId: String(profile.user_id),
      user: {
        displayName: profile.email || `用户 #${profile.user_id}`,
        role: permissions.includes('admin.user') ? '企业管理员' : '投标用户',
      },
    };
    const established = tenantGuardRef.current.commit(generation, () => {
      setSession(nextSession);
      setAuthState('authenticated');
    });
    return established ? nextSession : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!getBackendAccessToken()) {
      setAuthState('anonymous');
      return undefined;
    }
    const generation = tenantGuardRef.current.capture();
    backendApi.auth.me().then((me) => {
      if (!cancelled) void establishSession(me, generation);
    }).catch(() => {
      if (cancelled || !tenantGuardRef.current.isCurrent(generation)) return;
      becomeAnonymous();
    });
    return () => { cancelled = true; };
  }, [becomeAnonymous, establishSession]);

  useEffect(() => {
    const handleExpiredSession = () => {
      if (localPreviewActive) return;
      becomeAnonymous({ clearStoredSession: false });
      navigate('/login', { replace: true });
    };
    window.addEventListener(BACKEND_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(BACKEND_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, [becomeAnonymous, localPreviewActive]);

  const loadProjects = useCallback(async (query = '') => {
    const generation = tenantGuardRef.current.capture();
    const requestId = ++projectListRequestRef.current;
    const items = await backendApi.projects.listAll(
      query.trim() ? { q: query.trim() } : {},
    );
    if (requestId !== projectListRequestRef.current) return;
    tenantGuardRef.current.commit(generation, () => {
      setProjects((current) => mergeProjectPage(
        adaptBackendProjects(items),
        current,
        routeProjectIdRef.current,
      ));
      setProjectsTotal(items.length);
    });
  }, []);

  const loadEnterprise = useCallback(async () => {
    const generation = tenantGuardRef.current.capture();
    const overviewRequestId = ++enterpriseOverviewRequestRef.current;
    tenantGuardRef.current.commit(generation, () => setEnterpriseDataState('loading'));
    try {
      const { assets, categories } = await fetchEnterpriseOverview(backendApi.enterprise);
      if (overviewRequestId !== enterpriseOverviewRequestRef.current) return;
      tenantGuardRef.current.commit(generation, () => {
        enterpriseCategoryRecordsRef.current = categories;
        setEnterpriseAssets(adaptBackendEnterpriseAssets(
          assets.map((asset) => ({ asset })),
          categories,
        ));
        setEnterpriseCategories(adaptBackendEnterpriseCategories(categories));
        setEnterpriseDataState('ready');
      });
    } catch (error) {
      if (overviewRequestId === enterpriseOverviewRequestRef.current) {
        tenantGuardRef.current.commit(generation, () => setEnterpriseDataState('error'));
      }
      throw error;
    }
  }, []);

  const loadEnterpriseAssetDetail = useCallback((assetId: string) => {
    const existing = enterpriseAssetDetailRequestRef.current.get(assetId);
    if (existing) return existing;

    const generation = tenantGuardRef.current.capture();
    const request: Promise<EnterpriseAsset | void> = fetchEnterpriseAssetBundle(
      backendApi.enterprise,
      assetId,
    ).then((bundle) => {
      const adapted = adaptBackendEnterpriseAssets(
        [bundle],
        enterpriseCategoryRecordsRef.current,
      )[0];
      if (!adapted) return undefined;
      const committed = tenantGuardRef.current.commit(generation, () => {
        setEnterpriseAssets((current) => current.map((asset) =>
          asset.id === assetId ? adapted : asset));
      });
      return committed ? adapted : undefined;
    }).finally(() => {
      if (enterpriseAssetDetailRequestRef.current.get(assetId) === request) {
        enterpriseAssetDetailRequestRef.current.delete(assetId);
      }
    });
    enterpriseAssetDetailRequestRef.current.set(assetId, request);
    return request;
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated' || localPreviewActive) return;
    const generation = tenantGuardRef.current.capture();
    void Promise.all([loadProjects(), loadEnterprise(), backendApi.review.listProviders()])
      .then(([, , providers]) => tenantGuardRef.current.commit(generation, () => {
        setReviewProviders(adaptBackendReviewProviders(providers));
      }))
      .catch((error) => {
        if (tenantGuardRef.current.isCurrent(generation)) setError(error, '基础数据加载失败');
      });
  }, [authState, loadEnterprise, loadProjects, localPreviewActive, setError]);

  useEffect(() => {
    if (authState !== 'authenticated' || localPreviewActive) return undefined;
    let stopped = false;
    const refreshImageProgress = async () => {
      try {
        const progress = await backendApi.files.imageDescribeProgress();
        if (!stopped) setImageDescribeProgress(progress);
      } catch {
        // The API activity panel records the real failure. Image descriptions
        // are auxiliary, so a transient worker outage must not block the page.
      }
    };
    void refreshImageProgress();
    const timer = window.setInterval(() => {
      if (!stopped) void refreshImageProgress();
    }, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [authState, localPreviewActive]);

  const requestTaskSnapshots = useCallback((projectId: string) => {
    const existing = taskSnapshotRequestRef.current.get(projectId);
    if (existing) return existing;

    const request = loadBackendTaskSnapshots(projectId);
    taskSnapshotRequestRef.current.set(projectId, request);
    const clearRequest = () => {
      if (taskSnapshotRequestRef.current.get(projectId) === request) {
        taskSnapshotRequestRef.current.delete(projectId);
      }
    };
    request.then(clearRequest, clearRequest);
    return request;
  }, []);

  const loadProject = useCallback(async (projectId: string) => {
    const identityRevision = projectIdentityRevisionRef.current[projectId] ?? 0;
    resultRefreshGenerationRef.current[projectId] = (resultRefreshGenerationRef.current[projectId] ?? 0) + 1;
    const tenantGeneration = tenantGuardRef.current.capture();
    const resourceGeneration = (projectResourceGenerationRef.current[projectId] ?? 0) + 1;
    const taskLoadGeneration = (taskLoadGenerationRef.current[projectId] ?? 0) + 1;
    projectResourceGenerationRef.current[projectId] = resourceGeneration;
    taskLoadGenerationRef.current[projectId] = taskLoadGeneration;
    tenantGuardRef.current.commit(tenantGeneration, () => setLoadingProjectId(projectId));
    try {
      const results = await Promise.allSettled([
        (async () => {
          const [files, materials] = await Promise.all([
            backendApi.files.listAll({ target: 'project', project_id: projectId }),
            backendApi.files.projectMaterials(projectId),
          ]);
          return { files, materials };
        })(),
        backendApi.requirements.list(projectId),
        backendApi.snapshots.list(projectId),
        backendApi.tenderNotices.list(projectId),
        requestTaskSnapshots(projectId),
        (async () => {
          const tasks = await requestTaskSnapshots(projectId);
          const agentTask = latestBackendAgentTask(tasks);
          if (!agentTask) return undefined;
          const status = await backendApi.agent.status(projectId, agentTask.task_id);
          const questions = await backendApi.agent.questions(projectId, agentTask.task_id)
            .catch(() => status.customer);
          return { questions, status };
        })(),
        (async () => {
          const deliverables = await backendApi.deliverables.list(projectId);
          const deliverableVersions = await loadDeliverableVersionLists(
            deliverables,
            (deliverableId) => backendApi.deliverables.listVersions(deliverableId),
          );
          return { deliverables, deliverableVersions };
        })(),
        (async () => {
          const reviewRuns = await backendApi.review.listRuns(projectId);
          const latestRun = [...reviewRuns.items].sort((a, b) => Number(b.run_id) - Number(a.run_id))[0];
          const initialRunDetail = latestRun
            ? await backendApi.review.getRun(projectId, latestRun.run_id)
            : undefined;
          const scoreId = asId(initialRunDetail?.score?.score_id);
          const runDetail = initialRunDetail && scoreId
            ? {
                ...initialRunDetail,
                // The review center is backed by the review_item endpoint. The run-detail copy is
                // only context and may be stale after confirmation or re-evaluation.
                items: await backendApi.review.listItems(projectId, scoreId),
              }
            : initialRunDetail;
          return { runDetail };
        })(),
        backendApi.review.latestScore(projectId).catch((error) => {
          if (isReviewScoreUnavailable(error)) return undefined;
          throw error;
        }),
        (async () => {
          const quoteList = await backendApi.quotes.list(projectId);
          const latestQuote = quoteList.items[0];
          const quoteId = asId(latestQuote?.calc_id);
          const quoteDetail = quoteId ? await backendApi.quotes.get(quoteId) : undefined;
          const quote = quoteDetail
            ? adaptBackendQuoteCalculation(quoteDetail as Parameters<typeof adaptBackendQuoteCalculation>[0])
            : emptyQuote(projectId);
          const quoteSamplePayload = readHistorySamples(quoteDetail);
          const samples = adaptBackendHistorySamples(
            quoteSamplePayload.samples,
            quoteSamplePayload.snapshotIds,
          );
          return { quote, samples };
        })(),
        backendApi.projects.get(projectId),
        backendApi.artifacts.listAll(projectId),
      ]);
      if (!tenantGuardRef.current.isCurrent(tenantGeneration)
        || projectResourceGenerationRef.current[projectId] !== resourceGeneration) return;

      const [
        filesResult,
        requirementsResult,
        snapshotsResult,
        tenderNoticesResult,
        tasksResult,
        agentResult,
        deliverablesResult,
        reviewResult,
        scoreResult,
        quoteResult,
        projectResult,
        artifactsResult,
      ] = results;
      if (projectResult.status === 'fulfilled' && projectResult.value?.project_id !== undefined
        && (projectIdentityRevisionRef.current[projectId] ?? 0) === identityRevision) {
        setProjects((current) => upsertProjectSummary(current, adaptBackendProject(projectResult.value)));
      }
      const taskResultIsCurrent = taskLoadGenerationRef.current[projectId] === taskLoadGeneration;
      const resourceResults: Array<[ProjectResourceKey, PromiseSettledResult<unknown>]> = [
        ['materials', filesResult],
        ['requirements', requirementsResult],
        ['snapshots', snapshotsResult],
        ['tenderNotices', tenderNoticesResult],
        ['tasks', taskResultIsCurrent ? tasksResult : { status: 'fulfilled', value: undefined }],
        ['agent', agentResult],
        ['deliverables', deliverablesResult],
        ['review', reviewResult],
        ['score', scoreResult],
        ['quote', quoteResult],
      ];
      const errors = Object.fromEntries(resourceResults.flatMap(([key, result]) =>
        result.status === 'rejected'
          ? [[key, readableError(result.reason, `${projectResourceLabels[key]}加载失败`)]]
          : [])) as ProjectResourceErrors;
      if (artifactsResult.status === 'rejected') {
        errors.deliverables = readableError(artifactsResult.reason, '正式成果目录读取失败');
      }

      setProjectData((current) => {
        const previous = current[projectId] ?? {
          deliverables: [],
          deliverableVersions: {},
          materials: [],
          quote: emptyQuote(projectId),
          quoteSamples: [],
          requirements: [],
          reviewRun: emptyReview(),
          snapshots: [],
          tenderNotices: [],
          tasks: [],
        };
        const next: ProjectData = { ...previous };
        if (artifactsResult.status === 'fulfilled') {
          if (previous.artifacts && previous.score && artifactResourcesRevision(previous.artifacts)
            !== artifactResourcesRevision(artifactsResult.value)) next.invalidatedScoreId = previous.score.score_id;
          next.artifacts = artifactsResult.value;
        }
        if (filesResult.status === 'fulfilled') {
          const filesById = Object.fromEntries(
            filesResult.value.files.map((file) => [String(file.file_id), file]),
          );
          next.materials = adaptBackendProjectMaterials(filesResult.value.materials, filesById);
        }
        if (requirementsResult.status === 'fulfilled') {
          const fileNamesById = filesResult.status === 'fulfilled'
            ? Object.fromEntries(filesResult.value.files.map((file) => [String(file.file_id), file.name]))
            : {};
          next.requirements = adaptBackendRequirements(requirementsResult.value, { fileNamesById });
        }
        if (snapshotsResult.status === 'fulfilled') next.snapshots = adaptBackendSnapshots(snapshotsResult.value.items);
        if (tenderNoticesResult.status === 'fulfilled') next.tenderNotices = tenderNoticesResult.value.items;
        if (tasksResult.status === 'fulfilled' && taskResultIsCurrent) {
          const loadedTasks = tasksResult.value.map((task, index, tasks) => adaptBackendTaskEvent(task, {
            projectId,
            sequence: tasks.length - index,
          }));
          const pendingTaskId = pendingAgentTaskReceiptRef.current[projectId];
          if (pendingTaskId && loadedTasks.some((task) => task.task_id === pendingTaskId)) {
            delete pendingAgentTaskReceiptRef.current[projectId];
          }
          next.tasks = mergePendingAgentRunTaskReceipt(
            loadedTasks,
            previous.agentRun,
            pendingAgentTaskReceiptRef.current[projectId],
          );
          taskEventsRef.current[projectId] = next.tasks;
        }
        if (agentResult.status === 'fulfilled') {
          const pendingTaskId = pendingAgentTaskReceiptRef.current[projectId];
          const pendingRun = pendingTaskId && previous.agentRun?.taskId === pendingTaskId
            ? previous.agentRun
            : undefined;
          if (!agentResult.value) {
            // A newly created Agent task can be returned by POST before the
            // task list converges. Keep that real queued/running receipt so the
            // UI cannot become submit-ready again during the consistency gap.
            if (!pendingRun && previous.agentRun?.completion !== 'active') delete next.agentRun;
          } else if (pendingRun
            && String(agentResult.value.status.task_id) !== pendingRun.taskId) {
            // The status request was derived from the stale list. It must not
            // replace the newer POST receipt until that task appears in GET /tasks.
            next.agentRun = pendingRun;
          } else {
            const previousRun = previous.agentRun?.taskId === String(agentResult.value.status.task_id)
              ? previous.agentRun
              : undefined;
            next.agentRun = createAgentRunViewModel(agentResult.value.status, {
              projectId,
              questions: agentResult.value.questions,
              conversation: previousRun?.conversation,
              previousRun,
              streamState: previousRun?.streamState ?? 'idle',
            });
          }
        }
        if (deliverablesResult.status === 'fulfilled') {
          if (previous.score && deliverableVersionSignature(previous.deliverables)
            !== deliverableVersionSignature(deliverablesResult.value.deliverables)) {
            next.invalidatedScoreId = previous.score.score_id;
          }
          next.deliverables = deliverablesResult.value.deliverables;
          next.deliverableVersions = deliverablesResult.value.deliverableVersions;
        }
        if (reviewResult.status === 'fulfilled') {
          next.reviewRun = reviewResult.value.runDetail ? adaptBackendReviewRun(reviewResult.value.runDetail) : emptyReview();
        }
        if (scoreResult.status === 'fulfilled') next.score = scoreResult.value;
        if (quoteResult.status === 'fulfilled') {
          next.quote = quoteResult.value.quote;
          next.quoteSamples = quoteResult.value.samples;
        }
        next.overview = adaptBackendProjectOverview(
          next.deliverables,
          next.score ? scoreSummaryForOverview(next.score) : undefined,
        );
        return { ...current, [projectId]: next };
      });
      setProjectResourceErrors((current) => ({ ...current, [projectId]: errors }));
      scoreRefreshErrorRef.current[projectId] = errors.score;
    } finally {
      if (projectResourceGenerationRef.current[projectId] === resourceGeneration) {
        tenantGuardRef.current.commit(tenantGeneration, () => {
          setLoadingProjectId((current) => current === projectId ? null : current);
        });
      }
    }
  }, [requestTaskSnapshots]);

  const refreshProjectMaterials = useCallback(async (projectId: string) => {
    const identityRevision = projectIdentityRevisionRef.current[projectId] ?? 0;
    const tenantGeneration = tenantGuardRef.current.capture();
    const [files, materials] = await Promise.all([
      backendApi.files.listAll({ target: 'project', project_id: projectId }),
      backendApi.files.projectMaterials(projectId),
    ]);
    if (!tenantGuardRef.current.isCurrent(tenantGeneration)
      || routeProjectIdRef.current !== projectId) return;
    const filesById = Object.fromEntries(files.map((file) => [String(file.file_id), file]));
    const nextMaterials = adaptBackendProjectMaterials(materials, filesById);
    setProjectData((current) => {
      const existing = current[projectId];
      if (!existing) return current;
      return { ...current, [projectId]: { ...existing, materials: nextMaterials } };
    });
    setProjectResourceErrors((current) => {
      const existing = current[projectId];
      if (!existing?.materials) return current;
      const next = { ...existing };
      delete next.materials;
      return { ...current, [projectId]: next };
    });
    // Material parsing may update authoritative project metadata asynchronously.
    void backendApi.projects.get(projectId).then((project) => {
      if (tenantGuardRef.current.isCurrent(tenantGeneration) && project?.project_id !== undefined
        && (projectIdentityRevisionRef.current[projectId] ?? 0) === identityRevision) {
        setProjects((current) => upsertProjectSummary(current, adaptBackendProject(project)));
      }
    }).catch(() => undefined);
    return nextMaterials;
  }, []);

  const refreshProjectDeliverables = useCallback(async (
    projectId: string,
    task: DeliverableTaskIdentity,
  ) => {
    const tenantGeneration = tenantGuardRef.current.capture();
    const resultGeneration = (resultRefreshGenerationRef.current[projectId] ?? 0) + 1;
    resultRefreshGenerationRef.current[projectId] = resultGeneration;
    const [deliverables, artifacts] = await Promise.all([
      backendApi.deliverables.list(projectId), backendApi.artifacts.listAll(projectId),
    ]);
    const deliverableVersions = await loadDeliverableVersionLists(
      deliverables,
      (deliverableId) => backendApi.deliverables.listVersions(deliverableId),
    );
    const scoreResult = await Promise.allSettled([backendApi.review.latestScore(projectId).catch((error) => {
      if (isReviewScoreUnavailable(error)) return undefined;
      throw error;
    })]);
    if (!tenantGuardRef.current.isCurrent(tenantGeneration)
      || routeProjectIdRef.current !== projectId
      || resultRefreshGenerationRef.current[projectId] !== resultGeneration) return false;

    const scoreError = scoreResult[0].status === 'rejected'
      ? readableError(scoreResult[0].reason, '评分刷新失败') : undefined;
    scoreRefreshErrorRef.current[projectId] = scoreError;

    setProjectData((current) => {
      const existing = current[projectId];
      if (!existing) return current;
      const next = {
        ...existing,
        deliverables,
        deliverableVersions,
        artifacts,
      };
      const changed = deliverableVersionSignature(existing.deliverables) !== deliverableVersionSignature(deliverables)
        || (existing.artifacts !== undefined && artifactResourcesRevision(existing.artifacts) !== artifactResourcesRevision(artifacts));
      if (changed && existing.score) next.invalidatedScoreId = existing.score.score_id;
      if (scoreResult[0].status === 'fulfilled') next.score = scoreResult[0].value;
      next.overview = adaptBackendProjectOverview(
        deliverables,
        next.score ? scoreSummaryForOverview(next.score) : undefined,
      );
      return { ...current, [projectId]: next };
    });
    setProjectResourceErrors((current) => {
      const existing = current[projectId];
      const next = { ...existing };
      delete next.deliverables;
      if (scoreError) next.score = scoreError;
      else delete next.score;
      return { ...current, [projectId]: next };
    });
    return artifacts.some(artifact => artifact.kind !== 'zip' && String(artifact.task_id) === String(task.task_id)) || deliverables.some((deliverable) => {
      const currentVersionNo = deliverable.current_version_no;
      const currentVersion = deliverableVersions[String(deliverable.deliverable_id)]
        ?.find((version) => version.version_no === currentVersionNo);
      return isCurrentDeliverableVersionFromTask({ currentVersion, currentVersionNo, task });
    });
  }, []);

  const refreshTaskEvents = useCallback(async (projectId: string) => {
    const generation = tenantGuardRef.current.capture();
    const taskLoadGeneration = (taskLoadGenerationRef.current[projectId] ?? 0) + 1;
    taskLoadGenerationRef.current[projectId] = taskLoadGeneration;
    const tasks = await requestTaskSnapshots(projectId);
    if (!tenantGuardRef.current.isCurrent(generation)
      || taskLoadGenerationRef.current[projectId] !== taskLoadGeneration) return false;
    let nextTasks = tasks.map((task, index) => adaptBackendTaskEvent(task, {
      projectId,
      sequence: tasks.length - index,
    }));
    const previousTasks = taskEventsRef.current[projectId] ?? [];
    const pendingTaskId = pendingAgentTaskReceiptRef.current[projectId];
    if (pendingTaskId && nextTasks.some((task) => task.task_id === pendingTaskId)) {
      delete pendingAgentTaskReceiptRef.current[projectId];
    } else if (pendingTaskId) {
      const pendingReceipt = previousTasks.find((task) =>
        task.task_id === pendingTaskId && task.event_id === `agent-receipt-${pendingTaskId}`);
      if (pendingReceipt) {
        nextTasks = [...nextTasks, {
          ...pendingReceipt,
          sequence: Math.max(0, ...nextTasks.map((task) => task.sequence)) + 1,
        }];
      }
    }
    const enteredTerminalState = hasTaskEnteredTerminalState(previousTasks, nextTasks);
    taskEventsRef.current[projectId] = nextTasks;
    setProjectData((current) => {
      const existing = current[projectId];
      if (!existing) return current;
      return {
        ...current,
        [projectId]: {
          ...existing,
          tasks: nextTasks,
        },
      };
    });
    setProjectResourceErrors((current) => {
      const existing = current[projectId];
      if (!existing?.tasks) return current;
      const next = { ...existing };
      delete next.tasks;
      return { ...current, [projectId]: next };
    });
    return enteredTerminalState;
  }, [requestTaskSnapshots]);

  useEffect(() => {
    if (authState !== 'authenticated' || !routeProjectId || localPreviewActive) return;
    const tenantGeneration = tenantGuardRef.current.capture();
    const projectGeneration = ++projectLoadGenerationRef.current;
    setLoadingProjectId(routeProjectId);
    setMissingProjectId((current) => current === routeProjectId ? null : current);
    setProjectRouteFailure((current) => current?.projectId === routeProjectId ? null : current);
    void backendApi.projects.get(routeProjectId).then(async (project) => {
      if (!tenantGuardRef.current.isCurrent(tenantGeneration)
        || projectLoadGenerationRef.current !== projectGeneration) return;
      setProjects((current) => upsertProjectSummary(current, adaptBackendProject(project)));
      setMissingProjectId((current) => current === routeProjectId ? null : current);
      setProjectRouteFailure((current) => current?.projectId === routeProjectId ? null : current);
      await loadProject(routeProjectId);
    }).catch((error) => {
      if (tenantGuardRef.current.isCurrent(tenantGeneration)
        && projectLoadGenerationRef.current === projectGeneration) {
        if (isProjectNotFound(error)) {
          setMissingProjectId(routeProjectId);
          setProjectRouteFailure((current) => current?.projectId === routeProjectId ? null : current);
        } else {
          setMissingProjectId((current) => current === routeProjectId ? null : current);
          setProjectRouteFailure({
            message: readableError(error, '项目数据加载失败'),
            projectId: routeProjectId,
          });
        }
        setError(error, '项目数据加载失败');
      }
    }).finally(() => {
      if (tenantGuardRef.current.isCurrent(tenantGeneration)
        && projectLoadGenerationRef.current === projectGeneration) {
        setLoadingProjectId((current) => current === routeProjectId ? null : current);
      }
    });
    return () => {
      if (projectLoadGenerationRef.current === projectGeneration) projectLoadGenerationRef.current += 1;
    };
  }, [authState, loadProject, localPreviewActive, projectRetryNonce, routeProjectId, setError]);

  const routeAgentRun = routeProjectId ? projectData[routeProjectId]?.agentRun : undefined;
  const routeTaskEvents = routeProjectId
    ? mergePendingAgentRunTaskReceipt(
        projectData[routeProjectId]?.tasks ?? [],
        routeAgentRun,
        pendingAgentTaskReceiptRef.current[routeProjectId],
      )
    : [];
  const routeLatestGenerationTask = findLatestGenerationTask(routeTaskEvents);
  const routeUsesAgentRun = shouldUseAgentRunForGenerationTask(
    routeLatestGenerationTask,
    routeAgentRun,
  );
  const routeGenerationTaskId = routeLatestGenerationTask?.task_id ?? routeAgentRun?.taskId;
  const routeGenerationAwaitingDeliverables = routeUsesAgentRun
    ? routeAgentRun?.completion === 'complete' || routeAgentRun?.completion === 'unknown_terminal'
    : routeLatestGenerationTask?.status === 'succeeded';
  const routeHasDeliverableVersions = routeProjectId
    ? Boolean(projectData[routeProjectId]?.artifacts?.some(artifact => artifact.kind !== 'zip'
        && String(artifact.task_id) === String(routeLatestGenerationTask?.task_id))) || hasDeliverableVersionForGenerationTask(
        projectData[routeProjectId],
        routeLatestGenerationTask,
        routeUsesAgentRun ? routeAgentRun : undefined,
      )
    : false;
  const routeDeliverablesError = routeProjectId
    ? projectResourceErrors[routeProjectId]?.deliverables
    : undefined;
  const activeBidGenerateTask = findLatestActiveBidGenerateTask(routeTaskEvents);
  const activeBidGenerateTaskId = activeBidGenerateTask?.task_id;
  const activeTaskStreamKey = routeProjectId && activeBidGenerateTaskId && session
    ? `${session.enterpriseId}:${routeProjectId}:${activeBidGenerateTaskId}`
    : null;
  const routeAgentTaskId = routeAgentRun?.taskId;
  useEffect(() => {
    if (authState !== 'authenticated' || localPreviewActive || !routeProjectId || loadingProjectId === routeProjectId) return;
    const projectId = routeProjectId;
    let stopped = false;
    let refreshing = false;
    const refresh = async () => {
      if (stopped || refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        await refreshProjectDeliverables(projectId, { task_id: routeAgentTaskId ?? '', occurred_at: undefined });
      } catch {
        // A background read failure never turns a completed task into a failed task.
        // The explicit refresh path retains its actionable error/retry feedback.
      } finally { refreshing = false; }
    };
    const onFocus = () => { void refresh(); };
    const timer = window.setInterval(onFocus, 30_000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [authState, localPreviewActive, loadingProjectId, refreshProjectDeliverables, routeAgentTaskId, routeProjectId]);
  const routeTenderNoticeId = routeProjectId
    ? projectData[routeProjectId]?.tenderNotices.reduce<number | undefined>((latest, notice) => (
        notice.status === 1 && (latest === undefined || notice.tender_notice_id > latest)
          ? notice.tender_notice_id
          : latest
      ), undefined)
    : undefined;

  useEffect(() => {
    const pending = pendingGenerationEditorNavigationRef.current;
    if (!pending) return;
    if (!routeProjectId || routeProjectId !== pending.projectId) {
      pendingGenerationEditorNavigationRef.current = null;
      return;
    }
    if (route.name === 'project-overview') {
      pending.hasReachedOverview = true;
    } else if (pending.hasReachedOverview) {
      // Once the safe progress page has been shown, respect any later manual
      // navigation instead of unexpectedly pulling the user into an editor.
      pendingGenerationEditorNavigationRef.current = null;
      return;
    }

    const data = projectData[pending.projectId];
    const matchingRun = data?.agentRun?.taskId === pending.taskId ? data.agentRun : undefined;
    if (matchingRun && ['cancelled', 'failed', 'incomplete'].includes(matchingRun.completion)) {
      pendingGenerationEditorNavigationRef.current = null;
      return;
    }
    const target = data && findTaskDeliverableEditorTarget(
      data.deliverables,
      data.deliverableVersions,
      pending.taskId,
    );
    if (!target) return;

    pendingGenerationEditorNavigationRef.current = null;
    setTaskDrawerProjectId(null);
    navigate(deliverableEditorPath(
      pending.projectId,
      target.deliverableId,
      target.versionId,
    ), { replace: true });
  }, [projectData, route.name, routeProjectId]);

  useEffect(() => {
    if (authState !== 'authenticated'
      || localPreviewActive
      || !routeProjectId
      || !routeAgentTaskId
      || !session) return undefined;

    const projectId = routeProjectId;
    const taskId = routeAgentTaskId;
    const tenantGeneration = tenantGuardRef.current.capture();
    const controller = new AbortController();
    const subscription = { projectId, taskId };
    agentStreamOpenRef.current = subscription;
    let lastSeq = Math.max(0, ...(projectDataRef.current[projectId]?.agentRun?.conversation.map((message) => message.seq) ?? [0]));

    setProjectData((current) => {
      const existing = current[projectId];
      if (!existing?.agentRun || existing.agentRun.taskId !== taskId) return current;
      return {
        ...current,
        [projectId]: {
          ...existing,
          agentRun: { ...existing.agentRun, streamState: 'connecting' },
        },
      };
    });

    void backendApi.agent.stream(projectId, taskId, {
      since: lastSeq,
      signal: controller.signal,
      onMessage: (message) => {
        if (controller.signal.aborted
          || !tenantGuardRef.current.isCurrent(tenantGeneration)
          || routeProjectIdRef.current !== projectId) return;
        lastSeq = Math.max(lastSeq, message.seq);
        setProjectData((current) => {
          const existing = current[projectId];
          if (!existing?.agentRun || existing.agentRun.taskId !== taskId) return current;
          return {
            ...current,
            [projectId]: {
              ...existing,
              agentRun: mergeAgentStreamMessage(existing.agentRun, message),
            },
          };
        });
      },
    }).then((end) => {
      if (agentStreamOpenRef.current === subscription) agentStreamOpenRef.current = null;
      if (controller.signal.aborted || !tenantGuardRef.current.isCurrent(tenantGeneration)) return;
      setProjectData((current) => {
        const existing = current[projectId];
        if (!existing?.agentRun || existing.agentRun.taskId !== taskId) return current;
        return {
          ...current,
          [projectId]: {
            ...existing,
            agentRun: applyAgentStreamEnd(existing.agentRun, {
              action_list: end.actionList,
              error: end.error,
              outcome: end.outcome,
              reason: end.reason,
              session_id: end.sessionId,
              status: end.status,
            }),
          },
        };
      });
      taskSnapshotRequestRef.current.delete(projectId);
      void loadProject(projectId);
    }).catch(() => {
      if (agentStreamOpenRef.current === subscription) agentStreamOpenRef.current = null;
      if (controller.signal.aborted || !tenantGuardRef.current.isCurrent(tenantGeneration)) return;
      setProjectData((current) => {
        const existing = current[projectId];
        if (!existing?.agentRun || existing.agentRun.taskId !== taskId) return current;
        return {
          ...current,
          [projectId]: {
            ...existing,
            agentRun: { ...existing.agentRun, streamState: 'fallback' },
          },
        };
      });
    });

    return () => {
      if (agentStreamOpenRef.current === subscription) agentStreamOpenRef.current = null;
      controller.abort();
    };
  }, [
    agentStreamRefresh,
    authState,
    loadProject,
    localPreviewActive,
    routeAgentTaskId,
    routeProjectId,
    session,
  ]);

  useEffect(() => {
    if (authState !== 'authenticated'
      || localPreviewActive
      || !routeProjectId
      || !routeAgentTaskId
      || (routeAgentRun?.completion !== 'active' && !sendingAgentMessage)) return undefined;
    const projectId = routeProjectId;
    const taskId = routeAgentTaskId;
    const generation = tenantGuardRef.current.capture();
    let polling = false;
    let disposed = false;
    let terminalProjectReloaded = false;
    const refresh = async (reconnect = false) => {
      if (polling) return;
      polling = true;
      try {
        const status = await backendApi.agent.status(projectId, taskId);
        const questions = await backendApi.agent.questions(projectId, taskId)
          .catch(() => status.customer);
        if (disposed || !tenantGuardRef.current.isCurrent(generation)
          || routeProjectIdRef.current !== projectId) return;
        const polledCompletion = createAgentRunViewModel(status, {
          projectId,
          questions,
        }).completion;
        setProjectData((current) => {
          const existing = current[projectId];
          if (!existing?.agentRun || existing.agentRun.taskId !== taskId) return current;
          return {
            ...current,
            [projectId]: {
              ...existing,
              agentRun: createAgentRunViewModel(status, {
                projectId,
                questions,
                conversation: existing.agentRun.conversation,
                previousRun: existing.agentRun,
                streamState: existing.agentRun.streamState,
              }),
            },
          };
        });
        if (reconnect && !agentStreamOpenRef.current) setAgentStreamRefresh((current) => current + 1);
        if (shouldReloadProjectAfterAgentPoll(
          routeAgentRun?.completion ?? 'active',
          polledCompletion,
          terminalProjectReloaded,
        )) {
          terminalProjectReloaded = true;
          taskSnapshotRequestRef.current.delete(projectId);
          await loadProject(projectId);
        }
      } catch (error) {
        if (!disposed && tenantGuardRef.current.isCurrent(generation)) {
          setProjectResourceErrors((current) => ({
            ...current,
            [projectId]: {
              ...current[projectId],
              agent: readableError(error, 'BidVolt 主会话状态刷新失败'),
            },
          }));
        }
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 8_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [
    authState,
    loadProject,
    localPreviewActive,
    routeAgentRun?.completion,
    sendingAgentMessage,
    routeAgentTaskId,
    routeProjectId,
  ]);

  useEffect(() => {
    if (authState !== 'authenticated'
      || localPreviewActive
      || !routeProjectId
      || !routeGenerationTaskId
      || !routeGenerationAwaitingDeliverables
      || routeHasDeliverableVersions
      || routeDeliverablesError) return undefined;

    const projectId = routeProjectId;
    const generation = tenantGuardRef.current.capture();
    let attempt = 0;
    let stopped = false;
    let timer: number | undefined;

    const schedule = () => {
      timer = window.setTimeout(() => void refresh(), DELIVERABLE_SYNC_INTERVAL_MS);
    };
    const refresh = async () => {
      if (stopped) return;
      attempt += 1;
      try {
        const found = await refreshProjectDeliverables(projectId, {
          occurred_at: routeLatestGenerationTask?.occurred_at,
          task_id: routeGenerationTaskId,
        });
        if (stopped || !tenantGuardRef.current.isCurrent(generation)
          || routeProjectIdRef.current !== projectId || found) return;
      } catch {
        if (stopped || !tenantGuardRef.current.isCurrent(generation)) return;
      }
      if (attempt < DELIVERABLE_SYNC_MAX_ATTEMPTS) {
        schedule();
        return;
      }
      setProjectResourceErrors((current) => ({
        ...current,
        [projectId]: {
          ...current[projectId],
          deliverables: '生成任务已结束，但成果版本同步超时，请重试',
        },
      }));
    };

    schedule();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    authState,
    localPreviewActive,
    refreshProjectDeliverables,
    routeDeliverablesError,
    routeGenerationAwaitingDeliverables,
    routeGenerationTaskId,
    routeHasDeliverableVersions,
    routeLatestGenerationTask?.occurred_at,
    routeProjectId,
  ]);

  useEffect(() => {
    if (authState !== 'authenticated'
      || localPreviewActive
      || route.name !== 'project-materials'
      || !routeProjectId) return undefined;
    const currentMaterials = projectData[routeProjectId]?.materials ?? [];
    const hasParsingTenderMaterial = currentMaterials.some((material) =>
      material.purpose === 'current_tender'
      && (material.parseStatus === 'queued' || material.parseStatus === 'parsing'));
    if (!hasParsingTenderMaterial) return undefined;

    let refreshing = false;
    const timer = window.setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      void refreshProjectMaterials(routeProjectId).catch(() => undefined).finally(() => {
        refreshing = false;
      });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [
    authState,
    localPreviewActive,
    projectData,
    refreshProjectMaterials,
    route.name,
    routeProjectId,
  ]);

  useEffect(() => {
    if (authState !== 'authenticated'
      || localPreviewActive
      || !routeProjectId
      || routeTenderNoticeId === undefined) return undefined;
    const controller = new AbortController();
    const generation = tenantGuardRef.current.capture();
    void pollTenderImport(
      routeProjectId,
      String(routeTenderNoticeId),
      generation,
      tenantGuardRef.current,
      async (projectId, job) => {
        await refreshProjectMaterials(projectId);
        if (!tenantGuardRef.current.isCurrent(generation)) return;
        setProjectData((current) => {
          const existing = current[projectId];
          if (!existing) return current;
          return {
            ...current,
            [projectId]: {
              ...existing,
              tenderNotices: existing.tenderNotices.map((notice) => (
                notice.tender_notice_id === job.tender_notice_id ? job : notice
              )),
            },
          };
        });
      },
      setStatusMessage,
      controller.signal,
    );
    return () => controller.abort();
  }, [
    authState,
    localPreviewActive,
    refreshProjectMaterials,
    routeProjectId,
    routeTenderNoticeId,
  ]);

  useEffect(() => {
    if (authState !== 'authenticated'
      || localPreviewActive
      || !routeProjectId
      || !activeBidGenerateTaskId
      || !activeTaskStreamKey) {
      setTaskStreamConnection((current) => current.key === null && current.status === 'idle'
        ? current
        : { key: null, status: 'idle' });
      return undefined;
    }

    const projectId = routeProjectId;
    const taskId = activeBidGenerateTaskId;
    const streamKey = activeTaskStreamKey;
    const tenantGeneration = tenantGuardRef.current.capture();
    const controller = new AbortController();
    setTaskStreamConnection({ key: streamKey, status: 'connecting' });

    const isCurrentSubscription = () =>
      !controller.signal.aborted
      && tenantGuardRef.current.isCurrent(tenantGeneration)
      && routeProjectIdRef.current === projectId;

    void backendApi.tasks.stream(taskId, {
      signal: controller.signal,
      onUpdate: (update) => {
        if (!isCurrentSubscription() || update.taskId !== taskId) return;
        const previous = taskEventsRef.current[projectId] ?? [];
        const next = mergeTaskStreamUpdate(previous, update, {
          projectId,
          // The backend sends a terminal progress frame immediately before the
          // terminal event. Keep the task subscribed until GET /tasks/{id}
          // confirms that terminal state.
          holdTerminalStatus: isTerminalTaskStreamUpdate(update),
        });
        if (next !== previous) {
          taskEventsRef.current[projectId] = next;
          setProjectData((current) => {
            const existing = current[projectId];
            if (!existing) return current;
            return { ...current, [projectId]: { ...existing, tasks: next } };
          });
        }
        setTaskStreamConnection((current) => current.key === streamKey
          ? { key: streamKey, status: 'connected' }
          : current);
      },
    }).then(async (terminal) => {
      if (!isCurrentSubscription() || terminal.taskId !== taskId) return;
      const detail = await backendApi.tasks.get(taskId, { signal: controller.signal });
      if (!isCurrentSubscription() || String(detail.task_id) !== taskId) return;

      const previous = taskEventsRef.current[projectId] ?? [];
      const existing = previous.find((event) =>
        event.task_id === taskId && event.project_id === projectId);
      if (existing) {
        const converged = adaptBackendTaskEvent(detail, {
          projectId,
          sequence: existing.sequence,
        });
        const next = previous.map((event) => event === existing ? converged : event);
        taskEventsRef.current[projectId] = next;
        setProjectData((current) => {
          const project = current[projectId];
          if (!project) return current;
          return { ...current, [projectId]: { ...project, tasks: next } };
        });
      }
      await loadProject(projectId);
    }).catch(() => {
      if (controller.signal.aborted || !tenantGuardRef.current.isCurrent(tenantGeneration)) return;
      // A transport/protocol failure falls back to the existing truthful GET
      // polling. It never invents intermediate progress.
      setTaskStreamConnection((current) => current.key === streamKey
        ? { key: streamKey, status: 'fallback' }
        : current);
    });

    return () => controller.abort();
  }, [
    activeBidGenerateTaskId,
    activeTaskStreamKey,
    authState,
    loadProject,
    localPreviewActive,
    routeProjectId,
  ]);

  const hasActiveTasks = routeTaskEvents.some((event) => isActiveTaskStatus(event.status));
  const hasOtherActiveTasks = routeTaskEvents.some((event) =>
    isActiveTaskStatus(event.status) && event.task_id !== activeBidGenerateTaskId);
  const taskPollingIntervalMs = resolveTaskPollingInterval({
    hasActiveBidGenerateTask: Boolean(activeBidGenerateTaskId),
    hasActiveTasks,
    hasOtherActiveTasks,
    localPreviewActive,
    streamMatchesActiveTask: Boolean(activeTaskStreamKey
      && taskStreamConnection.key === activeTaskStreamKey),
    streamStatus: taskStreamConnection.status,
  });
  useEffect(() => {
    if (!routeProjectId || taskPollingIntervalMs === null) return undefined;
    const timer = window.setInterval(() => {
      const generation = tenantGuardRef.current.capture();
      void refreshTaskEvents(routeProjectId).then((enteredTerminalState) => {
        if (enteredTerminalState && tenantGuardRef.current.isCurrent(generation)) {
          return loadProject(routeProjectId);
        }
        return undefined;
      }).catch((error) => {
        if (tenantGuardRef.current.isCurrent(generation)) {
          setProjectResourceErrors((current) => ({
            ...current,
            [routeProjectId]: {
              ...current[routeProjectId],
              tasks: readableError(error, '任务进度刷新失败'),
            },
          }));
          setError(error, '任务进度刷新失败');
        }
      });
    }, taskPollingIntervalMs);
    return () => window.clearInterval(timer);
  }, [loadProject, refreshTaskEvents, routeProjectId, setError, taskPollingIntervalMs]);

  const pageMeta = useMemo(() => pageMetadata(route.name), [route.name]);
  useEffect(() => {
    document.title = `${pageMeta.title} · ${PRODUCT_NAME}`;
    document.getElementById('main-content')?.focus();
  }, [pageMeta.title, routeProjectId]);

  const handleLogin = async ({ email, password, remember }: LoginCredentials) => {
    setLocalPreviewActive(false);
    becomeAnonymous();
    setAuthSubmitting(true);
    setLoginError('');
    const generation = tenantGuardRef.current.capture();
    try {
      const tokens = await backendApi.auth.login({ email, password });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      saveBackendSession(tokens, { remember });
      if (!await establishSession(undefined, generation)) return;
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      navigate('/projects', { replace: true });
    } catch (error) {
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      clearBackendSession();
      setLoginError(readableError(error, '登录失败，请检查账号和密码。'));
    } finally {
      tenantGuardRef.current.commit(generation, () => setAuthSubmitting(false));
    }
  };

  const handleRegister = async ({ email, enterpriseName, password }: RegisterCredentials) => {
    setLocalPreviewActive(false);
    becomeAnonymous();
    setAuthSubmitting(true);
    setLoginError('');
    const generation = tenantGuardRef.current.capture();
    try {
      const tokens = await backendApi.auth.register({ email, enterprise_name: enterpriseName, password });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      saveBackendSession(tokens, { enterpriseName, remember: true });
      if (!await establishSession(undefined, generation)) return;
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      navigate('/projects', { replace: true });
    } catch (error) {
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      clearBackendSession();
      setLoginError(readableError(error, '注册失败，请检查填写内容。'));
    } finally {
      tenantGuardRef.current.commit(generation, () => setAuthSubmitting(false));
    }
  };

  const blockLocalPreviewWrite = (action: string) => {
    const error = localPreviewWriteError(action);
    setStatusMessage({ tone: 'error', text: error.message });
    return error;
  };

  const handleOpenLocalPreview = async () => {
    if (localPreviewLoadRef.current) return;
    if (!isLocalPreviewAvailable() || !loadLocalPreviewPayload) {
      setLoginError('本地预览仅能在 localhost 的 local-preview 开发模式中使用。');
      return;
    }
    localPreviewLoadRef.current = true;
    setAuthSubmitting(true);
    setLoginError('');
    let preview: LocalPreviewPayload;
    try {
      preview = await loadLocalPreviewPayload();
    } catch {
      setLoginError('本地只读预览快照加载失败，请重新启动开发服务。');
      setAuthSubmitting(false);
      localPreviewLoadRef.current = false;
      return;
    }
    if (!isLocalPreviewAvailable()) {
      setAuthSubmitting(false);
      localPreviewLoadRef.current = false;
      return;
    }
    clearBackendSession();
    clearTenantDomainState();
    localPreviewPayloadRef.current = preview;
    setLocalPreviewProjectId(preview.LOCAL_PREVIEW_PROJECT_ID);
    taskEventsRef.current[preview.LOCAL_PREVIEW_PROJECT_ID] = preview.localPreviewTasks;
    setLocalPreviewActive(true);
    setSession(preview.localPreviewSession);
    setProjects([preview.localPreviewProject]);
    setProjectsTotal(1);
    setEnterpriseAssets(preview.localPreviewEnterpriseAssets);
    setEnterpriseCategories(preview.localPreviewEnterpriseCategories);
    setEnterpriseDataState('ready');
    setReviewProviders(preview.localPreviewProviders);
    setProjectData({
      [preview.LOCAL_PREVIEW_PROJECT_ID]: {
        deliverables: preview.localPreviewDeliverables,
        deliverableVersions: {},
        materials: preview.localPreviewMaterials,
        quote: preview.localPreviewQuote,
        quoteSamples: preview.localPreviewQuoteSamples,
        requirements: preview.localPreviewRequirements,
        reviewRun: preview.localPreviewReview,
        snapshots: preview.localPreviewSnapshots,
        tenderNotices: [],
        tasks: preview.localPreviewTasks,
      },
    });
    setStatusMessage(null);
    setAuthState('authenticated');
    setAuthSubmitting(false);
    localPreviewLoadRef.current = false;
    navigate('/projects', { replace: true });
  };

  const handleLogout = async () => {
    if (localPreviewActive) {
      setLocalPreviewActive(false);
      becomeAnonymous();
      navigate('/login', { replace: true });
      return;
    }
    const refreshToken = getBackendRefreshToken();
    const logoutRequest = refreshToken
      ? backendApi.auth.logout(refreshToken).catch(() => undefined)
      : Promise.resolve();
    becomeAnonymous();
    navigate('/login', { replace: true });
    await logoutRequest;
  };

  const handleCreateProject = async (project: ProjectSummary) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('新增项目');
    const generation = tenantGuardRef.current.capture();
    const created = await backendApi.projects.create({
      name: project.title,
      note: updateProjectMetadata(project.note, { authorName: project.authorName }),
    });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    tenantGuardRef.current.commit(generation, () => {
      setProjects((current) => upsertProjectSummary(current, adaptBackendProject(created)));
      setProjectsTotal((current) => current + 1);
      navigate(`/projects/${encodeURIComponent(String(created.project_id))}/materials`);
    });
  };

  const handleArchiveProject = async (projectId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('归档项目');
    const generation = tenantGuardRef.current.capture();
    await backendApi.projects.archive(projectId);
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    tenantGuardRef.current.commit(generation, () => {
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setProjectsTotal((current) => Math.max(0, current - 1));
    });
  };

  const handleUpdateProjectDetails = async (
    projectId: string,
    patch: { title?: string; packageNo?: string; deadline?: string },
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('修改项目信息');
    const generation = tenantGuardRef.current.capture();
    const current = await backendApi.projects.get(projectId);
    if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('登录已切换，请重新打开项目。');
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('项目名称不能为空。');
    const deadline = patch.deadline === undefined ? undefined : toIsoOrNull(patch.deadline);
    if (patch.deadline?.trim() && !deadline) throw new Error('截止时间格式无效。');
    const updated = await backendApi.projects.update(projectId, {
      ...(patch.title === undefined ? {} : { name: patch.title.trim() }),
      ...(deadline === undefined ? {} : { deadline }),
      ...(patch.packageNo === undefined ? {} : {
        note: updateProjectMetadata(current.note, { packageNo: patch.packageNo }),
      }),
    });
    if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('登录已切换，请重新打开项目。');
    projectIdentityRevisionRef.current[projectId] = (projectIdentityRevisionRef.current[projectId] ?? 0) + 1;
    setProjects((items) => upsertProjectSummary(items, adaptBackendProject(updated)));
  };

  const notifyBidVoltLifecycle = (projectId: string, message: string) => {
    const taskId = projectDataRef.current[projectId]?.agentRun?.taskId;
    return sendBidVoltLifecycleMessage(backendApi.agent, {
      message,
      projectId,
      ...(taskId ? { taskId } : {}),
    });
  };

  const handleEnterpriseUpload = async (files: File[]) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('上传企业资料');
    const generation = tenantGuardRef.current.capture();
    const result = await backendApi.files.upload({ target: 'enterprise', files });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcome = readUploadOutcome(result.files);
    const records = buildEnterpriseUploadRecords(result.files);
    const uploadedIds = outcome.uploaded.map((file) => file.file_id);
    const outcomeError = uploadOutcomeError('企业资料', uploadedIds.length, outcome.errors);
    if (uploadedIds.length > 0) tenantGuardRef.current.commit(generation, () => {
      setStatusMessage({
        tone: 'info',
        text: `已受理 ${uploadedIds.length} 份企业资料，服务端已自动入库${uploadExpansionMessage(outcome)}。`,
      });
    });
    if (uploadedIds.length > 0) {
      refreshEnterpriseAfterUpload(loadEnterprise, (error) => {
        if (!tenantGuardRef.current.isCurrent(generation)) return;
        setStatusMessage({
          tone: 'info',
          text: `企业资料已受理；资料列表暂未刷新，请稍后手动刷新（${readableError(error, '列表刷新失败')}）。`,
        });
      });
    }
    return {
      message: outcomeError?.message
        ?? '企业资料已受理，可关闭窗口并在页面查看本次上传记录。',
      records,
      type: outcomeError ? 'error' as const : 'success' as const,
    };
  };

  const handleEnterpriseUploadFromWorkspace = async (
    projectId: string,
    files: File[],
  ): Promise<EnterpriseUploadResult | void> => {
    const lifecycleGeneration = tenantGuardRef.current.capture();
    const baselineAssetIds = enterpriseAssets.map((asset) => asset.id);
    const result = await handleEnterpriseUpload(files);
    if (!result) return undefined;
    const acceptedRecords = result.records.filter((record) => record.status === 'accepted');
    if (acceptedRecords.length === 0) throw new Error(result.message);
    const newRecords = acceptedRecords.filter((record) => record.duplicate !== true);
    const allAcceptedRecordsAreDuplicates = newRecords.length === 0;
    if (newRecords.length > 0) {
      const assetIds = newRecords.flatMap((record) => record.assetId ? [record.assetId] : []);
      const target: EnterpriseUploadLifecycleTarget = {
        assetIds,
        baselineAssetIds,
        expectedNewAssetCount: assetIds.length > 0
          ? assetIds.length
          : newRecords.reduce((count, record) => (
              count + Math.max(1, record.expanded?.imported ?? 0)
            ), 0),
        uploadedFileNames: newRecords.map((record) => record.fileName),
      };
      void waitForEnterpriseUploadLifecycle({
        isCurrent: () => tenantGuardRef.current.isCurrent(lifecycleGeneration),
        loadAssets: backendApi.enterprise.listAssets,
        target,
      }).then(async (resolution) => {
        if (!resolution || !tenantGuardRef.current.isCurrent(lifecycleGeneration)) return;
        await loadEnterprise().catch(() => undefined);
        if (!tenantGuardRef.current.isCurrent(lifecycleGeneration)) return;
        try {
          await notifyBidVoltLifecycle(
            projectId,
            enterpriseUploadLifecycleMessage(target, resolution),
          );
        } catch (error) {
          if (tenantGuardRef.current.isCurrent(lifecycleGeneration)) {
            setStatusMessage({
              tone: 'info',
              text: `企业资料已完成处理，但 BidVolt 上下文通知失败；请在对话框中补充说明。${readableError(error, '')}`,
            });
          }
        }
      });
    }
    return {
      assetIds: newRecords.flatMap((record) => record.assetId ? [record.assetId] : []),
      expectedNewAssetCount: newRecords.length,
      message: result.type === 'error'
        ? `${result.message}；已成功受理的文件将继续在后台处理。`
        : allAcceptedRecordsAreDuplicates
          ? '后端已识别为已有资料，无需重复入库。'
          : '文件已上传，后台正在解析并同步企业资料库。',
      status: allAcceptedRecordsAreDuplicates ? 'accepted' : 'processing',
    };
  };

  const handleCorrectEnterpriseFact = async (assetId: string, factId: string, value: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('修改企业资料字段');
    const generation = tenantGuardRef.current.capture();
    await backendApi.enterprise.updateFact(factId, {
      fact_value: value,
      confirmed: true,
      note: `企业资料 ${assetId} 人工纠正`,
    });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    try {
      return await loadEnterpriseAssetDetail(assetId);
    } catch (error) {
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      setStatusMessage({
        tone: 'info',
        text: `字段已保存，但最新版本信息暂未刷新（${readableError(error, '详情刷新失败')}）。`,
      });
      return undefined;
    }
  };

  const loadEnterpriseAssetPreview = useCallback(async (
    fileId: string,
    fileName: string,
  ): Promise<EnterpriseAssetPreview> => {
    const extension = fileName.split('.').at(-1)?.toLocaleLowerCase() ?? '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)) {
      const blob = await backendApi.files.download(fileId);
      const imageMimeByExtension: Record<string, string> = {
        bmp: 'image/bmp',
        gif: 'image/gif',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      return {
        blob,
        kind: 'image',
        mimeType: blob.type.startsWith('image/')
          ? blob.type
          : imageMimeByExtension[extension] ?? 'application/octet-stream',
      };
    }
    if (extension === 'pdf') {
      const blob = await backendApi.files.download(fileId);
      return {
        blob,
        kind: 'pdf',
        mimeType: blob.type === 'application/pdf' ? blob.type : 'application/pdf',
      };
    }
    if (extension === 'html' || extension === 'htm') {
      return loadHtmlAssetPreview(fileId, backendApi.files.download);
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'md', 'ofd'].includes(extension)) {
      const blocks = await backendApi.files.blocksAll(fileId);
      return {
        kind: 'text',
        blocks: blocks.flatMap((block) => {
          const text = block.text?.trim();
          return text ? [{
            id: String(block.block_id),
            pageNo: block.page_no ?? undefined,
            text,
          }] : [];
        }),
      };
    }
    return {
      kind: 'unsupported',
      message: '当前格式暂不支持在线预览，请下载原文件查看。',
    };
  }, []);

  const loadProjectResourcePreview = useCallback(async (
    fileId: string,
    fileName: string,
  ): Promise<EnterpriseAssetPreview> => {
    const extension = fileName.split('.').at(-1)?.toLocaleLowerCase() ?? '';
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
      const blob = await backendApi.files.download(fileId);
      return {
        blob,
        kind: 'office',
        mimeType: blob.type || 'application/octet-stream',
      };
    }
    return loadEnterpriseAssetPreview(fileId, fileName);
  }, [loadEnterpriseAssetPreview]);

  const downloadEnterpriseAssetFile = useCallback(async (fileId: string, fileName: string) => {
    const blob = await backendApi.files.download(fileId);
    downloadBlob(blob, fileName);
  }, []);

  const handleProjectUpload = async (
    projectId: string,
    files: File[],
    options: {
      documentRole?: 'current_tender' | 'supplemental' | 'completed_bid';
      outcomeLabel?: string;
    } = {},
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('上传项目材料');
    const generation = tenantGuardRef.current.capture();
    const result = await backendApi.files.upload({
      target: 'project',
      project_id: projectId,
      files,
      ...(options.documentRole ? { document_role: options.documentRole } : {}),
    });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcome = readUploadOutcome(result.files);
    const { uploaded } = outcome;
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const refreshedMaterials = uploaded.length > 0
      ? await refreshProjectMaterials(projectId)
      : undefined;
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcomeError = uploadOutcomeError(
      options.outcomeLabel ?? '当前项目材料',
      uploaded.length,
      outcome.errors,
    );
    if (outcomeError) throw outcomeError;
    if (options.documentRole && refreshedMaterials) {
      const expectedPurpose = options.documentRole;
      const uploadedIds = new Set(uploaded.map((file) => String(file.file_id)));
      const hasRoleMismatch = refreshedMaterials.some((material) => (
        uploadedIds.has(material.id) && material.purpose !== expectedPurpose
      ));
      if (hasRoleMismatch) {
        throw new Error(
          `${options.outcomeLabel ?? '项目材料'}未保存到所选分类：相同内容已存在于当前项目的其他分类，后端暂不支持修改材料用途。`,
        );
      }
    }
    return uploaded;
  };

  const handleProjectSupplementalUpload = async (projectId: string, files: File[]) => {
    await handleProjectUpload(projectId, files, {
      documentRole: 'supplemental',
      outcomeLabel: '补充资料',
    });
  };

  const handleCompletedBidUpload = async (projectId: string, files: File[]) => {
    await handleProjectUpload(projectId, files, {
      documentRole: 'completed_bid',
      outcomeLabel: '已完成标书',
    });
  };

  const handleCurrentTenderUpload = async (projectId: string, files: File[]) => {
    await handleProjectUpload(projectId, files, {
      documentRole: 'current_tender',
      outcomeLabel: '当前招标材料',
    });
  };

  const handleImportTenderNoticeUrl = async (projectId: string, url: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('导入招标公告网址');
    const generation = tenantGuardRef.current.capture();
    let job: TenderNoticeImportJob;
    try {
      job = await backendApi.tenderNotices.importFromUrl(projectId, url);
    } catch (error) {
      throw new Error(
        tenderNoticeImportErrorMessage(error, '招标公告网址导入失败。'),
        { cause: error },
      );
    }
    if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('会话已切换，已忽略旧企业的导入结果。');
    if (job.status === 2) {
      await refreshProjectMaterials(projectId);
      return { status: 'completed' as const, message: '导入完成，招标公告已加入当前项目材料。' };
    }
    if (job.status === 3) {
      throw new Error(job.error_message || '招标公告网址解析失败。');
    }
    tenantGuardRef.current.commit(generation, () => {
      setProjectData((current) => {
        const existing = current[projectId];
        if (!existing) return current;
        const tenderNotices = [
          job,
          ...existing.tenderNotices.filter((notice) => (
            notice.tender_notice_id !== job.tender_notice_id
          )),
        ];
        return {
          ...current,
          [projectId]: { ...existing, tenderNotices },
        };
      });
    });
    return { status: 'queued' as const, message: '网址已提交，正在下载并解析招标公告。' };
  };

  const handleRemoveProjectMaterial = async (projectId: string, fileId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('删除项目材料');
    const generation = tenantGuardRef.current.capture();
    await backendApi.files.remove(fileId);
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    setProjectData((current) => {
      const existing = current[projectId];
      if (!existing) return current;
      return {
        ...current,
        [projectId]: {
          ...existing,
          materials: existing.materials.filter((material) => String(material.id) !== String(fileId)),
        },
      };
    });
  };

  const handleConfirmRequirement = async (projectId: string, requirementId: string) => {
    if (localPreviewActive) {
      blockLocalPreviewWrite('确认招标要求');
      return;
    }
    const requirement = projectData[projectId]?.requirements.find((item) => item.id === requirementId);
    if (!requirement) throw new Error('未找到需要确认的 Requirement。');
    const generation = tenantGuardRef.current.capture();
    try {
      await backendApi.requirements.confirm(projectId, requirementId, {
        confirmed: true,
        expected_revision: requirement.revisionNo,
      });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await loadProject(projectId);
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({ tone: 'info', text: '招标要求已按当前版本确认。' });
      });
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setError(error, '招标要求确认失败');
        throw error;
      }
    }
  };

  const handleCorrectRequirement = async (
    projectId: string,
    requirementId: string,
    content: string,
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('纠正招标要求');
    const requirement = projectData[projectId]?.requirements.find((item) => item.id === requirementId);
    if (!requirement) throw new Error('未找到需要纠正的 Requirement。');
    const generation = tenantGuardRef.current.capture();
    try {
      await backendApi.requirements.correct(projectId, requirementId, {
        content,
        expected_revision: requirement.revisionNo,
      });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await loadProject(projectId);
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({ tone: 'info', text: '招标要求纠正已保存，并生成了新的 Requirement 版本。' });
      });
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setError(error, '招标要求纠正失败');
        throw error;
      }
    }
  };

  const handleOpenSnapshot = async (projectId: string, snapshotId: string) => {
    if (localPreviewActive) {
      setSnapshotDetail({
        id: snapshotId,
        value: {
          notice: '这是本地只读界面预览，未请求后端快照详情。',
          project_id: projectId,
          snapshot_id: snapshotId,
        },
      });
      return;
    }
    const generation = tenantGuardRef.current.capture();
    try {
      const detail = await backendApi.snapshots.get(projectId, snapshotId);
      tenantGuardRef.current.commit(generation, () => {
        setSnapshotDetail({ id: snapshotId, value: detail });
      });
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) setError(error, '项目快照加载失败');
    }
  };

  const handleStartTask = async (projectId: string, mode: 'generate' | 'validate') => {
    if (localPreviewActive) throw blockLocalPreviewWrite(mode === 'generate' ? '创建成果生成任务' : '创建校核任务');
    const generation = tenantGuardRef.current.capture();
    try {
      if (mode === 'validate') {
        await backendApi.agent.preChat(
          projectId,
          '本次任务以校核当前项目中已上传的完成标书为重点；请基于招标要求核验并在必要时修订后，再完成端到端交付。',
        );
      }
      const created = await backendApi.agent.start(projectId, {
        idempotency_key: `agent-${crypto.randomUUID()}`,
        payload: {},
      });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      const agentRun = createAgentRunViewModel(created, { projectId });
      pendingAgentTaskReceiptRef.current[projectId] = agentRun.taskId;
      setProjectData((current) => {
        const existing = current[projectId];
        if (!existing) return current;
        const tasks = mergePendingAgentRunTaskReceipt(
          existing.tasks,
          agentRun,
          agentRun.taskId,
        );
        taskEventsRef.current[projectId] = tasks;
        return {
          ...current,
          [projectId]: {
            ...existing,
            agentRun,
            tasks,
          },
        };
      });
      if (mode === 'generate') {
        rememberGenerateWorkflow(projectId);
        pendingGenerationEditorNavigationRef.current = {
          hasReachedOverview: false,
          projectId,
          taskId: agentRun.taskId,
        };
        setTaskDrawerProjectId(null);
        // POST /agent-run currently guarantees a task id, but not a persisted
        // deliverable/version id. The project overview is the safe in-project
        // progress destination until a version linked by source_task_id exists.
        navigate(`/projects/${encodeURIComponent(projectId)}/overview`);
      } else {
        setTaskDrawerProjectId(projectId);
      }
      taskSnapshotRequestRef.current.delete(projectId);
      await loadProject(projectId);
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setError(error, mode === 'generate' ? '成果生成任务创建失败' : '校核任务创建失败');
        throw error;
      }
    }
  };

  const handleAssistantSend = async (projectId: string, value: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('发送项目助手消息');
    if (projectData[projectId]?.agentRun) {
      return handleSendAgentMessage(projectId, value, 'queue');
    }
    const generation = tenantGuardRef.current.capture();
    setPendingAgentMessageCount((current) => current + 1);
    try {
      const response = await backendApi.agent.preChat(projectId, value);
      if (!tenantGuardRef.current.isCurrent(generation)) {
        throw new DOMException('会话已切换，已忽略旧企业的消息回复。', 'AbortError');
      }
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({
          tone: 'info',
          text: publicAgentReply(response.reply || response.message || '') || '消息已提交。',
        });
      });
      return response;
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setStatusMessage({
          tone: isUnconfirmedAgentRequestError(error) ? 'info' : 'error',
          text: isUnconfirmedAgentRequestError(error)
            ? '连接中断，消息处理结果待确认；请勿重复发送。'
            : publicAgentReply(readableError(error, '项目助手请求失败')) || '项目助手请求失败，请稍后重试。',
        });
      }
      throw error;
    } finally {
      tenantGuardRef.current.commit(generation, () => {
        setPendingAgentMessageCount((current) => Math.max(0, current - 1));
      });
    }
  };

  const handleAnswerAgentQuestion = async (projectId: string, askId: string, answers: string[]) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('回答 BidVolt 问题');
    const run = projectData[projectId]?.agentRun;
    if (!run) throw new Error('当前项目没有可回答的 BidVolt 主会话。');
    const generation = tenantGuardRef.current.capture();
    setAnsweringAgentAskId(askId);
    try {
      const response = await backendApi.agent.answer(projectId, run.taskId, askId, answers);
      if (!tenantGuardRef.current.isCurrent(generation)) return response;
      const [status, questions] = await Promise.all([
        backendApi.agent.status(projectId, run.taskId),
        backendApi.agent.questions(projectId, run.taskId),
      ]);
      tenantGuardRef.current.commit(generation, () => {
        setProjectData((current) => {
          const existing = current[projectId];
          if (!existing?.agentRun || existing.agentRun.taskId !== run.taskId) return current;
          return {
            ...current,
            [projectId]: {
              ...existing,
              agentRun: createAgentRunViewModel(status, {
                projectId,
                questions,
                conversation: existing.agentRun.conversation,
                previousRun: existing.agentRun,
                streamState: existing.agentRun.streamState,
              }),
            },
          };
        });
        setStatusMessage({
          tone: 'info',
          text: publicAgentReply(response.reply || '') || (response.queued ? '回答已排队回传 BidVolt 主会话。' : '回答已提交。'),
        });
      });
      return response;
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) setError(error, 'BidVolt 提问回答失败');
      throw error;
    } finally {
      tenantGuardRef.current.commit(generation, () => setAnsweringAgentAskId(null));
    }
  };

  const handleSendAgentMessage = async (
    projectId: string,
    message: string,
    mode: 'queue' | 'steer',
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('发送 BidVolt 主会话消息');
    const run = projectData[projectId]?.agentRun;
    if (!run) throw new Error('当前项目没有可对话的 BidVolt 主会话。');
    const generation = tenantGuardRef.current.capture();
    const refreshClosedStream = () => {
      if (!tenantGuardRef.current.isCurrent(generation)
        || routeProjectIdRef.current !== projectId
        || projectDataRef.current[projectId]?.agentRun?.taskId !== run.taskId) return;
      const open = agentStreamOpenRef.current;
      if (open?.projectId !== projectId || open.taskId !== run.taskId) {
        setAgentStreamRefresh((current) => current + 1);
      }
    };
    // A completed task's SSE already ended. Continuing the same session does
    // not change its task id, so effect dependencies alone cannot reopen it.
    refreshClosedStream();
    setPendingAgentMessageCount((current) => current + 1);
    try {
      const response = await backendApi.agent.chat(projectId, run.taskId, { message, mode });
      if (!tenantGuardRef.current.isCurrent(generation)) {
        throw new DOMException('会话已切换，已忽略旧企业的消息回复。', 'AbortError');
      }
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({
          tone: response.returncode !== undefined && response.returncode !== 0 ? 'error' : 'info',
          text: response.returncode !== undefined && response.returncode !== 0
            ? publicAgentReply(response.message || '') || 'BidVolt 未能完成请求，请查看对话记录。'
            : publicAgentReply(response.reply || '')
              ? '已收到 BidVolt 回复。'
              : !response.queued && (response.status === 'processed' || response.returncode === 0)
                ? '本次请求已结束，但未返回有效回复。'
                : '消息已送达 BidVolt，等待处理。',
        });
      });
      return response;
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) setStatusMessage({
        tone: isUnconfirmedAgentRequestError(error) ? 'info' : 'error',
        text: isUnconfirmedAgentRequestError(error)
          ? '连接中断，消息处理结果待确认；请勿重复发送。'
          : publicAgentReply(readableError(error, 'BidVolt 主会话消息发送失败')) || '本次请求未完成，请稍后重试。',
      });
      throw error;
    } finally {
      // The first reopened stream may have observed the old terminal status
      // before /chat started working. Fetch any new sequence records after the
      // response settles, including when transport receipt was uncertain.
      refreshClosedStream();
      // Requests may overlap (for example a document-save notification and a
      // chat message). Finishing one must not clear another request's busy state.
      tenantGuardRef.current.commit(generation, () => {
        setPendingAgentMessageCount((current) => Math.max(0, current - 1));
      });
    }
  };

  const handleDownloadResponsePackage = (projectId: string): Promise<void> => {
    if (localPreviewActive) return Promise.reject(blockLocalPreviewWrite('下载最终响应文件包'));
    const generation = tenantGuardRef.current.capture();
    const key = `${generation}:${projectId}`;
    const existing = responsePackageRequestRef.current.get(key);
    if (existing) return existing;
    setDownloadingResponsePackage(true);
    // Lock synchronously for every entry point, including repeated clicks in
    // the same render. All callers observe the same real download outcome.
    const request = Promise.resolve().then(async () => {
      if (!tenantGuardRef.current.isCurrent(generation)) {
        throw new DOMException('会话已切换，已取消旧企业的下载。', 'AbortError');
      }
      const blob = await backendApi.agent.responsePackage(projectId);
      if (!tenantGuardRef.current.isCurrent(generation)) {
        throw new DOMException('会话已切换，已忽略旧企业的下载。', 'AbortError');
      }
      downloadBlob(blob, `项目-${projectId}-最终响应文件包.zip`);
    }).catch((error: unknown) => {
      if (tenantGuardRef.current.isCurrent(generation)) setError(error, '最终响应文件包下载失败');
      throw error;
    }).finally(() => {
      if (responsePackageRequestRef.current.get(key) !== request) return;
      responsePackageRequestRef.current.delete(key);
      tenantGuardRef.current.commit(generation, () => {
        setDownloadingResponsePackage(responsePackageRequestRef.current.size > 0);
      });
    });
    responsePackageRequestRef.current.set(key, request);
    return request;
  };

  const handleResumeAgentRun = async (projectId: string, taskId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('继续 BidVolt 主会话');
    const numericTaskId = Number(taskId);
    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) throw new Error('续跑任务编号无效。');
    const generation = tenantGuardRef.current.capture();
    setResumingAgentRun(true);
    try {
      const created = await backendApi.agent.start(projectId, {
        idempotency_key: `agent-resume-${crypto.randomUUID()}`,
        payload: {},
        resume_from_task_id: numericTaskId,
      });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      const agentRun = createAgentRunViewModel(created, { projectId });
      pendingAgentTaskReceiptRef.current[projectId] = agentRun.taskId;
      setProjectData((current) => {
        const existing = current[projectId];
        if (!existing) return current;
        const tasks = mergePendingAgentRunTaskReceipt(
          existing.tasks,
          agentRun,
          agentRun.taskId,
        );
        taskEventsRef.current[projectId] = tasks;
        return {
          ...current,
          [projectId]: {
            ...existing,
            agentRun,
            tasks,
          },
        };
      });
      setTaskDrawerProjectId(projectId);
      taskSnapshotRequestRef.current.delete(projectId);
      await loadProject(projectId);
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) setError(error, 'BidVolt 主会话续跑失败');
    } finally {
      tenantGuardRef.current.commit(generation, () => setResumingAgentRun(false));
    }
  };

  const handleRunReview = async (projectId: string, providerId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('执行外部评审');
    const generation = tenantGuardRef.current.capture();
    const selectedProvider = reviewProviders.find((provider) => provider.id === providerId);
    const numericProviderId = Number(selectedProvider?.id);
    if (!selectedProvider || !selectedProvider.available
      || !Number.isInteger(numericProviderId) || numericProviderId <= 0) {
      const error = new Error('所选评审机制不可用，或后端未返回有效的 Provider 编号。');
      setStatusMessage({ tone: 'error', text: error.message });
      throw error;
    }
    try {
      await backendApi.review.evaluate(projectId, { provider_id: numericProviderId });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await loadProject(projectId);
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setError(error, '评审任务执行失败');
        throw error;
      }
    }
  };

  const handleSaveSuggestion = async (projectId: string, findingId: string, suggestion: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('保存评审建议');
    const generation = tenantGuardRef.current.capture();
    const scoreId = projectData[projectId]?.score?.score_id;
    if (!scoreId) throw new Error('当前评审没有可更新的评分版本。');
    await backendApi.review.updateSuggestion(projectId, scoreId, findingId, suggestion);
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    await loadProject(projectId);
  };

  const handleConfirmReviewFinding = async (
    projectId: string,
    findingId: string,
    action: 'confirm' | 'reject',
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite(action === 'confirm' ? '确认评审建议' : '不采纳评审建议');
    const generation = tenantGuardRef.current.capture();
    const score = projectData[projectId]?.score;
    if (!score?.score_id) throw new Error('当前评审没有可确认的评分版本。');
    const result = await backendApi.review.confirmItem(projectId, score.score_id, findingId, {
      action,
      ...(score.snapshot_id === null ? {} : { expected_version: score.snapshot_id }),
    });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    await loadProject(projectId);
    if (result.status !== 'succeeded') {
      throw new Error(result.reason || (result.status === 'conflict' ? '评审快照已变化，请刷新后重试。' : '当前评审项无法确认。'));
    }
  };

  const handleConfirmReviewFindings = async (
    projectId: string,
    findingIds: string[],
    action: 'confirm' | 'reject',
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('批量确认评审建议');
    if (findingIds.length === 0) throw new Error('当前没有待确认的评审建议。');
    const generation = tenantGuardRef.current.capture();
    const score = projectData[projectId]?.score;
    if (!score?.score_id) throw new Error('当前评审没有可确认的评分版本。');
    const itemIds = findingIds.map(Number);
    if (itemIds.some((itemId) => !Number.isInteger(itemId) || itemId <= 0)) {
      throw new Error('评审建议编号无效，请刷新后重试。');
    }
    const response = await backendApi.review.confirmItems(projectId, score.score_id, {
      action,
      item_ids: itemIds,
      ...(score.snapshot_id === null ? {} : { expected_version: score.snapshot_id }),
    });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    await loadProject(projectId);
    const failures = response.results.filter((item) => item.status !== 'succeeded');
    if (failures.length > 0) {
      const firstReason = failures.find((item) => item.reason)?.reason;
      throw new Error(`有 ${failures.length} 项未完成确认${firstReason ? `：${firstReason}` : '，请刷新后重试。'}`);
    }
  };

  const handleReEvaluateReviewFindings = async (projectId: string, findingIds: string[]) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('重新评审已确认建议');
    if (findingIds.length === 0) throw new Error('请先确认至少一条评审建议。');
    const itemIds = findingIds.map(Number);
    if (itemIds.some((itemId) => !Number.isInteger(itemId) || itemId <= 0)) {
      throw new Error('评审建议编号无效，请刷新后重试。');
    }
    const generation = tenantGuardRef.current.capture();
    await backendApi.review.reEvaluate(projectId, itemIds);
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    await loadProject(projectId);
  };

  const handleApplyQuote = async (projectId: string, strategyId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('应用报价策略');
    if (strategyId !== 'win') {
      const error = new Error('当前后端 apply 接口只会应用中标优先（win）结果，平衡型和利润型暂不能安全写入成果。');
      setStatusMessage({ tone: 'error', text: error.message });
      throw error;
    }
    const generation = tenantGuardRef.current.capture();
    const data = projectData[projectId];
    const quoteDeliverable = data?.deliverables.find((item) => item.deliverable_type === 3);
    if (!data || !quoteDeliverable || !/^\d+$/.test(data.quote.id)) {
      const error = new Error('当前项目缺少可应用的报价测算或报价成果。');
      setStatusMessage({ tone: 'error', text: error.message });
      throw error;
    }
    try {
      await backendApi.quotes.strategy(data.quote.id, strategyId as 'win' | 'balance' | 'profit');
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await backendApi.quotes.apply({
        calc_id: data.quote.id,
        deliverable_id: quoteDeliverable.deliverable_id,
        expected_version_no: quoteDeliverable.current_version_no,
        idempotency_key: crypto.randomUUID(),
      });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await loadProject(projectId);
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({ tone: 'info', text: '报价策略已由服务端重算并生成新的受控报价版本。' });
      });
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) setError(error, '报价策略应用失败');
      throw error;
    }
  };

  const handleCalculateQuote = async (projectId: string, input: QuoteCalculationInput) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('执行确定性报价测算');
    const generation = tenantGuardRef.current.capture();
    const created = await backendApi.quotes.calculate({
      material_ref: input.materialRef,
      cost: input.cost,
      project_id: projectId,
      ...(input.minProfitRate === undefined ? {} : { min_profit_rate: input.minProfitRate }),
      ...(input.cap === undefined ? {} : { cap: input.cap }),
    });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    try {
      // The page presents a strategy card. Generate its deterministic `win`
      // strategy immediately after calculation so the card is backend-backed.
      await backendApi.quotes.strategy(created.calc_id, 'win');
    } finally {
      if (tenantGuardRef.current.isCurrent(generation)) await loadProject(projectId);
    }
  };

  const handleRecalculateQuote = async (projectId: string): Promise<QuoteRecalculationView> => {
    if (localPreviewActive) throw blockLocalPreviewWrite('按冻结样本复算报价');
    const calcId = projectData[projectId]?.quote.id;
    if (!calcId || !/^\d+$/.test(calcId)) throw new Error('当前项目没有可复算的后端测算编号。');
    const result = await backendApi.quotes.recalculate(calcId);
    return {
      matchesOriginal: result.matches_original,
      engineVersion: result.engine_version,
    };
  };

  const handleAiQuoteSuggestion = async (
    projectId: string,
    basis: string,
  ): Promise<QuoteAiSuggestionView> => {
    if (localPreviewActive) throw blockLocalPreviewWrite('获取 AI 报价参考区间');
    const calcId = projectData[projectId]?.quote.id;
    if (!calcId || !/^\d+$/.test(calcId)) throw new Error('当前项目没有可分析的后端测算编号。');
    const result = await backendApi.quotes.aiSuggest(calcId, basis);
    return {
      unavailable: result.unavailable === true,
      message: result.message,
      priceRange: result.price_range,
      reasons: result.reasons ?? [],
      assumptions: result.assumptions ?? [],
      confidence: result.confidence,
      riskLevel: result.risk_level,
    };
  };

  const loadEditor = useCallback(async (
    projectId: string,
    routeId: DeliverableRouteId,
    versionId: string,
  ) => {
    const generation = tenantGuardRef.current.capture();
    const data = projectData[projectId];
    const deliverable = data?.deliverables.find((item) => routeIdForDeliverable(item) === routeId);
    if (!deliverable?.current_version_no) {
      setEditor(null);
      return;
    }
    const version = versionId === 'latest' ? deliverable.current_version_no : Number(versionId);
    if (!Number.isInteger(version) || version <= 0) {
      setEditor(null);
      return;
    }
    const content = await backendApi.deliverables.getVersion(deliverable.deliverable_id, version);
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    if (version !== deliverable.current_version_no) {
      tenantGuardRef.current.commit(generation, () => {
        setEditor({
          content,
          deliverable,
          readOnlyReason: `当前打开的是历史版本 V${version}，仅支持预览和下载。请打开最新版本 V${deliverable.current_version_no} 进行编辑。`,
        });
      });
      return;
    }

    if (routeId !== 'quote' && hasUnsupportedEditorModel(content.model)) {
      tenantGuardRef.current.commit(generation, () => {
        setEditor({
          content,
          deliverable,
          readOnlyReason: '该成果包含表格、非文本节点或当前编辑器尚未识别的结构。为避免保存时破坏后端成果，已切换为只读预览；仍可下载原文件。',
        });
      });
      return;
    }

    try {
      const editorSession = await backendApi.editor.createSession(deliverable.deliverable_id);
      if (editorSession.base_version_no !== version || !editorSession.lease_token) {
        if (editorSession.lease_token) {
          await backendApi.editor.cancel(
            deliverable.deliverable_id,
            editorSession.session_id,
            editorSession.lease_token,
          ).catch(() => undefined);
        }
        tenantGuardRef.current.commit(generation, () => {
          setEditor({
            content,
            deliverable,
            readOnlyReason: '编辑会话版本或租约与当前成果不匹配，已切换为只读预览。请刷新后重试。',
          });
        });
        return;
      }
      tenantGuardRef.current.commit(generation, () => {
        setEditor({ content, deliverable, session: editorSession });
      });
    } catch (error) {
      if (!(error instanceof BackendApiError) || error.status !== 409) throw error;
      const listed = await backendApi.editor.list(deliverable.deliverable_id).catch(() => ({ items: [] }));
      const existing = listed.items.find((sessionItem) =>
        sessionItem.status === 1 && sessionItem.base_version_no === version,
      );
      const existingDetail = existing
        ? await backendApi.editor.get(deliverable.deliverable_id, existing.session_id).catch(() => undefined)
        : undefined;
      const checkpoint = existingDetail?.checkpoint;
      tenantGuardRef.current.commit(generation, () => {
        setEditor({
          content: checkpoint
            ? { ...content, model: checkpoint }
            : content,
          deliverable,
          readOnlyReason: existingDetail
            ? '该成果已有进行中的编辑会话；后端未返回可恢复租约，已加载其最近检查点并切换为只读预览。'
            : '该成果已有进行中的编辑会话，当前页面无法安全恢复租约，已切换为只读预览。',
        });
      });
    }
  }, [projectData]);

  useEffect(() => {
    if (route.name !== 'deliverable-editor' || !projectData[route.projectId]) {
      editorLoadKeyRef.current = '';
      setEditor(null);
      return;
    }
    const editorKey = `${route.projectId}:${route.deliverableId}:${route.versionId}`;
    if (editorLoadKeyRef.current === editorKey) return;
    editorLoadKeyRef.current = editorKey;
    if (localPreviewActive) {
      setEditor(localPreviewPayloadRef.current?.getLocalPreviewEditor(route.deliverableId, route.versionId) ?? null);
      return;
    }
    const generation = tenantGuardRef.current.capture();
    void loadEditor(route.projectId, route.deliverableId, route.versionId)
      .catch((error) => {
        if (!tenantGuardRef.current.isCurrent(generation)) return;
        if (editorLoadKeyRef.current === editorKey) editorLoadKeyRef.current = '';
        setError(error, '成果编辑会话创建失败');
      });
  }, [loadEditor, localPreviewActive, projectData, route, setError]);

  const editorRouteKey = route.name === 'deliverable-editor'
    ? `${route.projectId}:${route.deliverableId}:${route.versionId}`
    : '';
  useEffect(() => {
    if (!editorRouteKey) return;
    return () => {
      const activeEditor = activeEditorRef.current;
      activeEditorRef.current = null;
      editorSaveGateRef.current.reset();
      if (!activeEditor?.session?.lease_token) return;
      void backendApi.editor.cancel(
        activeEditor.deliverable.deliverable_id,
        activeEditor.session.session_id,
        activeEditor.session.lease_token,
      ).catch(() => undefined);
    };
  }, [editorRouteKey]);

  const handleSaveEditor = (payload: OfficeMockSavePayload) => {
    if (localPreviewActive) return Promise.reject(blockLocalPreviewWrite('保存成果'));
    const activeEditor = activeEditorRef.current;
    if (!activeEditor?.session?.lease_token || activeEditor.readOnlyReason) {
      return Promise.reject(new Error(activeEditor?.readOnlyReason || '编辑会话缺少有效租约，请刷新页面后重试。'));
    }
    if (Number(payload.versionId) !== activeEditor.session.base_version_no) {
      return Promise.reject(new Error('页面版本与编辑会话基础版本不一致，已阻止保存。'));
    }
    const content = toBackendEditorContent(payload) as JsonObject;
    const signature = JSON.stringify({
      content,
      deliverableId: activeEditor.deliverable.deliverable_id,
      sessionId: activeEditor.session.session_id,
    });
    const generation = tenantGuardRef.current.capture();
    return editorSaveGateRef.current.run(signature, async (idempotencyKey) => {
      await backendApi.editor.checkpoint(
        activeEditor.deliverable.deliverable_id,
        activeEditor.session!.session_id,
        {
          lease_token: activeEditor.session!.lease_token!,
          content,
        },
      );
      const completed = await backendApi.editor.complete(
        activeEditor.deliverable.deliverable_id,
        activeEditor.session!.session_id,
        {
          lease_token: activeEditor.session!.lease_token!,
          content,
          expected_version_no: activeEditor.session!.base_version_no,
          idempotency_key: idempotencyKey,
        },
      );
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      activeEditorRef.current = null;
      setEditor(null);
      let refreshFailure = '';
      try {
        await loadProject(payload.projectId);
      } catch (error) {
        if (tenantGuardRef.current.isCurrent(generation)) {
          refreshFailure = `项目数据刷新失败，请刷新页面。${readableError(error, '')}`;
        }
      }
      let notificationFailure = '';
      if (tenantGuardRef.current.isCurrent(generation)) {
        try {
          await notifyBidVoltLifecycle(
            payload.projectId,
            documentUpdatedLifecycleMessage(activeEditor.deliverable.title, completed.version_no),
          );
        } catch (error) {
          notificationFailure = `BidVolt 上下文通知失败，请在对话框中补充说明。${readableError(error, '')}`;
        }
      }
      if (tenantGuardRef.current.isCurrent(generation)) {
        const failures = [refreshFailure, notificationFailure].filter(Boolean).join('；');
        setStatusMessage({
          tone: failures ? 'error' : 'info',
          text: failures
            ? `成果已保存为 V${completed.version_no}；${failures}`
            : `成果已保存为 V${completed.version_no}，并已通知 BidVolt 使用最新版本。`,
        });
      }
      navigate(deliverableEditorPath(payload.projectId, payload.deliverableId, String(completed.version_no)), { replace: true });
    });
  };

  const downloadDeliverable = async (
    projectId: string,
    routeId: ProjectDeliverableView['id'],
    requestedVersion?: string | number,
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('下载成果文件');
    const generation = tenantGuardRef.current.capture();
    const deliverable = projectData[projectId]?.deliverables.find(
      (item) => viewIdForDeliverable(item) === routeId,
    );
    if (!deliverable?.current_version_no) throw new Error('当前成果没有可下载版本。');
    const version = requestedVersion === undefined
      ? deliverable.current_version_no
      : Number(requestedVersion);
    if (!Number.isInteger(version) || version <= 0) throw new Error('成果版本号无效，无法下载。');
    const blob = await backendApi.deliverables.downloadVersion(deliverable.deliverable_id, version);
    tenantGuardRef.current.commit(generation, () => {
      downloadBlob(blob, `${deliverable.title || routeId}-V${version}${routeId === 'quote' ? '.xlsx' : '.docx'}`);
    });
  };

  const pageApiActivity = buildPageApiActivity(
    pageApiCatalog(route),
    Object.values(backendRequestEvents),
    { preview: localPreviewActive },
  );

  if (route.name === 'landing') return <LandingPage />;
  if (authState === 'checking') return <LoadingScreen />;
  if (authState === 'anonymous' || route.name === 'login' || !session) {
    return (
      <>
        <LoginPage
          error={loginError}
          isSubmitting={authSubmitting}
          localPreviewAvailable={isLocalPreviewAvailable()}
          onLogin={handleLogin}
          onOpenLocalPreview={handleOpenLocalPreview}
          onRegister={handleRegister}
        />
        {showApiTestPanel ? (
          <ApiTestPanel className="login-api-test-panel" defaultExpanded={false}>
            <BackendApiStatusBar
              checkedAt={pageApiActivity.checkedAt}
              checks={pageApiActivity.checks}
              endpointLabel={backendApiBaseLabel}
              latencyMs={pageApiActivity.latencyMs}
              message={pageApiActivity.message}
              status={pageApiActivity.status}
            />
          </ApiTestPanel>
        ) : null}
      </>
    );
  }

  const activeProject = routeProjectId ? projects.find((project) => project.id === routeProjectId) : undefined;
  const activeData = routeProjectId ? projectData[routeProjectId] : undefined;
  const activeMaterials = activeData?.materials ?? [];
  const workspaceMaterials = toWorkspaceMaterials(activeMaterials);
  const workspaceEnterprise = toWorkspaceEnterpriseMaterials(enterpriseAssets);
  const taskEvents = routeTaskEvents;
  const activeTaskCount = taskEvents.filter((event) => isActiveTaskStatus(event.status)).length;
  const latestGenerationTask = findLatestGenerationTask(taskEvents);
  const latestSubmissionTask = findCurrentProjectSubmissionTask(taskEvents);
  const projectTasksState = !activeData || loadingProjectId === routeProjectId
    ? 'loading'
    : routeProjectId && projectResourceErrors[routeProjectId]?.tasks
      ? 'error'
      : 'ready';
  const projectReviewState = !activeData || loadingProjectId === routeProjectId
    ? 'loading'
    : routeProjectId && projectResourceErrors[routeProjectId]?.review
      ? 'error'
      : 'ready';
  const projectScoreState = !activeData || loadingProjectId === routeProjectId
    ? 'loading'
    : routeProjectId && projectResourceErrors[routeProjectId]?.score
      ? 'error'
      : 'ready';
  const projectReviewSidebar = buildProjectReviewSidebarViewModel({
    deliverables: (activeData?.deliverables ?? []).flatMap((deliverable) => {
      const kind = routeIdForDeliverable(deliverable);
      return kind ? [{ currentVersionNo: deliverable.current_version_no, kind }] : [];
    }),
    deliverablesState: !activeData || loadingProjectId === routeProjectId
      ? 'loading'
      : routeProjectId && projectResourceErrors[routeProjectId]?.deliverables
        ? 'error'
        : 'ready',
    requirements: activeData?.requirements ?? [],
    requirementsState: !activeData || loadingProjectId === routeProjectId
      ? 'loading'
      : routeProjectId && projectResourceErrors[routeProjectId]?.requirements
        ? 'error'
        : 'ready',
    tasks: taskEvents,
    tasksState: projectTasksState,
  });
  const projectOutcomeReview = buildProjectOutcomeReviewViewModel({
    reviewRunId: activeData?.reviewRun.id,
    reviewRunStatus: activeData?.reviewRun.status,
    reviewSourceState: projectReviewState,
    score: activeData?.overview?.score ? {
      ...activeData.overview.score,
      formalFileVersionUnverified: Boolean(activeData.artifacts?.some(artifact => artifact.kind !== 'zip')),
    } : undefined,
    scoreIsStale: scoreIsOutdated(activeData?.score, activeData?.deliverables ?? [],
      activeData?.invalidatedScoreId, activeData?.localOfficeChanges),
    scoreReviewRunId: activeData?.score?.review_run_id === null
      || activeData?.score?.review_run_id === undefined
      ? undefined
      : String(activeData.score.review_run_id),
    scoreSourceState: projectScoreState,
    tasks: taskEvents,
    tasksState: projectTasksState,
  });
  const deliverableCards = activeData ? adaptBackendDeliverableCards(activeData.deliverables) : undefined;
  const artifactResources = routeProjectId && activeData?.artifacts
    ? adaptArtifactResources(routeProjectId, activeData.artifacts) : undefined;
  const selectedAgentRun = shouldUseAgentRunForGenerationTask(
    latestGenerationTask,
    activeData?.agentRun,
  ) ? activeData?.agentRun : undefined;
  const generationWorkspaceRun = selectedAgentRun
    ?? (latestGenerationTask
      ? agentRunFallbackFromGenerationTask(latestGenerationTask)
      : undefined);
  const hasDeliverableVersions = Boolean(activeData?.artifacts?.some(artifact =>
    artifact.kind !== 'zip' && String(artifact.task_id) === generationWorkspaceRun?.taskId)) || hasDeliverableVersionForGenerationTask(
    activeData,
    latestGenerationTask,
    selectedAgentRun,
  );
  const baseGenerationTaskSummary: ProjectWorkflowTaskSummary | undefined = selectedAgentRun
    ? agentRunTaskSummary(selectedAgentRun)
    : latestGenerationTask ? {
        message: latestGenerationTask.public_message,
        percent: latestGenerationTask.percent,
        status: toProjectTaskStatus(latestGenerationTask.status),
        title: taskPhaseLabel(latestGenerationTask.phase),
      } : undefined;
  const generationTaskSummary: ProjectWorkflowTaskSummary | undefined = !hasDeliverableVersions
    && routeProjectId
    && projectResourceErrors[routeProjectId]?.deliverables
    && baseGenerationTaskSummary?.status === 'succeeded'
    ? {
        message: '生成任务已结束，但成果版本尚未返回。请点击页面提示中的“重试”重新同步。',
        percent: baseGenerationTaskSummary.percent,
        status: 'sync_error',
        title: '成果同步',
      }
    : baseGenerationTaskSummary;
  const generationTaskIsActive = selectedAgentRun?.completion === 'active'
    || Boolean(latestGenerationTask && isActiveTaskStatus(latestGenerationTask.status));
  const projectMaterialsState: ProjectWorkflowResourceState = !activeData
    || loadingProjectId === routeProjectId
    ? 'loading'
    : routeProjectId && projectResourceErrors[routeProjectId]?.materials
      ? 'error'
      : 'ready';
  const projectDeliverablesState: ProjectWorkflowResourceState = !activeData
    || loadingProjectId === routeProjectId
    ? 'loading'
    : routeProjectId && projectResourceErrors[routeProjectId]?.deliverables
      ? 'error'
      : 'ready';
  const tenderPreparation = summarizeTenderPreparation(activeMaterials);
  const projectWorkflowFacts: ProjectWorkflowFacts = {
    agentCompletion: selectedAgentRun?.completion,
    currentTenderMaterialCount: tenderPreparation.total,
    currentTenderMaterialState: projectMaterialsState === 'error'
      ? 'error'
      : projectMaterialsState === 'loading'
        ? 'processing'
        : tenderPreparation.state,
    deliverablesState: projectDeliverablesState,
    enterpriseMaterialCount: workspaceEnterprise.length,
    enterpriseState: enterpriseDataState,
    hasDeliverables: hasDeliverableVersions,
    materialsState: projectMaterialsState,
    task: generationTaskSummary,
    tenderImporting: Boolean(activeData?.tenderNotices.some((notice) => notice.status === 1)),
  };
  const deliverableVersionOptions = activeData
    ? buildProjectOverviewVersionOptions(
        activeData.deliverables,
        activeData.deliverableVersions,
      )
    : [];
  const deliverableVersionIds = Object.fromEntries((deliverableCards ?? [])
    .filter((item) => item.id !== 'internal' && item.versionId)
    .map((item) => [item.id, item.versionId])) as Partial<Record<DeliverableRouteId, string>>;
  const currentResourceErrorCount = routeProjectId
    ? Object.keys(projectResourceErrors[routeProjectId] ?? {}).length
    : 0;
  const deliverablesEndpoint = routeProjectId
    ? `${backendApiBaseLabel.replace(/\/+$/, '')}/deliverables?project_id=${encodeURIComponent(routeProjectId)}`
    : `${backendApiBaseLabel.replace(/\/+$/, '')}/deliverables`;
  const deliverablesRequest: DeliverablesRequestView = localPreviewActive
    ? { endpoint: deliverablesEndpoint, method: 'GET', status: 'idle' }
    : loadingProjectId === routeProjectId
      ? { endpoint: deliverablesEndpoint, method: 'GET', status: 'loading' }
      : routeProjectId && projectResourceErrors[routeProjectId]?.deliverables
        ? {
            endpoint: deliverablesEndpoint,
            errorMessage: projectResourceErrors[routeProjectId]?.deliverables,
            method: 'GET',
            status: 'error',
          }
        : activeData
          ? { endpoint: deliverablesEndpoint, method: 'GET', status: 'success' }
          : { endpoint: deliverablesEndpoint, method: 'GET', status: 'idle' };
  const backendActivityMessage = currentResourceErrorCount > 0
    ? `${pageApiActivity.message} 当前页面另有 ${currentResourceErrorCount} 组业务数据加载失败，相关区域可能保留上次成功数据。`
    : pageApiActivity.message;
  const pageDiagnostics = showApiTestPanel ? (
    <ApiTestPanel className="page-api-test-panel" defaultExpanded={false}>
      <BackendApiStatusBar
        checkedAt={pageApiActivity.checkedAt}
        checks={pageApiActivity.checks}
        endpointLabel={localPreviewActive
          ? '未调用真实 API'
          : `${backendApiBaseLabel} · 企业 #${session.enterpriseId} · ${session.user.displayName}`}
        latencyMs={pageApiActivity.latencyMs}
        message={backendActivityMessage}
        status={pageApiActivity.status}
      />
    </ApiTestPanel>
  ) : undefined;

  return (
    <>
      <AppShell
        currentProjectId={routeProjectId}
        currentRoute={route.name}
        diagnostics={pageDiagnostics}
        eyebrow={pageMeta.eyebrow}
        enterpriseName={session.enterpriseName}
        title={pageMeta.title}
        onLogout={() => void handleLogout()}
        onOpenTasks={() => routeProjectId && setTaskDrawerProjectId(routeProjectId)}
        projectSummary={activeProject}
        taskCount={activeTaskCount}
        user={session.user}
      >
      {localPreviewActive && localPreviewProjectId ? (
        <aside className="local-preview-banner" aria-label="本地只读预览状态">
          <div>
            <strong>本地只读预览 · 无真实后端</strong>
            <span>当前数据是明确标记的界面快照；未请求 API，所有写入、AI、下载操作均已阻止。</span>
          </div>
          <nav aria-label="预览页面快速导航">
            <AppLink to="/projects">项目列表</AppLink>
            <AppLink to={`/projects/${localPreviewProjectId}/overview`}>项目概览</AppLink>
            <AppLink to={`/projects/${localPreviewProjectId}/materials`}>招标材料</AppLink>
            <AppLink to={`/projects/${localPreviewProjectId}/review`}>评审中心</AppLink>
            <AppLink to={`/projects/${localPreviewProjectId}/pricing`}>报价测算</AppLink>
            <AppLink to={`/projects/${localPreviewProjectId}/deliverables/technical/versions/latest`}>成果编辑器</AppLink>
            <AppLink to="/enterprise-assets">企业资料</AppLink>
            <AppLink to="/bid-market">投标行情库</AppLink>
          </nav>
        </aside>
      ) : null}
      {route.name === 'enterprise-assets' && !localPreviewActive && imageDescribeProgress
        && shouldShowImageDescribeProgress(imageDescribeProgress) ? (
        <div className="integration-status integration-status--info" role="status">
          <span>
            后台图片识别执行中：执行中 {imageDescribeProgress.running} 项，
            排队 {imageDescribeProgress.queued} 项，
            剩余 {imageDescribeProgress.remaining} 项。任务完成后此提示会自动消失。
          </span>
          <progress aria-label="后台图片识别进度" />
        </div>
      ) : null}
      {statusMessage?.tone === 'error' ? (
        <div className={`integration-status integration-status--${statusMessage.tone}`} role={statusMessage.tone === 'error' ? 'alert' : 'status'}>
          <span>{statusMessage.text}</span>
          <button aria-label="关闭提示" type="button" onClick={() => setStatusMessage(null)}>×</button>
        </div>
      ) : null}
      {backendReachability.notice ? (
        <div className="integration-status integration-status--error" role="alert">
          <span>{backendReachability.notice.text}</span>
          <button
            aria-label="关闭连接状态提示"
            type="button"
            onClick={() => setBackendReachability((current) => ({ ...current, notice: null }))}
          >×</button>
        </div>
      ) : null}
      {routeProjectId && projectResourceErrors[routeProjectId]
        && Object.keys(projectResourceErrors[routeProjectId]).length > 0 ? (
        <div className="integration-status integration-status--error" role="alert">
          <span>
            部分项目数据加载失败，已保留上次成功数据：
            {' '}
            {Object.entries(projectResourceErrors[routeProjectId])
              .map(([key, message]) => `${projectResourceLabels[key as ProjectResourceKey]}（${message}）`)
              .join('；')}
          </span>
          <button type="button" onClick={() => void loadProject(routeProjectId)}>重试</button>
        </div>
      ) : null}
      {route.name === 'projects' ? (
        <ProjectListPage
          error={undefined}
          enterpriseReady={workspaceEnterprise.length > 0}
          isLive={!localPreviewActive}
          projects={projects}
          total={projectsTotal}
          onArchiveProject={handleArchiveProject}
          onCreateProject={handleCreateProject}
          onSearchProjects={loadProjects}
        />
      ) : null}
      {route.name === 'enterprise-assets' ? (
        <EnterpriseAssetsPage
          assets={enterpriseAssets}
          categories={enterpriseCategories}
          enterpriseName={session.enterpriseName}
          onLoadAssetDetail={loadEnterpriseAssetDetail}
          onLoadAssetPreview={loadEnterpriseAssetPreview}
          onDownloadAssetFile={downloadEnterpriseAssetFile}
          onRefresh={() => (localPreviewActive
            ? Promise.reject(blockLocalPreviewWrite('刷新企业资料'))
            : loadEnterprise()).catch((error) => {
            setError(error, '企业资料刷新失败');
            throw error;
          })}
          onUpload={(files) => handleEnterpriseUpload(files).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onCorrectFact={(assetId, factId, value) => handleCorrectEnterpriseFact(assetId, factId, value).catch((error) => {
            setError(error, '企业资料字段纠正失败');
            throw error;
          })}
        />
      ) : null}
      {route.name === 'bid-market-library' ? (
        <BidMarketLibraryPage
          canManage={session.permissions.includes('admin.user')}
          dataSource={bidMarketDemoActive ? 'mock' : 'api'}
          items={bidMarketDemoActive ? BID_MARKET_MOCK_ITEMS : []}
          state={bidMarketDemoActive ? 'ready' : 'unavailable'}
          unavailableMessage="后端暂未提供投标行情内容库接口。"
        />
      ) : null}
      {route.name === 'project-overview' && activeProject ? (
        <ProjectOverviewPage
          artifactFiles={localPreviewActive ? undefined : artifactResources?.resultFiles ?? []}
          onDownloadArtifact={async (file) => {
            const identity = artifactIdentityFromResourceId(route.projectId, file.id);
            if (!identity) throw new Error('正式成果文件标识无效。');
            const currentFile = artifactResources?.resultFiles.find(item => item.id === file.id);
            if (!currentFile || (file.remoteRevision && file.remoteRevision !== currentFile.remoteRevision)) {
              throw new Error('文件版本已变化，请从成果目录重新打开最新文件再下载。');
            }
            const generation = tenantGuardRef.current.capture();
            const blob = await backendApi.artifacts.download(identity.projectId, identity.artifactId);
            if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('登录已切换，下载已取消。');
            downloadBlob(blob, file.name);
          }}
          localOfficeEnabled={!localPreviewActive}
          agentRun={generationWorkspaceRun}
          answeringAgentAskId={answeringAgentAskId}
          deliverables={deliverableCards}
          deliverablesRequest={deliverablesRequest}
          enterpriseCategories={enterpriseCategories}
          enterpriseLibraryKey={session.enterpriseId}
          enterpriseMaterials={workspaceEnterprise}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUploadFromWorkspace(route.projectId, files).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onRefreshEnterpriseMaterials={loadEnterprise}
          onAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).then(() => undefined).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).catch((error) => {
            setError(error, '补充资料上传失败');
            throw error;
          })}
          onAssistantSend={selectedAgentRun
            ? (value, mode = 'queue') => handleSendAgentMessage(route.projectId, value, mode)
            : undefined}
          onAnswerAgentInteraction={selectedAgentRun
            ? (askId, answers) => handleAnswerAgentQuestion(route.projectId, askId, answers)
            : undefined}
          onDownloadDeliverable={(item) => void downloadDeliverable(route.projectId, item.id, item.versionId).catch((error) => setError(error, '成果下载失败'))}
          onDownloadAllResults={() => handleDownloadResponsePackage(route.projectId)}
          onOpenImprovementSuggestions={() => navigate(`/projects/${encodeURIComponent(route.projectId)}/review`)}
          onStartWorkflow={() => {
            rememberGenerateWorkflow(route.projectId);
            navigate(`/projects/${encodeURIComponent(route.projectId)}/materials?workflow=generate`);
          }}
          onOpenTasks={() => setTaskDrawerProjectId(route.projectId)}
          onSelectVersion={(option) => navigate(deliverableEditorPath(
            route.projectId,
            option.deliverableId,
            option.versionId,
          ))}
          onLoadDeliverableContent={async (item) => {
            if (!item.versionId) throw new Error('该成果尚无可预览版本。');
            if (localPreviewActive) {
              if (item.id === 'internal') throw new Error('本地预览包中的内部管理文件应从文件目录打开。');
              const previewEditor = localPreviewPayloadRef.current?.getLocalPreviewEditor(
                item.id,
                item.versionId,
              );
              if (!previewEditor) throw new Error('本地预览内容不可用。');
              return previewEditor.content;
            }
            const backendDeliverable = activeData?.deliverables.find(
              (candidate) => viewIdForDeliverable(candidate) === item.id,
            );
            const versionNo = Number(item.versionId);
            if (!backendDeliverable || !Number.isInteger(versionNo) || versionNo <= 0) {
              throw new Error('成果文件标识或版本号缺失。');
            }
            return backendApi.deliverables.getVersion(
              backendDeliverable.deliverable_id,
              versionNo,
            );
          }}
          onLoadResourcePreview={async (fileId, fileName) => {
            if (fileId.startsWith('artifact:')) {
              const identity = artifactIdentityFromResourceId(route.projectId, fileId);
              if (!identity) throw new Error('成果不属于当前项目。');
              const generation = tenantGuardRef.current.capture();
              const artifact = activeData?.artifacts?.find(item => String(item.artifact_id) === identity.artifactId);
              if (!artifact) throw new Error('成果目录已变化，请刷新后重新打开。');
              const blob = await backendApi.artifacts.download(identity.projectId, identity.artifactId);
              if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('登录已切换，预览已取消。');
              const extension = artifact.filename.split('.').at(-1)?.toLowerCase() ?? '';
              if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
                return { kind: 'office', blob, fileName: artifact.filename, mimeType: artifact.mime };
              }
              if (extension === 'pdf' || artifact.mime === 'application/pdf') return { kind: 'pdf', blob, mimeType: 'application/pdf' };
              if (artifact.mime.startsWith('image/')) return { kind: 'image', blob, mimeType: artifact.mime };
              return { kind: 'unsupported', message: '当前文件格式请下载原件查看。' };
            }
            if (!fileId.startsWith('enterprise:')) {
              return loadProjectResourcePreview(fileId, fileName);
            }
            const assetId = fileId.slice('enterprise:'.length);
            const cachedAsset = enterpriseAssets.find((asset) => asset.id === assetId);
            const detailedAsset = cachedAsset?.sourceFileId
              ? cachedAsset
              : await loadEnterpriseAssetDetail(assetId);
            const sourceFileId = detailedAsset?.sourceFileId
              ?? detailedAsset?.revisions.find((revision) => revision.isCurrent)?.fileId;
            if (!sourceFileId) throw new Error('后端未返回该企业资料的原始文件标识。');
            return loadProjectResourcePreview(sourceFileId, fileName);
          }}
          overview={activeData?.overview}
          outcomeReview={projectOutcomeReview}
          onRefreshProjectResults={async (change) => {
            if (localPreviewActive) return;
            const generation = tenantGuardRef.current.capture();
            if (change.reason === 'office-save') {
              setProjectData((current) => {
                const existing = current[route.projectId];
                return existing ? { ...current, [route.projectId]: {
                  ...existing, invalidatedScoreId: existing.score?.score_id, localOfficeChanges: true,
                } } : current;
              });
            }
            await loadProject(route.projectId);
            if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('登录已切换，请重新打开当前项目。');
            if (scoreRefreshErrorRef.current[route.projectId]) {
              throw new Error('评分刷新失败，请重试；当前保留的是上次评分。');
            }
          }}
          project={activeProject}
          onUpdateProjectDetails={(update) => handleUpdateProjectDetails(route.projectId, update)}
          projectId={route.projectId}
          reviewFindings={activeData?.reviewRun.findings ?? []}
          sendingAgentMessage={sendingAgentMessage}
          taskSummary={generationTaskSummary}
          versionOptions={deliverableVersionOptions}
          workflowFacts={projectWorkflowFacts}
        />
      ) : null}
      {route.name === 'project-materials' && activeProject ? (
        <ProjectMaterialsPage
          onLoadEnterprisePreview={localPreviewActive ? undefined : loadEnterpriseAssetPreview}
          onDownloadEnterpriseFile={localPreviewActive ? undefined : downloadEnterpriseAssetFile}
          enterpriseCategories={enterpriseCategories}
          enterpriseLibraryKey={session.enterpriseId}
          enterpriseMaterials={workspaceEnterprise}
          hasDeliverables={hasDeliverableVersions}
          initialWorkflowMode={new URLSearchParams(window.location.search).get('workflow') === 'generate'
            ? 'generate'
            : 'choose'}
          materials={activeMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUploadFromWorkspace(route.projectId, files).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onRefreshEnterpriseMaterials={loadEnterprise}
          onAssistantAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files)}
          onAssistantSend={async (value) => { await handleAssistantSend(route.projectId, value); }}
          onCompletedBidUpload={(projectId, files) => handleCompletedBidUpload(projectId, files).catch((error) => {
            setError(error, '已完成标书上传失败');
            throw error;
          })}
          onConfirmRequirement={handleConfirmRequirement}
          onCorrectRequirement={handleCorrectRequirement}
          onImportTenderNoticeUrl={handleImportTenderNoticeUrl}
          onLoadImageDescriptions={async (fileId) => {
            const generation = tenantGuardRef.current.capture();
            const response = await backendApi.files.imageDescriptions(fileId);
            if (!tenantGuardRef.current.isCurrent(generation)) {
              throw new Error('登录会话已切换，已忽略上一企业的图片识别结果。');
            }
            return response;
          }}
          onOpenSnapshot={handleOpenSnapshot}
          onOpenTasks={() => setTaskDrawerProjectId(route.projectId)}
          onRemoveMaterial={(projectId, fileId) => handleRemoveProjectMaterial(projectId, fileId).catch((error) => {
            throw new Error(error instanceof Error && error.message ? error.message : '项目材料删除失败');
          })}
          onStartTask={handleStartTask}
          onUpload={(projectId, files) => handleCurrentTenderUpload(projectId, files).then(() => undefined)}
          projectId={route.projectId}
          projectName={activeProject.title}
          projectPackageNo={activeProject.packageNo}
          projectDeadline={activeProject.deadline}
          onUpdateProjectDetails={(update) => handleUpdateProjectDetails(route.projectId, update)}
          requirements={activeData?.requirements ?? []}
          reviewSidebar={projectReviewSidebar}
          snapshots={activeData?.snapshots ?? []}
          taskSummary={generationTaskSummary}
          generationTaskId={latestGenerationTask?.task_id ?? selectedAgentRun?.taskId}
          taskStatus={latestSubmissionTask?.status}
          workflowFacts={projectWorkflowFacts}
        />
      ) : null}
      {route.name === 'review-center' && activeProject ? (
        <ReviewCenter
          deliverableEditTargets={(deliverableCards ?? []).flatMap((item) => item.id !== 'internal' && item.versionId
            ? [{ id: item.id, title: item.title, versionId: item.versionId }]
            : [])}
          enterpriseCategories={enterpriseCategories}
          enterpriseLibraryKey={session.enterpriseId}
          enterpriseMaterials={workspaceEnterprise}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUploadFromWorkspace(route.projectId, files).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onRefreshEnterpriseMaterials={loadEnterprise}
          onAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).then(() => undefined).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).catch((error) => {
            setError(error, '补充资料上传失败');
            throw error;
          })}
          onAssistantSend={async (value) => { await handleAssistantSend(route.projectId, value); }}
          onConfirmFinding={(findingId, action) => handleConfirmReviewFinding(route.projectId, findingId, action)}
          onConfirmFindings={(findingIds, action) => handleConfirmReviewFindings(route.projectId, findingIds, action)}
          onReEvaluate={(findingIds) => handleReEvaluateReviewFindings(route.projectId, findingIds)}
          onRun={(providerId) => handleRunReview(route.projectId, providerId)}
          onSaveSuggestion={(_runId, findingId, suggestion) => handleSaveSuggestion(route.projectId, findingId, suggestion)}
          projectId={route.projectId}
          providers={reviewProviders}
          run={activeData?.reviewRun ?? emptyReview()}
          runAllowed={Boolean(
            activeData && loadingProjectId !== route.projectId
            && projectTasksState === 'ready'
            && !projectResourceErrors[route.projectId]?.deliverables
            && hasDeliverableVersions
            && !generationTaskIsActive
          )}
          runBlockReason={!activeData || loadingProjectId === route.projectId
            ? '正在读取项目成果与任务状态，请稍候。'
            : projectTasksState === 'error' || projectResourceErrors[route.projectId]?.deliverables
              ? '成果目录或任务状态读取失败，请先点击页面上方“重试”。'
              : generationTaskIsActive
                ? '当前标书任务仍在执行，请等待成果生成完成。'
                : '当前任务尚无可评审的成果，请先生成并同步至少一个成果文件。'}
        />
      ) : null}
      {route.name === 'pricing-center' && activeProject ? (
        <PricingCenter
          calculation={activeData?.quote ?? emptyQuote(route.projectId)}
          enterpriseCategories={enterpriseCategories}
          enterpriseLibraryKey={session.enterpriseId}
          enterpriseMaterials={workspaceEnterprise}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUploadFromWorkspace(route.projectId, files).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onRefreshEnterpriseMaterials={loadEnterprise}
          onAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).then(() => undefined).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).catch((error) => {
            setError(error, '补充资料上传失败');
            throw error;
          })}
          onApply={(strategyId) => handleApplyQuote(route.projectId, strategyId)}
          onCalculate={localPreviewActive
            ? undefined
            : (input) => handleCalculateQuote(route.projectId, input)}
          onRecalculate={localPreviewActive
            ? undefined
            : () => handleRecalculateQuote(route.projectId)}
          onAiSuggest={localPreviewActive
            ? undefined
            : (basis) => handleAiQuoteSuggestion(route.projectId, basis)}
          onAssistantSend={async (value) => { await handleAssistantSend(route.projectId, value); }}
          samples={activeData?.quoteSamples ?? []}
        />
      ) : null}
      {route.name === 'deliverable-editor' && activeProject && editor ? (
        <DeliverableEditorPage
          deliverableId={route.deliverableId}
          deliverableLabel={deliverableTypeLabel(route.deliverableId)}
          deliverableLabels={Object.fromEntries((deliverableCards ?? []).map((item) => [item.id, item.title]))}
          deliverableTitle={editor.deliverable.title}
          draftScopeId={getEditorDraftScopeKey(session.enterpriseId, session.userId, route.projectId)}
          editorContent={editor.content.model}
          editorKind={route.deliverableId === 'quote' ? 'spreadsheet' : 'word'}
          enterpriseCategories={enterpriseCategories}
          enterpriseLibraryKey={session.enterpriseId}
          enterpriseMaterials={workspaceEnterprise}
          initialQuoteRows={route.deliverableId === 'quote' ? backendQuoteRows(editor.content.model) : undefined}
          isBackendConnected={!localPreviewActive}
          isReadOnly={Boolean(editor.readOnlyReason)}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUploadFromWorkspace(route.projectId, files).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onRefreshEnterpriseMaterials={loadEnterprise}
          onAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).then(() => undefined).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantAddFiles={(files) => handleProjectSupplementalUpload(route.projectId, files).catch((error) => {
            setError(error, '补充资料上传失败');
            throw error;
          })}
          onAssistantSend={async (value) => { await handleAssistantSend(route.projectId, value); }}
          onDownload={localPreviewActive
            ? undefined
            : () => downloadDeliverable(route.projectId, route.deliverableId, editor.content.version_no)}
          onSave={editor.session && !editor.readOnlyReason ? handleSaveEditor : undefined}
          project={activeProject}
          projectId={route.projectId}
          versionId={String(editor.content.version_no)}
          versionIds={deliverableVersionIds}
          readOnlyReason={editor.readOnlyReason}
        />
      ) : null}
      {route.name === 'deliverable-editor' && activeProject && !editor ? (
        <MissingDeliverable projectId={route.projectId} loading={loadingProjectId === route.projectId} />
      ) : null}
      {routeProjectId && !activeProject && projectRouteFailure?.projectId === routeProjectId ? (
        <ProjectLoadFailure
          message={projectRouteFailure.message}
          onRetry={() => setProjectRetryNonce((value) => value + 1)}
        />
      ) : null}
      {routeProjectId && !activeProject && missingProjectId !== routeProjectId
        && projectRouteFailure?.projectId !== routeProjectId ? <LoadingProject /> : null}
      {routeProjectId && !activeProject && missingProjectId === routeProjectId ? <MissingProject /> : null}
      {route.name === 'not-found' ? <NotFoundPage /> : null}

      {routeProjectId && activeProject ? (
        <TaskProgressDrawer
          agentRun={activeData?.agentRun}
          answeringAskId={answeringAgentAskId}
          downloadingPackage={downloadingResponsePackage}
          events={taskEvents}
          isOpen={taskDrawerProjectId === routeProjectId}
          onAnswerQuestion={(askId, answers) => handleAnswerAgentQuestion(routeProjectId, askId, answers)}
          onClose={() => setTaskDrawerProjectId(null)}
          onDownloadResponsePackage={() => handleDownloadResponsePackage(routeProjectId)}
          onResumeAgentRun={(taskId) => handleResumeAgentRun(routeProjectId, taskId)}
          onSendAgentMessage={(message, mode) => handleSendAgentMessage(routeProjectId, message, mode)}
          resumingAgentRun={resumingAgentRun}
          sendingAgentMessage={sendingAgentMessage}
        />
      ) : null}
      {snapshotDetail ? <SnapshotDialog detail={snapshotDetail} onClose={() => setSnapshotDetail(null)} /> : null}
      </AppShell>
    </>
  );
}

function pageMetadata(route: string) {
  const labels: Record<string, { eyebrow: string; title: string }> = {
    projects: { eyebrow: '投标协同中心', title: '投标工作台' },
    'project-overview': { eyebrow: '项目工作台', title: '项目概览' },
    'project-materials': { eyebrow: '项目工作台', title: '当前招标材料' },
    'enterprise-assets': { eyebrow: '企业知识中心', title: '企业资料库' },
    'bid-market-library': { eyebrow: '企业知识中心', title: '投标行情库' },
    'review-center': { eyebrow: '项目工作台', title: '外部评审中心' },
    'pricing-center': { eyebrow: '项目工作台', title: '报价测算中心' },
    'deliverable-editor': { eyebrow: '项目工作台', title: '成果在线编辑' },
  };
  return labels[route] ?? { eyebrow: PRODUCT_NAME, title: '页面' };
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function toIsoOrNull(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function routeIdForDeliverable(deliverable: Deliverable): DeliverableRouteId | undefined {
  const id = viewIdForDeliverable(deliverable);
  return id === 'internal' ? undefined : id;
}

function viewIdForDeliverable(deliverable: Deliverable): ProjectDeliverableView['id'] | undefined {
  return ({ 1: 'business', 2: 'technical', 3: 'quote', 4: 'internal' } as const)[deliverable.deliverable_type];
}

function deliverableTypeLabel(id: DeliverableRouteId) {
  return ({ business: '商务标', technical: '技术标', quote: '报价单' } as const)[id];
}

function toWorkspaceMaterials(materials: ProjectMaterial[]): WorkspaceMaterial[] {
  const statuses: Record<ProjectMaterial['parseStatus'], string> = {
    failed: '解析失败', needs_confirmation: '待确认', parsed: '已识别', parsing: '解析中', queued: '待解析', unknown: '解析状态未提供',
  };
  return materials.map((material) => ({
    fileId: material.id,
    id: material.id,
    kind: material.kind,
    name: material.name,
    purpose: material.purpose,
    status: statuses[material.parseStatus],
    tone: material.kind === 'quote_template' ? 'red' : 'blue',
  }));
}

function toWorkspaceEnterpriseMaterials(assets: EnterpriseAsset[]): WorkspaceMaterial[] {
  const statuses: Record<EnterpriseAsset['status'], string> = {
    failed: '处理失败', needs_review: '待确认', processing: '处理中', ready: '已归档',
  };
  const tones: Record<EnterpriseAsset['status'], WorkspaceMaterial['tone']> = {
    failed: 'red', needs_review: 'orange', processing: 'blue', ready: 'green',
  };
  return assets.map((asset) => ({
    categoryId: asset.categoryId,
    fileId: asset.sourceFileId
      ?? asset.revisions.find((revision) => revision.isCurrent)?.fileId
      ?? `enterprise:${asset.id}`,
    id: `enterprise:${asset.id}`,
    name: asset.name,
    status: statuses[asset.status],
    tone: tones[asset.status],
  }));
}

function asId(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function hasUnsupportedEditorModel(model: JsonObject) {
  if (['table', 'tables', 'supplement_nodes', 'template_source_file_id'].some((key) => key in model)) {
    return true;
  }
  if (!Array.isArray(model.nodes)) return false;
  return model.nodes.some((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return true;
    const item = node as Record<string, unknown>;
    return typeof item.text !== 'string'
      || (item.type !== 'paragraph' && item.type !== 'heading');
  });
}

function readHistorySamples(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { samples: [], snapshotIds: [] };
  const record = payload as Record<string, unknown>;
  const samples = Array.isArray(record.samples) ? record.samples : [];
  const snapshotIds = Array.isArray(record.snapshot_ids) ? record.snapshot_ids : [];
  return {
    samples: samples.filter((sample): sample is Parameters<typeof adaptBackendHistorySamples>[0][number] =>
      Boolean(sample
        && typeof sample === 'object'
        && 'win_price' in sample
        && ('material_name' in sample || 'package_name' in sample)
        && ('win_date' in sample || 'publish_date' in sample))),
    snapshotIds: snapshotIds.filter((id): id is string | number => typeof id === 'string' || typeof id === 'number'),
  };
}

function taskPhaseLabel(phase: string) {
  return ({ agent_pipeline: 'BidVolt 成果生成', bid_review: '成果校核', bid_generate: '成果编制', tender_parse: '材料解析' } as Record<string, string>)[phase] ?? '智能任务';
}

function agentRunTaskSummary(run: AgentRunViewModel) {
  const hasOpenQuestion = run.completion === 'active'
    && run.questions.some((question) => !question.answered);
  const status: ProjectTaskStatus | undefined = hasOpenQuestion
    ? 'waiting_user'
    : run.completion === 'incomplete'
    ? 'failed'
    : ({
        cancelled: 'failed',
        failed: 'failed',
        failed_retryable: 'failed',
        queued: 'queued',
        running: 'running',
        succeeded: 'succeeded',
      } as Partial<Record<AgentRunViewModel['status'], ProjectTaskStatus>>)[run.status];
  const title = run.completion === 'incomplete'
    ? '成果尚未完全闭环'
    : taskPhaseLabel(run.phase);
  return {
    message: run.message,
    percent: run.percent,
    status,
    title,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

async function pollTenderImport(
  projectId: string,
  noticeId: string,
  generation: number,
  guard: ReturnType<typeof createTenantGenerationGuard>,
  onComplete: (projectId: string, job: TenderNoticeImportJob) => Promise<void>,
  setStatus: (message: { tone: 'error' | 'info'; text: string } | null) => void,
  signal?: AbortSignal,
) {
  let attempt = 0;
  while (!signal?.aborted && guard.isCurrent(generation)) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 30 ? 2000 : 5000));
    if (signal?.aborted || !guard.isCurrent(generation)) return;
    try {
      const job = await backendApi.tenderNotices.get(projectId, noticeId);
      if (job.status === 2) {
        if (signal?.aborted) return;
        await onComplete(projectId, job);
        if (signal?.aborted) return;
        guard.commit(generation, () => {
          setStatus({ tone: 'info', text: '招标公告已下载、解析并加入当前项目材料。' });
        });
        return;
      }
      if (job.status === 3) {
        if (signal?.aborted) return;
        guard.commit(generation, () => {
          setStatus({ tone: 'error', text: job.error_message || '招标公告网址解析失败。' });
        });
        return;
      }
    } catch (error) {
      if (signal?.aborted) return;
      guard.commit(generation, () => {
        setStatus({
          tone: 'error',
          text: `${tenderNoticeImportErrorMessage(error, '招标公告导入状态查询暂时失败。')} 系统将继续重试。`,
        });
      });
    }
    attempt += 1;
    if (attempt === 30) {
      guard.commit(generation, () => {
        setStatus({ tone: 'info', text: '招标公告仍在后台处理，系统会继续同步项目材料。' });
      });
    }
  }
}

function LoadingScreen() {
  return <main className="empty-page" aria-busy="true"><span className="empty-page__code">加载中</span><h1>正在恢复登录状态</h1></main>;
}

function MissingProject() {
  return <section className="empty-page"><span className="empty-page__code">未找到</span><h1>这个项目不存在或无权访问</h1><AppLink className="button button--primary" to="/projects">返回项目列表</AppLink></section>;
}

function LoadingProject() {
  return <section className="empty-page" aria-busy="true"><span className="empty-page__code">加载中</span><h1>正在加载项目工作台</h1></section>;
}

function ProjectLoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="empty-page" role="alert">
      <span className="empty-page__code">加载失败</span>
      <h1>项目暂时无法加载</h1>
      <p>{message}</p>
      <button className="button button--primary" type="button" onClick={onRetry}>重试</button>
    </section>
  );
}

function MissingDeliverable({ projectId, loading }: { projectId: string; loading: boolean }) {
  return <section className="empty-page"><span className="empty-page__code">{loading ? '加载中' : '未找到'}</span><h1>{loading ? '正在加载成果版本' : '当前项目没有这个成果版本'}</h1><AppLink className="button button--primary" to={`/projects/${encodeURIComponent(projectId)}/overview`}>返回项目概览</AppLink></section>;
}

function NotFoundPage() {
  return <section className="empty-page"><span className="empty-page__code">404</span><h1>这个页面不存在</h1><AppLink className="button button--primary" to="/projects">返回项目列表</AppLink></section>;
}

function SnapshotDialog({ detail, onClose }: { detail: { id: string; value: unknown }; onClose: () => void }) {
  return (
    <div className="enterprise-modal-layer">
      <button className="enterprise-modal-backdrop" aria-label="关闭项目快照" type="button" onClick={onClose} />
      <section className="enterprise-modal enterprise-modal--detail" role="dialog" aria-modal="true" aria-labelledby="snapshot-detail-title">
        <button className="enterprise-modal__close enterprise-modal__close--floating" aria-label="关闭项目快照" type="button" onClick={onClose}>×</button>
        <div style={{ padding: 24 }}><h2 id="snapshot-detail-title">项目快照 #{detail.id}</h2><pre style={{ maxHeight: '70vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.value, null, 2)}</pre></div>
      </section>
    </div>
  );
}
