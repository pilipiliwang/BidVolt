import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePlus2,
  LoaderCircle,
  SearchCheck,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  ProjectFlowTrack,
  type ProjectFlowStageState,
} from '../../shared/ui/ProjectFlowTrack';
import './project-workflow.css';

export type ProjectWorkflowTaskStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'waiting_user'
  | 'succeeded'
  | 'sync_error'
  | 'failed';

export type ProjectWorkflowTaskSummary = {
  message: string;
  percent: number | null;
  status?: ProjectWorkflowTaskStatus;
  title: string;
};

export type ProjectWorkflowPhase =
  | 'choose'
  | 'prepare'
  | 'executing'
  | 'finalizing'
  | 'failed'
  | 'completed';

export type ProjectWorkflowResourceState = 'error' | 'loading' | 'ready';

export type ProjectWorkflowFacts = {
  agentCompletion?: 'active' | 'complete' | 'incomplete' | 'failed' | 'cancelled' | 'unknown_terminal';
  currentTenderMaterialCount: number;
  deliverablesState?: ProjectWorkflowResourceState;
  enterpriseMaterialCount: number;
  enterpriseState?: ProjectWorkflowResourceState;
  hasDeliverables: boolean;
  materialsState?: ProjectWorkflowResourceState;
  task?: ProjectWorkflowTaskSummary;
  tenderImporting?: boolean;
};

const activeTaskStatuses = new Set<ProjectWorkflowTaskStatus>([
  'queued',
  'running',
  'retrying',
  'waiting_user',
]);

function taskProgressDescription(task: ProjectWorkflowTaskSummary) {
  const percent = normalizeTaskPercent(task.percent);
  return percent === null ? task.message : `${task.message} · ${percent}%`;
}

export function resolveProjectWorkflowPhase({
  agentCompletion,
  currentTenderMaterialCount,
  hasDeliverables,
  task,
}: ProjectWorkflowFacts): ProjectWorkflowPhase {
  if (agentCompletion === 'active') return 'executing';
  if (agentCompletion === 'incomplete' || agentCompletion === 'failed'
    || agentCompletion === 'cancelled') return 'failed';
  if (task?.status === 'failed' || task?.status === 'sync_error') return 'failed';
  if (task?.status && activeTaskStatuses.has(task.status)) return 'executing';
  if (agentCompletion === 'complete' || agentCompletion === 'unknown_terminal'
    || task?.status === 'succeeded') return hasDeliverables ? 'completed' : 'finalizing';
  if (hasDeliverables) return 'completed';
  return currentTenderMaterialCount > 0 ? 'prepare' : 'choose';
}

export function buildProjectFlowStages({
  agentCompletion,
  currentTenderMaterialCount,
  deliverablesState = 'ready',
  enterpriseMaterialCount,
  enterpriseState = 'ready',
  hasDeliverables,
  materialsState = 'ready',
  task,
  tenderImporting = false,
}: ProjectWorkflowFacts): Record<
  'enterprise-assets' | 'project-materials' | 'bid-preparation' | 'deliverables',
  ProjectFlowStageState
> {
  const phase = resolveProjectWorkflowPhase({
    currentTenderMaterialCount,
    agentCompletion,
    deliverablesState,
    enterpriseMaterialCount,
    enterpriseState,
    hasDeliverables,
    materialsState,
    task,
    tenderImporting,
  });
  const taskStarted = Boolean(task);
  const materialsComplete = currentTenderMaterialCount > 0 || taskStarted || hasDeliverables;

  return {
    'enterprise-assets': {
      activity: enterpriseState === 'loading' ? 'processing' : 'manual',
      description: enterpriseState === 'loading'
        ? '正在同步企业资料库'
        : enterpriseState === 'error'
          ? '企业资料暂时无法读取'
          : enterpriseMaterialCount > 0
        ? `已同步 ${enterpriseMaterialCount} 项企业资料`
        : '企业资料库为空，可先补充资料',
      status: enterpriseState === 'loading'
        ? 'current'
        : enterpriseState === 'error'
          ? 'error'
          : enterpriseMaterialCount > 0 ? 'completed' : 'pending',
    },
    'project-materials': {
      activity: materialsState === 'loading' || tenderImporting ? 'processing' : 'manual',
      description: materialsState === 'loading'
        ? '正在同步项目材料'
        : materialsState === 'error'
        ? '项目材料暂时无法读取'
        : tenderImporting
          ? '招标公告正在导入和解析'
        : materialsComplete
        ? currentTenderMaterialCount > 0
          ? `已接收 ${currentTenderMaterialCount} 项招标材料`
          : '材料已提交并由当前任务使用'
        : '上传招标材料或导入公告网址',
      status: materialsState === 'loading'
        ? enterpriseState === 'loading' ? 'pending' : 'current'
        : materialsState === 'error'
        ? 'error'
        : materialsComplete
          ? 'completed'
          : 'current',
    },
    'bid-preparation': {
      activity: phase === 'executing' ? 'processing' : 'manual',
      description: phase === 'completed'
        ? '标书制作已完成'
        : task
          ? taskProgressDescription(task)
          : phase === 'failed'
            ? '本次制作任务未完成'
            : '材料确认后开始制作',
      status: phase === 'completed' || phase === 'finalizing'
        ? 'completed'
        : phase === 'failed'
          ? 'error'
          : phase === 'executing'
            ? 'current'
            : 'pending',
    },
    deliverables: {
      activity: phase === 'finalizing' ? 'processing' : 'manual',
      description: deliverablesState === 'error'
        ? '成果版本暂时无法读取'
        : phase === 'completed'
        ? '成果版本已返回'
        : phase === 'finalizing'
          ? '任务已完成，正在同步成果版本'
          : '等待标书制作完成',
      status: deliverablesState === 'error' && (taskStarted || agentCompletion)
        ? 'error'
        : phase === 'completed'
        ? 'completed'
        : phase === 'finalizing'
          ? 'current'
          : 'pending',
    },
  };
}

export function ProjectWorkflowFrame({
  children,
  className = '',
  facts,
}: {
  children: ReactNode;
  className?: string;
  facts: ProjectWorkflowFacts;
}) {
  return (
    <div className={`project-workflow-frame ${className}`.trim()}>
      <ProjectFlowTrack stages={buildProjectFlowStages(facts)} />
      {children}
    </div>
  );
}

export function ProjectWorkflowResourcePanel({
  state,
}: {
  state: Exclude<ProjectWorkflowResourceState, 'ready'>;
}) {
  const loading = state === 'loading';
  const Icon = loading ? LoaderCircle : AlertTriangle;

  return (
    <section
      aria-live="polite"
      className={`project-workflow-resource project-workflow-resource--${state}`}
      role={loading ? 'status' : 'alert'}
    >
      <Icon aria-hidden="true" size={38} />
      <h1>{loading ? '正在同步项目状态' : '暂时无法确认项目状态'}</h1>
      <p>{loading
        ? '正在读取项目材料、任务和成果版本，请稍候。'
        : '项目材料或成果接口暂时不可用。为避免重复发起任务，请刷新页面后再试。'}</p>
    </section>
  );
}

export function fallbackWorkflowTask(
  phase: Extract<ProjectWorkflowPhase, 'executing' | 'failed' | 'finalizing'>,
): ProjectWorkflowTaskSummary {
  return {
    message: phase === 'failed' ? '任务未完成，请打开任务详情查看原因。' : '任务状态正在同步。',
    percent: null,
    status: phase === 'failed' ? 'failed' : phase === 'finalizing' ? 'succeeded' : 'running',
    title: '成果编制',
  };
}

export function ProjectEntryChoice({
  enterpriseReady,
  onGenerate,
}: {
  enterpriseReady: boolean;
  onGenerate: () => void;
}) {
  return (
    <section className="project-entry-choice" aria-labelledby="project-entry-choice-title">
      <span className="project-entry-choice__illustration" aria-hidden="true">
        <FilePlus2 size={48} />
        <Sparkles size={22} />
      </span>
      <h1 id="project-entry-choice-title">选择本次投标任务</h1>
      <p>从招标公告或招标材料开始，系统将依据当前企业资料生成标书成果。</p>

      <div className="project-entry-choice__actions">
        <button className="project-entry-choice__primary" onClick={onGenerate} type="button">
          <FilePlus2 aria-hidden="true" size={22} />
          <span>
            <strong>生成新的标书</strong>
            <small>上传或导入招标信息后开始制作</small>
          </span>
          <ArrowRight aria-hidden="true" size={20} />
        </button>
        <button className="project-entry-choice__secondary" disabled type="button">
          <SearchCheck aria-hidden="true" size={22} />
          <span>
            <strong>审核已有标书</strong>
            <small>等待后端提供独立审核能力</small>
          </span>
          <em>待开放</em>
        </button>
      </div>

      <p className="project-entry-choice__hint">
        {enterpriseReady
          ? '企业资料已同步，可继续准备本项目材料。'
          : '企业资料库目前为空；仍可继续，但补充企业资料有助于生成更完整的标书。'}
      </p>
    </section>
  );
}

export function ProjectTaskExecutionPanel({
  onBackToMaterials,
  onOpenTasks,
  task,
}: {
  onBackToMaterials?: () => void;
  onOpenTasks: () => void;
  task: ProjectWorkflowTaskSummary;
}) {
  const percent = normalizeTaskPercent(task.percent);
  const status = task.status ?? 'running';
  const failed = status === 'failed';
  const syncError = status === 'sync_error';
  const finalizing = status === 'succeeded';
  const waiting = status === 'waiting_user';
  const Icon = failed || syncError ? AlertTriangle : finalizing ? CheckCircle2 : waiting ? Clock3 : LoaderCircle;
  const title = syncError
    ? '成果版本同步超时'
    : failed
    ? '本次成果生成未完成'
    : finalizing
      ? '正在整理标书成果'
      : waiting
        ? '成果生成等待您的处理'
        : '成果生成正在执行';
  const description = syncError
    ? '生成任务已经结束，但成果版本尚未返回。请使用页面上的重试操作重新同步。'
    : failed
    ? '请查看任务详情确认失败原因，调整材料后可以重新发起。'
    : finalizing
      ? '任务已完成，系统正在同步可预览的成果版本。'
      : waiting
        ? '任务需要补充信息或人工确认，请进入任务详情处理。'
        : '系统正在根据当前项目材料生成标书，请留意实时进度。';

  return (
    <section
      className={`project-task-execution project-task-execution--${status}`}
      data-task-status={status}
      role="status"
    >
      <Icon aria-hidden="true" size={39} />
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="project-task-execution__card">
        <div className="project-task-execution__heading">
          <span>
            <small>{task.title}</small>
            <strong>{syncError ? '等待重新同步' : failed ? '执行失败' : finalizing ? '同步成果中' : waiting ? '等待处理' : '执行中'}</strong>
          </span>
          <strong>{percent === null ? '进度待更新' : `${percent}%`}</strong>
        </div>
        {percent === null ? null : (
          <div
            aria-label="成果生成任务进度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="project-task-execution__progress"
            role="progressbar"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
        <p>{task.message}</p>
        <div className="project-task-execution__actions">
          {failed && onBackToMaterials ? (
            <button className="project-task-execution__back" onClick={onBackToMaterials} type="button">
              返回材料准备
            </button>
          ) : null}
          <button className="project-task-execution__open" onClick={onOpenTasks} type="button">
            查看任务进度
          </button>
        </div>
      </div>
    </section>
  );
}

export function ProjectOptimizationFlow({
  onOpenReview,
  reviewReady,
}: {
  onOpenReview?: () => void;
  reviewReady: boolean;
}) {
  return (
    <section className="project-optimization-flow" aria-label="成果优化流程">
      <div>
        <span><FileCheck2 aria-hidden="true" size={18} />成果已生成</span>
        <i aria-hidden="true" />
        <span><SearchCheck aria-hidden="true" size={18} />模拟评标</span>
        <i aria-hidden="true" />
        <span><Sparkles aria-hidden="true" size={18} />审核修改</span>
        <i aria-hidden="true" />
        <span><CheckCircle2 aria-hidden="true" size={18} />新版本复评</span>
      </div>
      <p>{reviewReady
        ? '评分已返回，可查看提升建议并在评审中心确认修改，保存新版本后再次评标。'
        : '下一步可进入模拟评标；评分、问题项和提升建议均以真实后端结果为准。'}</p>
      {onOpenReview ? (
        <button onClick={onOpenReview} type="button">
          {reviewReady ? '进入成果优化' : '进入模拟评标'}
          <ArrowRight aria-hidden="true" size={17} />
        </button>
      ) : null}
    </section>
  );
}

function normalizeTaskPercent(percent: number | null) {
  if (percent === null || !Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
