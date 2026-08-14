import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LoginPage, type LoginCredentials, type RegisterCredentials } from '../domains/auth/LoginPage';
import {
  DeliverableEditorPage,
  backendQuoteRows,
  toBackendEditorContent,
  type OfficeMockSavePayload,
} from '../domains/editor';
import { HistoryPricesPage } from '../domains/history';
import type { HistoricalQuoteRecord } from '../domains/history/types';
import { LandingPage } from '../domains/marketing/LandingPage';
import { PricingCenter } from '../domains/pricing/PricingCenter';
import type { HistoryPriceSample, QuoteCalculationView } from '../domains/pricing/types';
import { ProjectListPage } from '../domains/projects/ProjectListPage';
import {
  ProjectOverviewPage,
  type ProjectOverviewView,
} from '../domains/projects/ProjectOverviewPage';
import type { ProjectSummary } from '../domains/projects/project-view-model';
import type { WorkspaceMaterial } from '../domains/projects/ProjectWorkbench';
import { ReviewCenter } from '../domains/review/ReviewCenter';
import type { ReviewProvider, ReviewRunView } from '../domains/review/types';
import {
  EnterpriseAssetsPage,
  type EnterpriseAsset,
  type EnterpriseIngestionItem,
} from '../features/enterprise-assets';
import {
  ProjectMaterialsPage,
  type ProjectMaterial,
  type ProjectRequirement,
  type ProjectSnapshot,
} from '../features/project-materials';
import type { PublicTaskEvent } from '../shared/task-events';
import {
  BackendApiError,
  adaptBackendDeliverableCards,
  adaptBackendEnterpriseAssets,
  adaptBackendFiles,
  adaptBackendHistorySamples,
  adaptBackendProjectOverview,
  adaptBackendProject,
  adaptBackendProjects,
  adaptBackendQuoteCalculation,
  adaptBackendRequirements,
  adaptBackendReviewProviders,
  adaptBackendReviewRun,
  adaptBackendSnapshots,
  adaptBackendTaskEvent,
  backendApi,
  scoreSummaryForOverview,
  type Deliverable,
  type DeliverableContent,
  type EditorSession,
  type EnterpriseIngestion,
  type JsonObject,
  type MeResponse,
  type ScoreSummary,
} from '../shared/backend-api';
import { TaskProgressDrawer } from '../shared/ui/TaskProgressDrawer';
import { AppShell } from './AppShell';
import {
  BACKEND_SESSION_EXPIRED_EVENT,
  clearBackendSession,
  getBackendAccessToken,
  getBackendRefreshToken,
  getRememberedEnterpriseName,
  saveBackendSession,
} from './backend-session';
import { AppLink, deliverableEditorPath, navigate, type DeliverableRouteId, useUrlRoute } from './router';
import { mergeProjectPage, upsertProjectSummary } from './project-state';
import {
  hasTaskEnteredTerminalState,
  isActiveTaskStatus,
  isProjectNotFound,
  type ProjectResourceErrors,
  type ProjectResourceKey,
} from './project-resource-state';
import { getEditorDraftScopeKey, type AppSession } from './session';
import { createEmptyTenantDomainState, createTenantGenerationGuard } from './tenant-isolation';
import { readUploadOutcome, uploadOutcomeError } from './upload-outcome';
import { createEditorSaveGate } from './editor-save-gate';
import {
  isLocalPreviewAvailable,
  localPreviewWriteError,
} from './local-preview-gate';

type LocalPreviewPayload = typeof import('./local-preview');

const loadLocalPreviewPayload = import.meta.env.DEV
  ? () => import('./local-preview')
  : undefined;

type ProjectData = {
  deliverables: Deliverable[];
  historyRecords: HistoricalQuoteRecord[];
  materials: ProjectMaterial[];
  overview?: ProjectOverviewView;
  quote: QuoteCalculationView;
  quoteSamples: HistoryPriceSample[];
  requirements: ProjectRequirement[];
  reviewRun: ReviewRunView;
  score?: ScoreSummary;
  snapshots: ProjectSnapshot[];
  tasks: PublicTaskEvent[];
};

type HistoryState = {
  records: HistoricalQuoteRecord[];
  samples: HistoryPriceSample[];
  total: number;
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

const projectResourceLabels: Record<ProjectResourceKey, string> = {
  materials: '项目材料',
  requirements: '招标要求',
  snapshots: '项目快照',
  tasks: '任务进度',
  deliverables: '成果版本',
  review: '评审结果',
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
  const routeProjectId = 'projectId' in route ? route.projectId : undefined;
  const [authState, setAuthState] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [localPreviewActive, setLocalPreviewActive] = useState(false);
  const [localPreviewProjectId, setLocalPreviewProjectId] = useState<string | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loginError, setLoginError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [history, setHistory] = useState<HistoryState>({ records: [], samples: [], total: 0 });
  const [projectData, setProjectData] = useState<Record<string, ProjectData>>({});
  const [enterpriseAssets, setEnterpriseAssets] = useState<EnterpriseAsset[]>([]);
  const [enterpriseIngestions, setEnterpriseIngestions] = useState<EnterpriseIngestionItem[]>([]);
  const [reviewProviders, setReviewProviders] = useState<ReviewProvider[]>([]);
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [snapshotDetail, setSnapshotDetail] = useState<{ id: string; value: unknown } | null>(null);
  const [editor, setEditor] = useState<ActiveEditor | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [missingProjectId, setMissingProjectId] = useState<string | null>(null);
  const [projectRouteFailure, setProjectRouteFailure] = useState<ProjectRouteFailure | null>(null);
  const [projectRetryNonce, setProjectRetryNonce] = useState(0);
  const [projectResourceErrors, setProjectResourceErrors] = useState<Record<string, ProjectResourceErrors>>({});
  const editorLoadKeyRef = useRef('');
  const activeEditorRef = useRef<ActiveEditor | null>(null);
  const editorSaveGateRef = useRef(createEditorSaveGate());
  const tenantGuardRef = useRef(createTenantGenerationGuard());
  const projectLoadGenerationRef = useRef(0);
  const projectResourceGenerationRef = useRef<Record<string, number>>({});
  const taskEventsRef = useRef<Record<string, PublicTaskEvent[]>>({});
  const localPreviewPayloadRef = useRef<LocalPreviewPayload | null>(null);
  const localPreviewLoadRef = useRef(false);
  const routeProjectIdRef = useRef(routeProjectId);
  routeProjectIdRef.current = routeProjectId;
  activeEditorRef.current = editor;

  const clearTenantDomainState = useCallback(() => {
    const empty = createEmptyTenantDomainState();
    tenantGuardRef.current.invalidate();
    setProjects(empty.projects);
    setProjectsTotal(empty.projectsTotal);
    setHistory(empty.history);
    setProjectData(empty.projectData);
    setEnterpriseAssets(empty.enterpriseAssets);
    setEnterpriseIngestions(empty.enterpriseIngestions);
    setReviewProviders(empty.reviewProviders);
    setLocalPreviewProjectId(null);
    localPreviewPayloadRef.current = null;
    setTaskDrawerProjectId(empty.taskDrawerProjectId);
    setSnapshotDetail(empty.snapshotDetail);
    setEditor(empty.editor);
    activeEditorRef.current = null;
    editorSaveGateRef.current.reset();
    setLoadingProjectId(empty.loadingProjectId);
    setMissingProjectId(null);
    setProjectRouteFailure(null);
    setProjectResourceErrors({});
    setStatusMessage(empty.statusMessage);
    editorLoadKeyRef.current = '';
    projectResourceGenerationRef.current = {};
    taskEventsRef.current = {};
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
    setStatusMessage({ tone: 'error', text: readableError(error, fallback) });
  }, [becomeAnonymous]);

  const establishSession = useCallback(async (
    me?: MeResponse,
    generation = tenantGuardRef.current.capture(),
  ) => {
    const profile = me ?? await backendApi.auth.me();
    const nextSession: AppSession = {
      enterpriseId: String(profile.enterprise_id),
      enterpriseName: profile.enterprise_name || getRememberedEnterpriseName() || `企业 #${profile.enterprise_id}`,
      userId: String(profile.user_id),
      user: {
        displayName: profile.email || `用户 #${profile.user_id}`,
        role: profile.permissions.includes('admin.user') ? '企业管理员' : '投标用户',
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

  const loadProjects = useCallback(async () => {
    const generation = tenantGuardRef.current.capture();
    const response = await backendApi.projects.list({ page: 1, size: 100 });
    tenantGuardRef.current.commit(generation, () => {
      setProjects((current) => mergeProjectPage(
        adaptBackendProjects(response.items),
        current,
        routeProjectIdRef.current,
      ));
      setProjectsTotal(response.total);
    });
  }, []);

  const loadEnterprise = useCallback(async () => {
    const generation = tenantGuardRef.current.capture();
    const [categories, assets, ingestionResponse] = await Promise.all([
      backendApi.enterprise.listCategories(),
      backendApi.enterprise.listAssets(),
      backendApi.enterprise.listIngestions().catch(() => ({ items: [] as EnterpriseIngestion[] })),
    ]);
    const bundles = await Promise.all(assets.map(async (asset) => {
      const [detail, revisions] = await Promise.all([
        backendApi.enterprise.getAsset(asset.asset_id).catch(() => undefined),
        backendApi.enterprise.listRevisions(asset.asset_id).then((response) => response.items).catch(() => []),
      ]);
      return { asset, detail, revisions };
    }));
    tenantGuardRef.current.commit(generation, () => {
      setEnterpriseAssets(adaptBackendEnterpriseAssets(bundles, categories));
      setEnterpriseIngestions(ingestionResponse.items.map(adaptIngestion));
    });
  }, []);

  const loadHistory = useCallback(async () => {
    const generation = tenantGuardRef.current.capture();
    const payload = await backendApi.quotes.history();
    const parsed = readHistorySamples(payload);
    const samples = adaptBackendHistorySamples(parsed.samples, parsed.snapshotIds);
    const record = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const total = typeof record.sample_count === 'number' ? record.sample_count : samples.length;
    tenantGuardRef.current.commit(generation, () => {
      setHistory({ records: toHistoryRecords(samples), samples, total });
    });
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated' || localPreviewActive) return;
    const generation = tenantGuardRef.current.capture();
    void Promise.all([loadProjects(), loadEnterprise(), loadHistory(), backendApi.review.listProviders()])
      .then(([, , , providers]) => tenantGuardRef.current.commit(generation, () => {
        setReviewProviders(adaptBackendReviewProviders(providers));
      }))
      .catch((error) => {
        if (tenantGuardRef.current.isCurrent(generation)) setError(error, '基础数据加载失败');
      });
  }, [authState, loadEnterprise, loadHistory, loadProjects, localPreviewActive, setError]);

  const loadProject = useCallback(async (projectId: string) => {
    const tenantGeneration = tenantGuardRef.current.capture();
    const resourceGeneration = (projectResourceGenerationRef.current[projectId] ?? 0) + 1;
    projectResourceGenerationRef.current[projectId] = resourceGeneration;
    tenantGuardRef.current.commit(tenantGeneration, () => setLoadingProjectId(projectId));
    try {
      const results = await Promise.allSettled([
        backendApi.files.list({ target: 'project', project_id: projectId, page: 1, size: 100 }),
        backendApi.requirements.list(projectId),
        backendApi.snapshots.list(projectId),
        backendApi.tasks.list(projectId),
        backendApi.deliverables.list(projectId),
        (async () => {
          const [reviewRuns, score] = await Promise.all([
            backendApi.review.listRuns(projectId),
            backendApi.review.latestScore(projectId),
          ]);
          const latestRun = [...reviewRuns.items].sort((a, b) => Number(b.run_id) - Number(a.run_id))[0];
          const runDetail = latestRun
            ? await backendApi.review.getRun(projectId, latestRun.run_id)
            : undefined;
          return { runDetail, score };
        })(),
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
      ]);
      if (!tenantGuardRef.current.isCurrent(tenantGeneration)
        || projectResourceGenerationRef.current[projectId] !== resourceGeneration) return;

      const [filesResult, requirementsResult, snapshotsResult, tasksResult, deliverablesResult, reviewResult, quoteResult] = results;
      const resourceResults: Array<[ProjectResourceKey, PromiseSettledResult<unknown>]> = [
        ['materials', filesResult],
        ['requirements', requirementsResult],
        ['snapshots', snapshotsResult],
        ['tasks', tasksResult],
        ['deliverables', deliverablesResult],
        ['review', reviewResult],
        ['quote', quoteResult],
      ];
      const errors = Object.fromEntries(resourceResults.flatMap(([key, result]) =>
        result.status === 'rejected'
          ? [[key, readableError(result.reason, `${projectResourceLabels[key]}加载失败`)]]
          : [])) as ProjectResourceErrors;

      setProjectData((current) => {
        const previous = current[projectId] ?? {
          deliverables: [],
          historyRecords: [],
          materials: [],
          quote: emptyQuote(projectId),
          quoteSamples: [],
          requirements: [],
          reviewRun: emptyReview(),
          snapshots: [],
          tasks: [],
        };
        const next: ProjectData = { ...previous };
        if (filesResult.status === 'fulfilled') next.materials = adaptBackendFiles(filesResult.value.items);
        if (requirementsResult.status === 'fulfilled') {
          const fileNamesById = filesResult.status === 'fulfilled'
            ? Object.fromEntries(filesResult.value.items.map((file) => [String(file.file_id), file.name]))
            : {};
          next.requirements = adaptBackendRequirements(requirementsResult.value, { fileNamesById });
        }
        if (snapshotsResult.status === 'fulfilled') next.snapshots = adaptBackendSnapshots(snapshotsResult.value.items);
        if (tasksResult.status === 'fulfilled') {
          next.tasks = tasksResult.value.items.map((task, index) => adaptBackendTaskEvent(task, {
            projectId,
            sequence: index + 1,
          }));
          taskEventsRef.current[projectId] = next.tasks;
        }
        if (deliverablesResult.status === 'fulfilled') next.deliverables = deliverablesResult.value;
        if (reviewResult.status === 'fulfilled') {
          next.reviewRun = reviewResult.value.runDetail ? adaptBackendReviewRun(reviewResult.value.runDetail) : emptyReview();
          next.score = reviewResult.value.score;
        }
        if (quoteResult.status === 'fulfilled') {
          next.quote = quoteResult.value.quote;
          next.quoteSamples = quoteResult.value.samples;
          next.historyRecords = toHistoryRecords(quoteResult.value.samples);
        }
        next.overview = adaptBackendProjectOverview(
          next.deliverables,
          next.score ? scoreSummaryForOverview(next.score) : undefined,
        );
        return { ...current, [projectId]: next };
      });
      setProjectResourceErrors((current) => ({ ...current, [projectId]: errors }));
    } finally {
      if (projectResourceGenerationRef.current[projectId] === resourceGeneration) {
        tenantGuardRef.current.commit(tenantGeneration, () => {
          setLoadingProjectId((current) => current === projectId ? null : current);
        });
      }
    }
  }, []);

  const refreshTaskEvents = useCallback(async (projectId: string) => {
    const generation = tenantGuardRef.current.capture();
    const response = await backendApi.tasks.list(projectId);
    if (!tenantGuardRef.current.isCurrent(generation)) return false;
    const nextTasks = response.items.map((task, index) => adaptBackendTaskEvent(task, {
      projectId,
      sequence: index + 1,
    }));
    const enteredTerminalState = hasTaskEnteredTerminalState(taskEventsRef.current[projectId] ?? [], nextTasks);
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
    return enteredTerminalState;
  }, []);

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

  const shouldPollTasks = Boolean(!localPreviewActive && routeProjectId && projectData[routeProjectId]?.tasks.some((event) =>
    isActiveTaskStatus(event.status)));
  useEffect(() => {
    if (!routeProjectId || !shouldPollTasks) return undefined;
    const timer = window.setInterval(() => {
      const generation = tenantGuardRef.current.capture();
      void refreshTaskEvents(routeProjectId).then((enteredTerminalState) => {
        if (enteredTerminalState && tenantGuardRef.current.isCurrent(generation)) {
          return loadProject(routeProjectId);
        }
        return undefined;
      }).catch((error) => {
        if (tenantGuardRef.current.isCurrent(generation)) setError(error, '任务进度刷新失败');
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [loadProject, refreshTaskEvents, routeProjectId, setError, shouldPollTasks]);

  const pageMeta = useMemo(() => pageMetadata(route.name), [route.name]);
  useEffect(() => {
    document.title = `${pageMeta.title} · AI电网投标助手`;
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
    setEnterpriseIngestions(preview.localPreviewIngestions);
    setReviewProviders(preview.localPreviewProviders);
    setHistory({
      records: preview.localPreviewHistoryRecords,
      samples: preview.localPreviewQuoteSamples,
      total: preview.localPreviewHistoryRecords.length,
    });
    setProjectData({
      [preview.LOCAL_PREVIEW_PROJECT_ID]: {
        deliverables: preview.localPreviewDeliverables,
        historyRecords: preview.localPreviewHistoryRecords,
        materials: preview.localPreviewMaterials,
        quote: preview.localPreviewQuote,
        quoteSamples: preview.localPreviewQuoteSamples,
        requirements: preview.localPreviewRequirements,
        reviewRun: preview.localPreviewReview,
        snapshots: preview.localPreviewSnapshots,
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
      tender_no: project.code,
      deadline: toIsoOrNull(project.deadline),
      note: project.buyer ? `招标人：${project.buyer}` : undefined,
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

  const handleEnterpriseUpload = async (files: File[]) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('上传企业资料');
    const generation = tenantGuardRef.current.capture();
    const result = await backendApi.files.upload({ target: 'enterprise', files });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcome = readUploadOutcome(result.files);
    const uploadedIds = outcome.uploaded.map((file) => file.file_id);
    let assetIds: number[] = [];
    if (uploadedIds.length > 0) {
      await loadEnterprise();
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      const assets = await backendApi.enterprise.listAssets();
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      assetIds = assets
        .filter((asset) => asset.source_file_id !== null && uploadedIds.includes(asset.source_file_id))
        .map((asset) => asset.asset_id);
      if (assetIds.length) await backendApi.enterprise.ingest(assetIds);
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await loadEnterprise();
    }
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcomeError = uploadOutcomeError('企业资料', uploadedIds.length, outcome.errors);
    if (outcomeError) throw outcomeError;
    tenantGuardRef.current.commit(generation, () => {
      setStatusMessage({
        tone: 'info',
        text: assetIds.length
          ? `已接收 ${uploadedIds.length} 份企业资料，并已提交 ${assetIds.length} 份资料的归类任务。`
          : `已上传 ${uploadedIds.length} 份企业资料，待服务端完成文件与企业资料关联后再启动归类。`,
      });
    });
    return {
      message: assetIds.length
        ? '企业资料上传完成，服务端归类任务已提交。'
        : '企业资料上传完成，待服务端关联到企业资料后再启动归类。',
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
    await loadEnterprise();
  };

  const handleProjectUpload = async (projectId: string, files: File[]) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('上传项目材料');
    const generation = tenantGuardRef.current.capture();
    const result = await backendApi.files.upload({ target: 'project', project_id: projectId, files });
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcome = readUploadOutcome(result.files);
    const { uploaded } = outcome;
    const archives = uploaded.filter((file) => /\.(zip|rar|7z)$/i.test(file.name));
    const archiveErrors: string[] = [];
    for (const archive of archives) {
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      try {
        await backendApi.files.archive({ archive_file_id: archive.file_id, target: 'project', project_id: projectId });
      } catch (error) {
        if (!tenantGuardRef.current.isCurrent(generation)) return;
        archiveErrors.push(`${archive.name}：${readableError(error, '压缩包解包失败')}`);
      }
    }
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    if (uploaded.length > 0) await loadProject(projectId);
    if (!tenantGuardRef.current.isCurrent(generation)) return;
    const outcomeError = uploadOutcomeError(
      '当前项目材料',
      uploaded.length,
      [...outcome.errors, ...archiveErrors],
    );
    if (outcomeError) throw outcomeError;
    tenantGuardRef.current.commit(generation, () => {
      setStatusMessage({ tone: 'info', text: `已上传 ${uploaded.length} 份当前项目材料，未写入企业资料库。` });
    });
  };

  const handleImportTenderNoticeUrl = async (projectId: string, url: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('导入招标公告网址');
    const generation = tenantGuardRef.current.capture();
    const job = await backendApi.tenderNotices.importFromUrl(projectId, url);
    if (!tenantGuardRef.current.isCurrent(generation)) throw new Error('会话已切换，已忽略旧企业的导入结果。');
    if (job.status === 'succeeded') {
      await loadProject(projectId);
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({ tone: 'info', text: '招标公告已下载、解析并加入当前项目材料。' });
      });
      return { status: 'completed' as const, message: '导入完成，招标公告已加入当前项目材料。' };
    }
    if (job.status === 'failed') {
      throw new Error(job.error || '招标公告网址解析失败。');
    }
    tenantGuardRef.current.commit(generation, () => {
      setStatusMessage({ tone: 'info', text: '招标公告网址已提交，服务端正在安全下载并解析。' });
    });
    void pollTenderImport(
      projectId,
      String(job.import_id),
      generation,
      tenantGuardRef.current,
      loadProject,
      setStatusMessage,
    );
    return { status: 'queued' as const, message: '网址已提交，正在下载并解析招标公告。' };
  };

  const handleConfirmRequirement = () => {
    if (localPreviewActive) {
      blockLocalPreviewWrite('确认招标要求');
      return;
    }
    setStatusMessage({
      tone: 'error',
      text: '后端尚未提供 Requirement 确认接口；已保留按钮，但不会在浏览器内伪造确认成功。',
    });
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
      await backendApi.tasks.create(projectId, {
        task_type: mode === 'generate' ? 'bid_generate' : 'bid_review',
        idempotency_key: crypto.randomUUID(),
        payload: {},
      });
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      await loadProject(projectId);
      tenantGuardRef.current.commit(generation, () => setTaskDrawerProjectId(projectId));
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setError(error, mode === 'generate' ? '成果生成任务创建失败' : '校核任务创建失败');
        throw error;
      }
    }
  };

  const handleAssistantSend = async (projectId: string, value: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('发送项目助手消息');
    const generation = tenantGuardRef.current.capture();
    try {
      const list = await backendApi.chat.listConversations(projectId);
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      const conversation = list.items[0] ?? await backendApi.chat.createConversation(projectId, '项目助手');
      if (!tenantGuardRef.current.isCurrent(generation)) return;
      const response = await backendApi.chat.sendMessage(projectId, conversation.conversation_id, value);
      tenantGuardRef.current.commit(generation, () => {
        setStatusMessage({ tone: 'info', text: response.reply });
      });
    } catch (error) {
      if (tenantGuardRef.current.isCurrent(generation)) {
        setError(error, '项目助手请求失败');
        throw error;
      }
    }
  };

  const handleRunReview = async (projectId: string, providerId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('执行外部评审');
    const generation = tenantGuardRef.current.capture();
    try {
      await backendApi.review.evaluate(projectId, { provider_id: providerId });
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

  const handleApplyQuote = async (projectId: string, strategyId: string) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('应用报价策略');
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
      try {
        await loadProject(payload.projectId);
      } catch (error) {
        if (tenantGuardRef.current.isCurrent(generation)) {
          setStatusMessage({
            tone: 'error',
            text: `成果已保存为 V${completed.version_no}，但项目数据刷新失败；请刷新页面。${readableError(error, '')}`,
          });
        }
      }
      navigate(deliverableEditorPath(payload.projectId, payload.deliverableId, String(completed.version_no)), { replace: true });
    });
  };

  const downloadDeliverable = async (
    projectId: string,
    routeId: DeliverableRouteId,
    requestedVersion?: string | number,
  ) => {
    if (localPreviewActive) throw blockLocalPreviewWrite('下载成果文件');
    const generation = tenantGuardRef.current.capture();
    const deliverable = projectData[projectId]?.deliverables.find((item) => routeIdForDeliverable(item) === routeId);
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

  if (route.name === 'landing') return <LandingPage />;
  if (authState === 'checking') return <LoadingScreen />;
  if (authState === 'anonymous' || route.name === 'login' || !session) {
    return (
      <LoginPage
        error={loginError}
        isSubmitting={authSubmitting}
        localPreviewAvailable={isLocalPreviewAvailable()}
        onLogin={handleLogin}
        onOpenLocalPreview={handleOpenLocalPreview}
        onRegister={handleRegister}
      />
    );
  }

  const activeProject = routeProjectId ? projects.find((project) => project.id === routeProjectId) : undefined;
  const activeData = routeProjectId ? projectData[routeProjectId] : undefined;
  const activeMaterials = activeData?.materials ?? [];
  const workspaceMaterials = toWorkspaceMaterials(activeMaterials);
  const workspaceEnterprise = toWorkspaceEnterpriseMaterials(enterpriseAssets);
  const taskEvents = activeData?.tasks ?? [];
  const activeTaskCount = taskEvents.some((event) => ['queued', 'running', 'retrying', 'waiting_user'].includes(event.status)) ? 1 : 0;
  const latestTask = taskEvents.reduce<PublicTaskEvent | undefined>((latest, event) =>
    !latest || event.sequence > latest.sequence ? event : latest, undefined);
  const deliverableCards = activeData ? adaptBackendDeliverableCards(activeData.deliverables) : undefined;
  const deliverableVersionIds = Object.fromEntries((deliverableCards ?? [])
    .filter((item) => item.versionId)
    .map((item) => [item.id, item.versionId])) as Partial<Record<DeliverableRouteId, string>>;

  return (
    <AppShell
      currentProjectId={routeProjectId}
      currentRoute={route.name}
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
            <AppLink to="/history-prices">历史报价</AppLink>
          </nav>
        </aside>
      ) : null}
      {statusMessage ? (
        <div className={`integration-status integration-status--${statusMessage.tone}`} role={statusMessage.tone === 'error' ? 'alert' : 'status'}>
          <span>{statusMessage.text}</span>
          <button aria-label="关闭提示" type="button" onClick={() => setStatusMessage(null)}>×</button>
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
          isLive={!localPreviewActive}
          projects={projects}
          total={projectsTotal}
          onArchiveProject={handleArchiveProject}
          onCreateProject={handleCreateProject}
        />
      ) : null}
      {route.name === 'enterprise-assets' ? (
        <EnterpriseAssetsPage
          assets={enterpriseAssets}
          enterpriseName={session.enterpriseName}
          ingestionItems={enterpriseIngestions}
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
      {route.name === 'history-prices' ? (
        <HistoryPricesPage records={history.records} totalCount={history.total} />
      ) : null}
      {route.name === 'project-overview' && activeProject ? (
        <ProjectOverviewPage
          deliverables={deliverableCards}
          enterpriseMaterials={workspaceEnterprise}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUpload(files).then(() => undefined).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantSend={(value) => handleAssistantSend(route.projectId, value)}
          onDownloadDeliverable={(item) => void downloadDeliverable(route.projectId, item.id, item.versionId).catch((error) => setError(error, '成果下载失败'))}
          onOpenTasks={() => setTaskDrawerProjectId(route.projectId)}
          overview={activeData?.overview}
          project={activeProject}
          projectId={route.projectId}
          taskSummary={latestTask?.percent !== null && latestTask?.percent !== undefined ? {
            message: latestTask.public_message,
            percent: latestTask.percent,
            title: taskPhaseLabel(latestTask.phase),
          } : undefined}
        />
      ) : null}
      {route.name === 'project-materials' && activeProject ? (
        <ProjectMaterialsPage
          enterpriseMaterials={workspaceEnterprise}
          materials={activeMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUpload(files).then(() => undefined).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onAssistantSend={(value) => handleAssistantSend(route.projectId, value)}
          onConfirmRequirement={handleConfirmRequirement}
          onImportTenderNoticeUrl={handleImportTenderNoticeUrl}
          onOpenSnapshot={handleOpenSnapshot}
          onStartTask={handleStartTask}
          onUpload={(projectId, files) => handleProjectUpload(projectId, files).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          projectId={route.projectId}
          projectName={activeProject.title}
          requirements={activeData?.requirements ?? []}
          snapshots={activeData?.snapshots ?? []}
        />
      ) : null}
      {route.name === 'review-center' && activeProject ? (
        <ReviewCenter
          enterpriseMaterials={workspaceEnterprise}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUpload(files).then(() => undefined).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantSend={(value) => handleAssistantSend(route.projectId, value)}
          onRun={(providerId) => handleRunReview(route.projectId, providerId)}
          onSaveSuggestion={(_runId, findingId, suggestion) => handleSaveSuggestion(route.projectId, findingId, suggestion)}
          projectId={route.projectId}
          providers={reviewProviders}
          run={activeData?.reviewRun ?? emptyReview()}
          runAllowed={Boolean(activeData?.snapshots.length && activeData.deliverables.length)}
          runBlockReason="请先完成材料解析并生成至少一个成果版本。"
        />
      ) : null}
      {route.name === 'pricing-center' && activeProject ? (
        <PricingCenter
          calculation={activeData?.quote ?? emptyQuote(route.projectId)}
          enterpriseMaterials={workspaceEnterprise}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUpload(files).then(() => undefined).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onApply={(strategyId) => handleApplyQuote(route.projectId, strategyId)}
          onAssistantSend={(value) => handleAssistantSend(route.projectId, value)}
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
          enterpriseMaterials={workspaceEnterprise}
          initialQuoteRows={route.deliverableId === 'quote' ? backendQuoteRows(editor.content.model) : undefined}
          isBackendConnected={!localPreviewActive}
          isReadOnly={Boolean(editor.readOnlyReason)}
          materials={workspaceMaterials}
          onAddEnterpriseFiles={(files) => handleEnterpriseUpload(files).then(() => undefined).catch((error) => {
            setError(error, '企业资料上传失败');
            throw error;
          })}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files).catch((error) => {
            setError(error, '项目材料上传失败');
            throw error;
          })}
          onAssistantSend={(value) => handleAssistantSend(route.projectId, value)}
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
          events={taskEvents}
          isOpen={taskDrawerProjectId === routeProjectId}
          onClose={() => setTaskDrawerProjectId(null)}
          projectTitle={activeProject.title}
        />
      ) : null}
      {snapshotDetail ? <SnapshotDialog detail={snapshotDetail} onClose={() => setSnapshotDetail(null)} /> : null}
    </AppShell>
  );
}

function pageMetadata(route: string) {
  const labels: Record<string, { eyebrow: string; title: string }> = {
    projects: { eyebrow: '投标协同中心', title: '投标工作台' },
    'project-overview': { eyebrow: '项目工作台', title: '项目概览' },
    'project-materials': { eyebrow: '项目工作台', title: '当前招标材料' },
    'enterprise-assets': { eyebrow: '企业知识中心', title: '企业资料库' },
    'review-center': { eyebrow: '项目工作台', title: '外部评审中心' },
    'pricing-center': { eyebrow: '项目工作台', title: '报价测算中心' },
    'deliverable-editor': { eyebrow: '项目工作台', title: '成果在线编辑' },
    'history-prices': { eyebrow: '报价数据中心', title: '历史报价' },
  };
  return labels[route] ?? { eyebrow: 'AI电网投标助手', title: '页面' };
}

function adaptIngestion(item: EnterpriseIngestion): EnterpriseIngestionItem {
  const status: EnterpriseIngestionItem['status'] = item.status === 3
    ? 'completed'
    : item.status >= 4
      ? 'failed'
      : item.status === 2
        ? 'extracting'
        : 'queued';
  return {
    id: String(item.ingest_id),
    name: `资料归类任务 #${item.ingest_id}`,
    status,
    progress: status === 'completed' ? 100 : undefined,
  };
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
  return ({ 1: 'business', 2: 'technical', 3: 'quote' } as const)[deliverable.deliverable_type];
}

function deliverableTypeLabel(id: DeliverableRouteId) {
  return ({ business: '商务标', technical: '技术标', quote: '报价单' } as const)[id];
}

function toWorkspaceMaterials(materials: ProjectMaterial[]): WorkspaceMaterial[] {
  const statuses: Record<ProjectMaterial['parseStatus'], string> = {
    failed: '解析失败', needs_confirmation: '待确认', parsed: '已识别', parsing: '解析中', queued: '待解析',
  };
  return materials.map((material) => ({
    id: material.id,
    name: material.name,
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
  return assets.map((asset) => ({ id: `enterprise:${asset.id}`, name: asset.name, status: statuses[asset.status], tone: tones[asset.status] }));
}

function asId(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function readHistorySamples(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { samples: [], snapshotIds: [] };
  const record = payload as Record<string, unknown>;
  const samples = Array.isArray(record.samples) ? record.samples : [];
  const snapshotIds = Array.isArray(record.snapshot_ids) ? record.snapshot_ids : [];
  return {
    samples: samples.filter((sample): sample is Parameters<typeof adaptBackendHistorySamples>[0][number] =>
      Boolean(sample && typeof sample === 'object' && 'material_name' in sample && 'win_price' in sample && 'win_date' in sample)),
    snapshotIds: snapshotIds.filter((id): id is string | number => typeof id === 'string' || typeof id === 'number'),
  };
}

function toHistoryRecords(samples: HistoryPriceSample[]): HistoricalQuoteRecord[] {
  return samples.map((sample) => ({
    id: sample.id,
    projectName: '—',
    tenderer: '—',
    year: Number(sample.occurredAt.slice(0, 4)) || 0,
    packageName: '—',
    materialName: sample.materialName,
    materialCode: sample.materialCode || sample.materialRef || sample.id,
    specification: sample.specification,
    region: sample.region || '—',
    quantity: undefined,
    supplier: '—',
    unitPrice: Number.isFinite(Number(sample.price)) ? Number(sample.price) : undefined,
    taxRate: sample.taxIncluded === undefined
      ? '税口径未提供'
      : sample.taxIncluded
        ? '含税（税率未提供）'
        : '未税',
    awardedAt: sample.occurredAt,
    source: sample.sourceLabel,
    parameterDifference: '—',
    similarity: 'reference',
  }));
}

function taskPhaseLabel(phase: string) {
  return ({ bid_review: '成果校核', bid_generate: '成果编制', tender_parse: '材料解析' } as Record<string, string>)[phase] ?? '智能任务';
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
  importId: string,
  generation: number,
  guard: ReturnType<typeof createTenantGenerationGuard>,
  reload: (projectId: string) => Promise<void>,
  setStatus: (message: { tone: 'error' | 'info'; text: string } | null) => void,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!guard.isCurrent(generation)) return;
    try {
      const job = await backendApi.tenderNotices.getImport(projectId, importId);
      if (job.status === 'succeeded') {
        await reload(projectId);
        guard.commit(generation, () => {
          setStatus({ tone: 'info', text: '招标公告已下载、解析并加入当前项目材料。' });
        });
        return;
      }
      if (job.status === 'failed') {
        guard.commit(generation, () => {
          setStatus({ tone: 'error', text: job.error || '招标公告网址解析失败。' });
        });
        return;
      }
    } catch (error) {
      guard.commit(generation, () => {
        setStatus({ tone: 'error', text: readableError(error, '招标公告导入状态查询失败。') });
      });
      return;
    }
  }
  guard.commit(generation, () => {
    setStatus({ tone: 'info', text: '招标公告仍在后台处理，可稍后刷新项目材料查看。' });
  });
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
