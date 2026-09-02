import {
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck2,
} from 'lucide-react';

import { AppLink, deliverableEditorPath } from '../../app/router';
import type { EnterpriseAssetCategoryFolder } from '../../features/enterprise-assets';
import type { ProjectSummary } from './project-view-model';
import {
  ProjectOutcomeReviewPanel,
  type ProjectOutcomeReviewViewModel,
  type ProjectOutcomeScore,
} from './ProjectOutcomeReviewPanel';
import {
  ProjectWorkbench,
  ResultCover,
  type WorkspaceMaterial,
} from './ProjectWorkbench';
import { ProjectWorkspaceTabs } from './ProjectWorkspaceTabs';
import {
  ProjectEntryChoice,
  ProjectOptimizationFlow,
  ProjectTaskExecutionPanel,
  ProjectWorkflowFrame,
  ProjectWorkflowResourcePanel,
  fallbackWorkflowTask,
  resolveProjectWorkflowPhase,
  type ProjectWorkflowFacts,
  type ProjectWorkflowTaskSummary,
} from './ProjectWorkflow';
import './project-overview-0802.css';

type ProjectOverviewPageProps = {
  deliverables?: ProjectDeliverableView[];
  deliverablesRequest?: DeliverablesRequestView;
  enterpriseCategories?: EnterpriseAssetCategoryFolder[];
  enterpriseLibraryKey?: string;
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantSend?: (value: string) => void | Promise<void>;
  onOpenImprovementSuggestions?: () => void;
  onStartWorkflow?: () => void;
  onOpenTasks: () => void;
  onSelectVersion?: (option: ProjectOverviewVersionOption) => void;
  overview?: ProjectOverviewView;
  project?: ProjectSummary;
  projectId: string;
  outcomeReview?: ProjectOutcomeReviewViewModel;
  taskSummary?: ProjectWorkflowTaskSummary;
  versionOptions?: ProjectOverviewVersionOption[];
  workflowFacts?: ProjectWorkflowFacts;
  downloadHrefFor?: (deliverable: ProjectDeliverableView) => string;
  onDownloadDeliverable?: (deliverable: ProjectDeliverableView) => void | Promise<void>;
};

export type DeliverablesRequestView = {
  endpoint: string;
  errorMessage?: string;
  method?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
};

export type ProjectTaskStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'waiting_user'
  | 'succeeded'
  | 'failed';

export type ProjectDeliverableView = {
  id: 'business' | 'technical' | 'quote';
  lift: string;
  missing?: number;
  pages?: number;
  score: string;
  title: string;
  tone: 'business' | 'technical' | 'quote';
  versionId?: string;
  words: string;
};

export type ProjectOverviewVersionOption = {
  deliverableId: ProjectDeliverableView['id'];
  isCurrent?: boolean;
  title: string;
  versionId: string;
};

export type ProjectOverviewView = {
  deliverables: ProjectDeliverableView[];
  score: ProjectOutcomeScore;
};

export function ProjectOverviewPage({
  deliverables,
  deliverablesRequest,
  enterpriseCategories = [],
  enterpriseLibraryKey,
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantAddFiles,
  onAssistantSend,
  onOpenImprovementSuggestions,
  onStartWorkflow,
  onOpenTasks,
  onSelectVersion,
  overview,
  project: projectOverride,
  projectId,
  outcomeReview,
  taskSummary,
  versionOptions,
  workflowFacts,
  downloadHrefFor,
  onDownloadDeliverable,
}: ProjectOverviewPageProps) {
  const project = projectOverride;
  const visibleDeliverables = deliverables ?? overview?.deliverables;
  const taskPercent = taskSummary ? normalizeTaskPercent(taskSummary.percent) : null;
  const taskProgressLabel = taskPercent === null ? '进度待更新' : `${taskPercent}%`;

  if (!project) {
    return (
      <section className="empty-page" aria-labelledby="missing-project-title">
        <span className="empty-page__code">未找到</span>
        <h2 id="missing-project-title">这个项目不存在或已被移出当前企业</h2>
        <p>返回项目列表选择一个可访问的工作台。</p>
        <AppLink className="button button--primary" to="/projects">
          返回项目列表
        </AppLink>
      </section>
    );
  }

  const hasVisibleDeliverables = Boolean(
    visibleDeliverables
      && visibleDeliverables.length > 0
      && (workflowFacts ? workflowFacts.hasDeliverables : true),
  );
  const workflowPhase = workflowFacts ? resolveProjectWorkflowPhase(workflowFacts) : undefined;
  const showWorkflowResults = hasVisibleDeliverables
    && (!workflowFacts || workflowPhase === 'completed');
  const workflowResourceState = workflowFacts?.materialsState !== undefined
    && workflowFacts.materialsState !== 'ready'
    ? workflowFacts.materialsState
    : workflowFacts?.deliverablesState !== undefined && workflowFacts.deliverablesState !== 'ready'
      ? workflowFacts.deliverablesState
      : null;
  const workflowTask = taskSummary ?? (workflowPhase === 'executing'
    || workflowPhase === 'finalizing'
    || workflowPhase === 'failed'
    ? fallbackWorkflowTask(workflowPhase)
    : undefined);
  const workbench = (
    <ProjectWorkbench
      enterpriseCategories={enterpriseCategories}
      enterpriseLibraryKey={enterpriseLibraryKey}
      enterpriseMaterials={enterpriseMaterials}
      heightMode="content"
      footerHint="请输入您的问题，如“请分析招标文件的评分细则”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
      onAssistantAddFiles={onAssistantAddFiles}
      onAssistantSend={onAssistantSend}
      workspaceNavigation={!workflowFacts || showWorkflowResults
        ? <ProjectWorkspaceTabs activeTab="overview" projectId={projectId} />
        : undefined}
      rightRail={(
        <ProjectOutcomeReviewPanel
          onOpenImprovementSuggestions={onOpenImprovementSuggestions}
          onOpenReviewCenter={showWorkflowResults ? onOpenImprovementSuggestions : undefined}
          onOpenTasks={onOpenTasks}
          viewModel={outcomeReview}
        />
      )}
    >
      <section className="bv-deliverables" aria-labelledby="deliverables-title">
        <h2 className="bv-visually-hidden">{project.title}</h2>
        <header className="bv-deliverables__header">
          <div>
            <span className="bv-deliverables__title-icon"><FileCheck2 aria-hidden="true" size={24} /></span>
            <div>
              <h1 id="deliverables-title">标书成果预览</h1>
              <p><span>从项目材料到最终交付</span> · 所有成果读取当前项目冻结快照</p>
            </div>
          </div>
          <div className="bv-version-filters">
            <DeliverableVersionSelect
              onSelectVersion={onSelectVersion}
              options={versionOptions}
            />
            {taskSummary && visibleDeliverables && visibleDeliverables.length > 0 ? (
              <button
                aria-label={`查看任务进度，当前${taskProgressLabel === '进度待更新' ? '' : ' '}${taskProgressLabel}`}
                className="bv-overview-header-action"
                type="button"
                onClick={onOpenTasks}
              >
                <Clock3 aria-hidden="true" size={17} />
                查看任务进度
                <span>{taskProgressLabel}</span>
              </button>
            ) : null}
          </div>
        </header>

        {showWorkflowResults ? (
          <>
          <ProjectOptimizationFlow
            reviewReady={outcomeReview?.state === 'ready'}
          />
          <div className="bv-deliverable-grid">
          {visibleDeliverables?.map((item) => (
            <article className="bv-deliverable-card" key={item.id}>
              <span className="bv-deliverable-card__status">{item.versionId ? `V${item.versionId}` : '尚无版本'}</span>
              <ResultCover title={item.title} tone={item.tone} />
              <h2>{item.title}</h2>
              <dl>
                <div><dt>总页数</dt><dd>{item.pages === undefined ? '—' : `${item.pages} 页`}</dd></div>
                <div><dt>总字数</dt><dd>{item.words}字</dd></div>
                <div><dt>总评分</dt><dd>{item.score}</dd></div>
                <div><dt>可提升分数</dt><dd>{item.lift}</dd></div>
                <div className={item.missing !== undefined && item.missing > 0 ? 'is-warning' : ''}><dt>缺资料份数</dt><dd>{item.missing === undefined ? '—' : `${item.missing} 份`}</dd></div>
              </dl>
              <div className="bv-deliverable-card__actions">
                {item.versionId ? (
                  <AppLink
                    aria-label={`预览${item.title}`}
                    to={deliverableEditorPath(projectId, item.id, item.versionId)}
                  >
                    预览文件 <Eye aria-hidden="true" size={17} />
                  </AppLink>
                ) : (
                  <button aria-label={`${item.title}尚无可预览版本`} disabled type="button">
                    尚无版本 <Eye aria-hidden="true" size={17} />
                  </button>
                )}
                {!item.versionId ? (
                  <button aria-label={`${item.title}尚无可下载版本`} disabled type="button">
                    <Download aria-hidden="true" size={18} />
                  </button>
                ) : onDownloadDeliverable ? (
                  <button
                    aria-label={`下载${item.title}`}
                    type="button"
                    onClick={() => void onDownloadDeliverable(item)}
                  >
                    <Download aria-hidden="true" size={18} />
                  </button>
                ) : downloadHrefFor ? (
                  <a aria-label={`下载${item.title}`} download href={downloadHrefFor(item)}>
                    <Download aria-hidden="true" size={18} />
                  </a>
                ) : (
                  <button aria-label={`下载${item.title}`} disabled type="button">
                    <Download aria-hidden="true" size={18} />
                  </button>
                )}
              </div>
            </article>
          ))}
          </div>
          </>
        ) : workflowFacts && workflowTask ? (
          <ProjectTaskExecutionPanel onOpenTasks={onOpenTasks} task={workflowTask} />
        ) : workflowFacts && workflowResourceState ? (
          <ProjectWorkflowResourcePanel state={workflowResourceState} />
        ) : workflowFacts ? (
          <ProjectEntryChoice
            enterpriseReady={workflowFacts.enterpriseMaterialCount > 0}
            onGenerate={onStartWorkflow ?? (() => undefined)}
          />
        ) : (
          <DeliverablesEmptyState
            onOpenTasks={onOpenTasks}
            request={deliverablesRequest}
            taskSummary={taskSummary}
          />
        )}
      </section>
    </ProjectWorkbench>
  );

  return workflowFacts ? (
    <ProjectWorkflowFrame facts={workflowFacts}>{workbench}</ProjectWorkflowFrame>
  ) : workbench;
}

type DeliverablesEmptyStateProps = {
  onOpenTasks: () => void;
  request?: DeliverablesRequestView;
  taskSummary?: ProjectOverviewPageProps['taskSummary'];
};

function DeliverablesEmptyState({
  onOpenTasks,
  request,
  taskSummary,
}: DeliverablesEmptyStateProps) {
  const requestStatus = request?.status ?? 'idle';
  const taskContent = taskSummary?.status
    ? taskEmptyStateContent[taskSummary.status]
    : taskSummary
      ? genericTaskEmptyStateContent
      : undefined;
  const content = taskContent ?? requestEmptyStateContent[requestStatus];
  const taskPercent = taskSummary ? normalizeTaskPercent(taskSummary.percent) : null;
  const StateIcon = taskSummary?.status === 'succeeded'
    ? CheckCircle2
    : taskSummary
      ? Clock3
      : FileCheck2;

  return (
    <div
      aria-label={content.title}
      className={`bv-overview-empty bv-overview-empty--user bv-overview-empty--${taskSummary ? 'task' : requestStatus}`}
      data-request-status={requestStatus}
      data-task-status={taskSummary?.status}
      role="status"
    >
      <StateIcon aria-hidden="true" size={38} />
      <strong>{content.title}</strong>
      <p>{content.description}</p>

      {taskSummary ? (
        <div className={`bv-overview-empty__task bv-overview-empty__task--${taskSummary.status ?? 'unknown'}`}>
          <div className="bv-overview-empty__task-heading">
            <span>
              <small>{taskSummary.title}</small>
              <strong>{taskContent?.statusLabel ?? '任务状态更新中'}</strong>
            </span>
            <strong>{taskPercent === null ? '进度待更新' : `${taskPercent}%`}</strong>
          </div>
          {taskPercent === null ? null : (
            <div
              aria-label="成果生成任务进度"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={taskPercent}
              aria-valuetext={`${taskPercent}% · ${taskContent?.statusLabel ?? '任务状态更新中'}`}
              className="bv-overview-empty__progress"
              role="progressbar"
            >
              <span style={{ width: `${taskPercent}%` }} />
            </div>
          )}
          <p className="bv-overview-empty__task-message">
            {taskContent?.message ?? taskSummary.message}
          </p>
          <button onClick={onOpenTasks} type="button">查看任务进度</button>
        </div>
      ) : null}
    </div>
  );
}

function DeliverableVersionSelect({
  onSelectVersion,
  options = [],
}: {
  onSelectVersion?: (option: ProjectOverviewVersionOption) => void;
  options?: ProjectOverviewVersionOption[];
}) {
  const currentOption = options.find((option) => option.isCurrent) ?? options[0];
  const currentKey = currentOption ? versionOptionKey(currentOption) : '';
  const resetKey = `${currentKey}:${options.map(versionOptionKey).join('|')}`;

  return (
    <label className="bv-version-select">
      <span>成果版本</span>
      <select
        defaultValue={currentKey}
        disabled={options.length === 0}
        key={resetKey}
        onChange={(event) => {
          const option = options.find((candidate) => versionOptionKey(candidate) === event.target.value);
          if (option) onSelectVersion?.(option);
        }}
      >
        {options.length === 0 ? <option value="">暂无成果版本</option> : null}
        {options.map((option) => (
          <option key={versionOptionKey(option)} value={versionOptionKey(option)}>
            {option.title} · {formatVersionNumber(option.versionId)}{option.isCurrent ? ' · 当前' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function versionOptionKey(option: ProjectOverviewVersionOption) {
  return `${option.deliverableId}:${option.versionId}`;
}

function formatVersionNumber(versionId: string) {
  const normalized = versionId.trim();
  const suffixMatch = normalized.match(/(?:^|[-_])v(\d+(?:\.\d+)*)$/i);
  if (suffixMatch) return `V${suffixMatch[1]}`;
  if (/^v/i.test(normalized)) return `V${normalized.slice(1)}`;
  return `V${normalized}`;
}

type EmptyStateContent = {
  description: string;
  message?: string;
  statusLabel?: string;
  title: string;
};

const requestEmptyStateContent: Record<DeliverablesRequestView['status'], EmptyStateContent> = {
  idle: {
    title: '当前暂无标书成果',
    description: '尚未发现成果生成任务，请完成材料准备后发起成果生成。',
  },
  loading: {
    title: '正在加载标书成果',
    description: '正在获取当前项目的成果状态，请稍候。',
  },
  success: {
    title: '当前暂无标书成果',
    description: '尚未发现成果生成任务，请完成材料准备后发起成果生成。',
  },
  error: {
    title: '暂时无法加载标书成果',
    description: '成果状态暂时不可用，请稍后重试。',
  },
};

const genericTaskEmptyStateContent: EmptyStateContent = {
  title: '成果生成任务处理中',
  description: '任务状态正在更新，请通过任务进度查看最新动态。',
  statusLabel: '任务状态更新中',
};

const taskEmptyStateContent: Record<
  NonNullable<ProjectWorkflowTaskSummary['status']>,
  EmptyStateContent
> = {
  queued: {
    title: '成果生成正在执行',
    description: '系统正在根据当前项目材料生成成果，请留意任务进度。',
    message: '任务已提交，系统正在处理，请留意任务进度。',
    statusLabel: '执行中',
  },
  running: {
    title: '成果生成正在执行',
    description: '系统正在根据当前项目材料生成成果，请留意任务进度。',
    message: '任务已提交，系统正在处理，请留意任务进度。',
    statusLabel: '执行中',
  },
  retrying: {
    title: '成果生成任务正在重试',
    description: '上次执行尚未完成，系统正在等待下一次重试。',
    statusLabel: '等待重试',
  },
  waiting_user: {
    title: '成果生成等待您的处理',
    description: '请查看任务详情并完成所需操作，任务随后才能继续。',
    statusLabel: '等待用户处理',
  },
  succeeded: {
    title: '成果生成任务已完成',
    description: '任务已完成，成果列表正在更新；如长时间未显示，请查看任务详情。',
    statusLabel: '任务已完成',
  },
  sync_error: {
    title: '成果版本同步超时',
    description: '生成任务已经结束，但成果版本尚未返回。请重新同步项目数据。',
    statusLabel: '等待重新同步',
  },
  failed: {
    title: '成果生成失败',
    description: '本次生成任务未成功，请查看任务详情了解可公开的失败信息。',
    statusLabel: '生成失败',
  },
};

function normalizeTaskPercent(percent: number | null) {
  if (percent === null) return null;
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
