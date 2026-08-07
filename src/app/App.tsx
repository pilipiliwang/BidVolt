import { useEffect, useMemo, useState } from 'react';

import { PricingCenter } from '../domains/pricing/PricingCenter';
import type { HistoryPriceSample, QuoteCalculationView } from '../domains/pricing/types';
import { LoginPage } from '../domains/auth/LoginPage';
import { LandingPage } from '../domains/marketing/LandingPage';
import { DeliverableEditorPage } from '../domains/editor';
import { HistoryPricesPage } from '../domains/history';
import { ProjectListPage } from '../domains/projects/ProjectListPage';
import { ProjectOverviewPage } from '../domains/projects/ProjectOverviewPage';
import type { WorkspaceMaterial } from '../domains/projects/ProjectWorkbench';
import { ReviewCenter } from '../domains/review/ReviewCenter';
import type { ReviewRunView } from '../domains/review/types';
import {
  projectSummaries,
  type ProjectSummary,
} from '../domains/projects/project-view-model';
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
import { TaskProgressDrawer } from '../shared/ui/TaskProgressDrawer';
import type { PublicTaskEvent } from '../shared/api/task-events';
import { AppShell } from './AppShell';
import {
  defaultProjectId,
  enterpriseAssetsDemo,
  enterpriseIngestionDemo,
  historyPriceSamplesDemo,
  projectMaterialsDemo,
  projectOverviewDemoByProjectId,
  projectRequirementsDemo,
  projectSnapshotsDemo,
  projectWorkspaceMaterialsDemoByProjectId,
  publicTaskEventsDemo,
  quoteCalculationDemo,
  reviewProvidersDemo,
  reviewRunDemo,
} from './demo-data';
import { AppLink, navigate, useUrlRoute } from './router';
import { demoSession, getEditorDraftScopeKey, getProjectScopeKey } from './session';

type ProjectDomainState<T> = Record<string, T[]>;

export function App() {
  const session = demoSession;
  const defaultScopeKey = getProjectScopeKey(session.enterpriseId, defaultProjectId);
  const route = useUrlRoute();
  const [isAuthenticated, setAuthenticated] = useState(
    () => route.name !== 'login' && route.name !== 'landing',
  );
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>(projectSummaries);
  const [enterpriseAssets, setEnterpriseAssets] = useState<
    ProjectDomainState<EnterpriseAsset>
  >({ [session.enterpriseId]: enterpriseAssetsDemo });
  const [enterpriseIngestion, setEnterpriseIngestion] = useState<
    ProjectDomainState<EnterpriseIngestionItem>
  >({ [session.enterpriseId]: enterpriseIngestionDemo });
  const [projectMaterials, setProjectMaterials] = useState<ProjectDomainState<ProjectMaterial>>({
    [defaultScopeKey]: projectMaterialsDemo,
  });
  const [projectRequirements, setProjectRequirements] = useState<
    ProjectDomainState<ProjectRequirement>
  >({
    [defaultScopeKey]: projectRequirementsDemo,
  });
  const [projectSnapshots] = useState<ProjectDomainState<ProjectSnapshot>>({
    [defaultScopeKey]: projectSnapshotsDemo,
  });
  const [reviewRuns, setReviewRuns] = useState<Record<string, ReviewRunView>>({
    [defaultScopeKey]: reviewRunDemo,
  });
  const [appliedStrategyIds, setAppliedStrategyIds] = useState<Record<string, string>>({});
  const [quoteCalculations] = useState<Record<string, QuoteCalculationView>>({
    [defaultScopeKey]: quoteCalculationDemo,
  });
  const [historyPriceSamples] = useState<Record<string, HistoryPriceSample[]>>({
    [defaultScopeKey]: historyPriceSamplesDemo,
  });
  const [taskEvents, setTaskEvents] = useState<Record<string, PublicTaskEvent[]>>({
    [defaultScopeKey]: publicTaskEventsDemo,
  });

  const routeProjectId = 'projectId' in route ? route.projectId : undefined;
  const activeScopeKey = routeProjectId
    ? getProjectScopeKey(session.enterpriseId, routeProjectId)
    : undefined;
  const activeProject = routeProjectId
    ? projects.find((project) => project.id === routeProjectId)
    : undefined;
  const activeEnterpriseMaterials = toWorkspaceEnterpriseMaterials(
    enterpriseAssets[session.enterpriseId] ?? [],
  );
  const activeProjectMaterials = activeScopeKey ? projectMaterials[activeScopeKey] ?? [] : [];
  const demoWorkspaceMaterials = routeProjectId
    ? projectWorkspaceMaterialsDemoByProjectId[routeProjectId]
    : undefined;
  const activeWorkspaceMaterials = routeProjectId
    ? demoWorkspaceMaterials
      ? [
          ...demoWorkspaceMaterials,
          ...toWorkspaceMaterials(
            activeProjectMaterials.filter((material) =>
              isProjectUpload(material, routeProjectId),
            ),
          ),
        ]
      : toWorkspaceMaterials(activeProjectMaterials)
    : [];
  const activeOverview = routeProjectId
    ? projectOverviewDemoByProjectId[routeProjectId]
    : undefined;
  const activeDeliverable =
    route.name === 'deliverable-editor'
      ? activeOverview?.deliverables.find(
          (deliverable) =>
            deliverable.id === route.deliverableId &&
            deliverable.versionId === route.versionId,
        )
      : undefined;

  const pageMeta = useMemo(() => {
    switch (route.name) {
      case 'landing':
        return { eyebrow: '电力行业投标智能工作台', title: '产品首页' };
      case 'login':
        return { eyebrow: 'AI电网投标助手', title: '登录' };
      case 'project-overview':
        return { eyebrow: '项目工作台', title: '项目概览' };
      case 'project-materials':
        return { eyebrow: '项目工作台', title: '当前招标材料' };
      case 'enterprise-assets':
        return { eyebrow: '企业知识中心', title: '企业资料库' };
      case 'review-center':
        return { eyebrow: '项目工作台', title: '外部评审中心' };
      case 'pricing-center':
        return { eyebrow: '项目工作台', title: '报价测算中心' };
      case 'deliverable-editor':
        return { eyebrow: '项目工作台', title: '成果在线编辑' };
      case 'history-prices':
        return { eyebrow: '报价数据中心', title: '历史报价' };
      case 'not-found':
        return { eyebrow: 'AI电网投标助手', title: '页面未找到' };
      default:
        return { eyebrow: '投标协同中心', title: '项目列表' };
    }
  }, [route.name]);

  useEffect(() => {
    document.title = `${pageMeta.title} · AI电网投标助手`;
    document.getElementById('main-content')?.focus();
  }, [pageMeta.title, routeProjectId]);

  const handleEnterpriseUpload = (files: File[]) => {
    const uploadBatchId = Date.now();
    const incomingIngestion = files.map<EnterpriseIngestionItem>((file, index) => ({
      id: `enterprise-upload-${uploadBatchId}-${index}`,
      name: file.name,
      status: 'classifying',
      progress: 18,
    }));
    const incomingAssets = files.map<EnterpriseAsset>((file, index) => {
      const assetId = `enterprise-asset-${uploadBatchId}-${index}`;
      return {
        id: assetId,
        name: file.name,
        category: 'other',
        classificationConfidence: 0,
        status: 'processing',
        updatedAt: '刚刚',
        facts: [],
        revisions: [
          {
            id: `${assetId}-revision-1`,
            revisionNo: 1,
            createdAt: '刚刚',
            createdBy: session.user.displayName,
            changeNote: '已上传，等待 Agent 自动归类与字段抽取',
            isCurrent: true,
          },
        ],
      };
    });

    setEnterpriseIngestion((current) => ({
      ...current,
      [session.enterpriseId]: [
        ...incomingIngestion,
        ...(current[session.enterpriseId] ?? []),
      ],
    }));
    setEnterpriseAssets((current) => ({
      ...current,
      [session.enterpriseId]: [
        ...incomingAssets,
        ...(current[session.enterpriseId] ?? []),
      ],
    }));
  };

  const handleEnterpriseCorrection = (assetId: string, factKey: string, value: string) => {
    setEnterpriseAssets((current) => ({
      ...current,
      [session.enterpriseId]: (current[session.enterpriseId] ?? []).map((asset) => {
        if (asset.id !== assetId) return asset;

        const facts = asset.facts.map((fact) =>
          fact.key === factKey
            ? { ...fact, value, confidence: 1, needsReview: false }
            : fact,
        );
        const nextRevisionNo = Math.max(0, ...asset.revisions.map((item) => item.revisionNo)) + 1;
        return {
          ...asset,
          facts,
          status: facts.some((fact) => fact.needsReview) ? 'needs_review' : 'ready',
          updatedAt: '刚刚',
          revisions: [
            {
              id: `${asset.id}-revision-${nextRevisionNo}`,
              revisionNo: nextRevisionNo,
              createdAt: '刚刚',
              createdBy: '当前用户',
              changeNote: `人工纠正字段：${factKey}`,
              isCurrent: true,
            },
            ...asset.revisions.map((revision) => ({ ...revision, isCurrent: false })),
          ],
        };
      }),
    }));
  };

  const handleProjectUpload = (projectId: string, files: File[]) => {
    setProjectMaterials((current) => {
      const scopeKey = getProjectScopeKey(session.enterpriseId, projectId);
      const existing = current[scopeKey] ?? [];
      const incoming = files.map<ProjectMaterial>((file, index) => ({
        id: `${projectId}-upload-${Date.now()}-${index}`,
        name: file.name,
        kind: 'other',
        revisionNo: 1,
        parseStatus: 'queued',
        parseProgress: 0,
        uploadedAt: '刚刚',
      }));
      return { ...current, [scopeKey]: [...incoming, ...existing] };
    });
  };

  const handleConfirmRequirement = (projectId: string, requirementId: string) => {
    const scopeKey = getProjectScopeKey(session.enterpriseId, projectId);
    setProjectRequirements((current) => ({
      ...current,
      [scopeKey]: (current[scopeKey] ?? []).map((requirement) =>
        requirement.id === requirementId
          ? { ...requirement, confirmationStatus: 'confirmed' }
          : requirement,
      ),
    }));
  };

  const handleStartProjectTask = (
    projectId: string,
    mode: 'generate' | 'validate',
  ) => {
    const scopeKey = getProjectScopeKey(session.enterpriseId, projectId);
    const createdAt = new Date();
    const taskId = `${projectId}-${mode}-task-${createdAt.getTime()}`;

    setTaskEvents((current) => {
      const existing = current[scopeKey] ?? [];
      const sequence = existing.reduce(
        (highest, event) => Math.max(highest, event.sequence),
        0,
      ) + 1;
      const event: PublicTaskEvent = {
        schema_version: '1',
        event_id: `${taskId}-queued`,
        sequence,
        task_id: taskId,
        project_id: projectId,
        phase: mode === 'validate' ? 'checking' : 'drafting',
        status: 'queued',
        percent: 0,
        public_message:
          mode === 'validate'
            ? '校核任务已创建，正在等待处理。'
            : '生成任务已创建，正在等待处理。',
        error_code: null,
        occurred_at: createdAt.toISOString(),
      };

      return { ...current, [scopeKey]: [event, ...existing] };
    });
    setTaskDrawerProjectId(projectId);
  };

  const activeReviewRun =
    activeScopeKey && routeProjectId
      ? reviewRuns[activeScopeKey] ?? createEmptyReviewRun(routeProjectId)
      : undefined;
  const activeQuoteCalculation =
    activeScopeKey && routeProjectId
      ? quoteCalculations[activeScopeKey] ?? createEmptyQuoteCalculation(routeProjectId)
      : undefined;
  const activeHistoryPriceSamples = activeScopeKey
    ? historyPriceSamples[activeScopeKey] ?? []
    : [];
  const activeTaskEvents = activeScopeKey ? taskEvents[activeScopeKey] ?? [] : [];
  const latestTaskEvent = activeTaskEvents.reduce<PublicTaskEvent | undefined>(
    (latest, event) => (!latest || event.sequence > latest.sequence ? event : latest),
    undefined,
  );
  const activeTaskCount = activeTaskEvents.some((event) =>
    ['queued', 'running', 'retrying', 'waiting_user'].includes(event.status),
  )
    ? 1
    : 0;
  const selectedStrategy = activeQuoteCalculation?.strategies.find(
    (strategy) => activeScopeKey && strategy.id === appliedStrategyIds[activeScopeKey],
  );
  const openTaskDrawer = () => {
    if (routeProjectId) {
      setTaskDrawerProjectId(routeProjectId);
    }
  };

  if (route.name === 'landing') {
    return <LandingPage />;
  }

  if (!isAuthenticated || route.name === 'login') {
    return (
      <LoginPage
        onLogin={() => {
          setAuthenticated(true);
          navigate('/projects', { replace: true });
        }}
      />
    );
  }

  return (
    <AppShell
      currentProjectId={routeProjectId}
      currentRoute={route.name}
      eyebrow={pageMeta.eyebrow}
      enterpriseName={session.enterpriseName}
      title={pageMeta.title}
      onLogout={() => {
        setAuthenticated(false);
        navigate('/login', { replace: true });
      }}
      onOpenTasks={openTaskDrawer}
      projectSummary={activeProject}
      taskCount={activeTaskCount}
      user={session.user}
    >
      {route.name === 'projects' ? (
        <ProjectListPage
          projects={projects}
          onCreateProject={(project) => {
            setProjects((current) => [project, ...current]);
            navigate(`/projects/${encodeURIComponent(project.id)}/materials`);
          }}
        />
      ) : null}
      {route.name === 'project-overview' ? (
        <ProjectOverviewPage
          enterpriseMaterials={activeEnterpriseMaterials}
          materials={activeWorkspaceMaterials}
          overview={activeOverview}
          project={activeProject}
          projectId={route.projectId}
          onAddEnterpriseFiles={handleEnterpriseUpload}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files)}
          onOpenTasks={openTaskDrawer}
          taskSummary={
            latestTaskEvent?.percent != null && activeTaskCount > 0
              ? {
                  message: latestTaskEvent.public_message,
                  percent: latestTaskEvent.percent,
                  title: taskPhaseLabel(latestTaskEvent.phase),
                }
              : undefined
          }
        />
      ) : null}
      {route.name === 'enterprise-assets' ? (
        <EnterpriseAssetsPage
          assets={enterpriseAssets[session.enterpriseId] ?? []}
          enterpriseName={session.enterpriseName}
          ingestionItems={enterpriseIngestion[session.enterpriseId] ?? []}
          onCorrectFact={handleEnterpriseCorrection}
          onUpload={handleEnterpriseUpload}
        />
      ) : null}
      {route.name === 'history-prices' ? <HistoryPricesPage /> : null}
      {route.name === 'project-materials' && activeProject && activeScopeKey ? (
        <ProjectMaterialsPage
          key={route.projectId}
          enterpriseMaterials={activeEnterpriseMaterials}
          materials={projectMaterials[activeScopeKey] ?? []}
          onAddEnterpriseFiles={handleEnterpriseUpload}
          projectId={route.projectId}
          projectName={activeProject.title}
          requirements={projectRequirements[activeScopeKey] ?? []}
          snapshots={projectSnapshots[activeScopeKey] ?? []}
          onConfirmRequirement={handleConfirmRequirement}
          onStartTask={handleStartProjectTask}
          onUpload={handleProjectUpload}
        />
      ) : null}
      {route.name === 'review-center' && activeProject && activeReviewRun && activeScopeKey ? (
        <ReviewCenter
          key={route.projectId}
          enterpriseMaterials={activeEnterpriseMaterials}
          materials={activeWorkspaceMaterials}
          onAddEnterpriseFiles={handleEnterpriseUpload}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files)}
          projectId={route.projectId}
          providers={reviewProvidersDemo}
          runAllowed={Boolean(reviewRuns[activeScopeKey])}
          runBlockReason="请先冻结项目快照并生成至少一个成果版本。"
          run={{
            ...activeReviewRun,
            projectSnapshotId: `${route.projectId} · ${activeReviewRun.projectSnapshotId}`,
          }}
          onRun={(providerId) => {
            const provider = reviewProvidersDemo.find((item) => item.id === providerId);
            setReviewRuns((current) => {
              const existing = current[activeScopeKey] ?? createEmptyReviewRun(route.projectId);
              return {
                ...current,
                [activeScopeKey]: {
                  ...existing,
                  id: `${route.projectId}-review-pending`,
                  providerId,
                  providerVersion: provider?.version,
                  responseHash: undefined,
                  finishedAt: undefined,
                  findings: [],
                  status: 'running',
                },
              };
            });
          }}
        />
      ) : null}
      {route.name === 'pricing-center' && activeProject && activeQuoteCalculation && activeScopeKey ? (
        <>
          {selectedStrategy ? (
            <div className="integration-status" role="status">
              已确认“{selectedStrategy.name}”，系统将创建新的报价单版本；外部历史库保持只读。
            </div>
          ) : null}
          <PricingCenter
            key={route.projectId}
            calculation={activeQuoteCalculation}
            enterpriseMaterials={activeEnterpriseMaterials}
            materials={activeWorkspaceMaterials}
            onAddEnterpriseFiles={handleEnterpriseUpload}
            onAddFiles={(files) => handleProjectUpload(route.projectId, files)}
            samples={activeHistoryPriceSamples}
            onApply={(strategyId) =>
              setAppliedStrategyIds((current) => ({
                ...current,
                [activeScopeKey]: strategyId,
              }))
            }
          />
        </>
      ) : null}
      {route.name === 'deliverable-editor' && activeProject && activeDeliverable ? (
        <DeliverableEditorPage
          key={`${getEditorDraftScopeKey(
            session.enterpriseId,
            session.userId,
            route.projectId,
          )}:${route.deliverableId}:${route.versionId}`}
          deliverableId={route.deliverableId}
          draftScopeId={getEditorDraftScopeKey(
            session.enterpriseId,
            session.userId,
            route.projectId,
          )}
          enterpriseMaterials={activeEnterpriseMaterials}
          materials={activeWorkspaceMaterials}
          onAddEnterpriseFiles={handleEnterpriseUpload}
          onAddFiles={(files) => handleProjectUpload(route.projectId, files)}
          project={activeProject}
          projectId={route.projectId}
          versionId={route.versionId}
        />
      ) : null}
      {route.name === 'deliverable-editor' && activeProject && !activeDeliverable ? (
        <MissingDeliverable projectId={route.projectId} />
      ) : null}
      {[
        'project-materials',
        'review-center',
        'pricing-center',
        'deliverable-editor',
      ].includes(route.name) &&
      !activeProject ? (
        <MissingProject />
      ) : null}
      {route.name === 'not-found' ? <NotFoundPage /> : null}

      {routeProjectId && activeProject ? (
        <TaskProgressDrawer
          events={activeTaskEvents}
          isOpen={taskDrawerProjectId === routeProjectId}
          onClose={() => setTaskDrawerProjectId(null)}
          projectTitle={activeProject.title}
        />
      ) : null}
    </AppShell>
  );
}

function createEmptyReviewRun(projectId: string): ReviewRunView {
  return {
    id: `${projectId}-review-not-started`,
    status: 'idle',
    projectSnapshotId: '尚未创建评审快照',
    deliverableVersions: ['暂无成果版本'],
    findings: [],
  };
}

function toWorkspaceMaterials(materials: ProjectMaterial[]): WorkspaceMaterial[] {
  const statusLabels: Record<ProjectMaterial['parseStatus'], string> = {
    failed: '解析失败',
    needs_confirmation: '待确认',
    parsed: '已识别',
    parsing: '解析中',
    queued: '待解析',
  };

  return materials.map((material) => ({
    id: material.id,
    name: material.name,
    status: statusLabels[material.parseStatus],
    tone: material.kind === 'quote_template' ? 'red' : 'blue',
  }));
}

function toWorkspaceEnterpriseMaterials(assets: EnterpriseAsset[]): WorkspaceMaterial[] {
  const statusLabels: Record<EnterpriseAsset['status'], string> = {
    failed: '处理失败',
    needs_review: '待确认',
    processing: '处理中',
    ready: '已归档',
  };
  const statusTones: Record<EnterpriseAsset['status'], WorkspaceMaterial['tone']> = {
    failed: 'red',
    needs_review: 'orange',
    processing: 'blue',
    ready: 'green',
  };

  return assets.map((asset) => ({
    id: `enterprise:${asset.id}`,
    name: asset.name,
    status: statusLabels[asset.status],
    tone: statusTones[asset.status],
  }));
}

function isProjectUpload(material: ProjectMaterial, projectId: string) {
  return material.id.startsWith(`${projectId}-upload-`);
}

function taskPhaseLabel(phase: string) {
  const labels: Record<string, string> = {
    checking: '技术方案检查',
    drafting: '成果编制',
    parsing: '材料解析',
    queued: '任务排队',
  };
  return labels[phase] ?? '智能任务';
}

function createEmptyQuoteCalculation(projectId: string): QuoteCalculationView {
  return {
    id: `${projectId}-quote-not-started`,
    status: 'needs_input',
    algorithmVersion: quoteCalculationDemo.algorithmVersion,
    sampleSnapshotId: '尚未生成样本快照',
    querySnapshotId: '尚未查询历史数据',
    message: '当前项目尚未查询历史样本或执行报价测算。',
    strategies: [],
  };
}

function MissingProject() {
  return (
    <section className="empty-page" aria-labelledby="missing-project-title">
      <span className="empty-page__code">未找到</span>
      <h1 id="missing-project-title">这个项目不存在或已被移出当前企业</h1>
      <p>返回项目列表选择一个可访问的工作台。</p>
      <AppLink className="button button--primary" to="/projects">
        返回项目列表
      </AppLink>
    </section>
  );
}

function MissingDeliverable({ projectId }: { projectId: string }) {
  return (
    <section className="empty-page" aria-labelledby="missing-deliverable-title">
      <span className="empty-page__code">未找到</span>
      <h1 id="missing-deliverable-title">当前项目没有这个成果版本</h1>
      <p>成果必须来自当前项目的受控版本，系统不会回退加载其他项目或全局演示内容。</p>
      <AppLink className="button button--primary" to={`/projects/${encodeURIComponent(projectId)}/overview`}>
        返回项目概览
      </AppLink>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="empty-page" aria-labelledby="not-found-title">
      <span className="empty-page__code">404</span>
      <h1 id="not-found-title">这个页面还没有接入</h1>
      <p>请返回项目列表继续当前投标工作。</p>
      <AppLink className="button button--primary" to="/projects">
        返回项目列表
      </AppLink>
    </section>
  );
}
