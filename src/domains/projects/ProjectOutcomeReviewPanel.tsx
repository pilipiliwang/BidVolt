import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSearch2,
  Lightbulb,
  LoaderCircle,
} from 'lucide-react';
import { useId, type CSSProperties } from 'react';

import type { ReviewRunView } from '../review/types';
import type { PublicTaskEvent } from '../../shared/task-events';
import './project-outcome-review-panel.css';

export type ProjectOutcomeScore = {
  business?: number;
  estimatedLift?: number;
  /** The backend's scoring ceiling; an absent ceiling must not be assumed to be 100. */
  fullMarks?: number;
  missingMaterials?: number;
  pricing?: number;
  rejectionRisks?: number;
  technical?: number;
  total: number;
  scale?: string;
  /** Human-readable versions actually associated with this score, supplied by the caller. */
  versionLabel?: string;
  /** The current score API does not establish an artifact-to-deliverable version mapping. */
  formalFileVersionUnverified?: boolean;
};

export type ProjectOutcomeReviewState =
  | 'empty'
  | 'error'
  | 'evaluating'
  | 'failed'
  | 'loading'
  | 'ready'
  | 'refresh-error'
  | 'refreshing'
  | 'stale'
  | 'syncing'
  | 'updating'
  | 'waiting-results'
  | 'waiting-user';

export type ProjectOutcomeReviewViewModel = {
  canOpenTaskProgress: boolean;
  description: string;
  score?: ProjectOutcomeScore;
  state: ProjectOutcomeReviewState;
  title: string;
};

type ProjectOutcomeReviewTask = Pick<
  PublicTaskEvent,
  'phase' | 'sequence' | 'status' | 'task_type'
>;

export type ProjectOutcomeReviewSource = {
  reviewRunId?: string;
  reviewRunStatus?: ReviewRunView['status'];
  reviewSourceState?: 'error' | 'loading' | 'ready';
  score?: ProjectOutcomeScore;
  scoreIsStale?: boolean;
  scoreReviewRunId?: string;
  scoreSourceState?: 'error' | 'loading' | 'ready';
  tasks?: readonly ProjectOutcomeReviewTask[];
  tasksState?: 'error' | 'loading' | 'ready';
};

const activeTaskStatuses = new Set<PublicTaskEvent['status']>([
  'cancel_requested',
  'queued',
  'retrying',
  'running',
]);

const failedReviewRunStatuses = new Set<ReviewRunView['status']>([
  'failed',
  'invalid_response',
  'timed_out',
]);

function latestTask(
  tasks: ProjectOutcomeReviewSource['tasks'],
  types: readonly string[],
) {
  return (tasks ?? []).reduce<ProjectOutcomeReviewTask | undefined>(
    (latest, task) => {
      if (!types.includes(task.task_type ?? task.phase)) return latest;
      return !latest || task.sequence > latest.sequence ? task : latest;
    },
    undefined,
  );
}

function hasRealScore(score: ProjectOutcomeScore | undefined): score is ProjectOutcomeScore {
  return Boolean(score && Number.isFinite(score.total));
}

export function buildProjectOutcomeReviewViewModel({
  reviewRunId,
  reviewRunStatus = 'idle',
  reviewSourceState = 'ready',
  score,
  scoreIsStale = false,
  scoreReviewRunId,
  scoreSourceState = 'ready',
  tasks = [],
  tasksState = 'ready',
}: ProjectOutcomeReviewSource): ProjectOutcomeReviewViewModel {
  const reviewTask = tasksState === 'ready' ? latestTask(tasks, ['bid_review']) : undefined;
  const generationTask = tasksState === 'ready'
    ? latestTask(tasks, ['agent_pipeline', 'bid_generate'])
    : undefined;
  const currentReviewRunStatus = reviewSourceState === 'ready' ? reviewRunStatus : 'idle';
  const currentReviewRunId = reviewSourceState === 'ready' ? reviewRunId : undefined;
  const reviewRunDoesNotMatchScore = Boolean(
    currentReviewRunId
      && scoreReviewRunId
      && currentReviewRunId !== scoreReviewRunId,
  );
  const reviewRunLinkIsPending = Boolean(
    !scoreReviewRunId
      && (currentReviewRunId || reviewTask?.status === 'succeeded'),
  );

  if (hasRealScore(score)) {
    if (scoreSourceState === 'loading') {
      return scoreViewModel(
        score,
        'refreshing',
        '最近一次评分 · 正在刷新',
        '正在向后端确认最新评分，本次刷新完成前不会开放提升建议。',
      );
    }
    if (scoreSourceState === 'error') {
      return scoreViewModel(
        score,
        'refresh-error',
        '最近一次评分 · 刷新失败',
        '当前展示的是上次成功读取的评分，最新评分暂时无法确认。',
      );
    }
    if (scoreIsStale) {
      return scoreViewModel(
        score,
        'stale',
        '最近一次评分 · 已过期',
        '后端已标记该评分与当前成果版本不一致，请重新发起模拟评标。',
      );
    }
    if (reviewTask?.status === 'waiting_user') {
      return scoreViewModel(
        score,
        'updating',
        '最近一次评分 · 更新等待处理',
        '新一轮评分需要补充信息或人工处理，完成前不会开放提升建议。',
        true,
      );
    }
    if (reviewTask && activeTaskStatuses.has(reviewTask.status)) {
      return scoreViewModel(
        score,
        'updating',
        '最近一次评分 · 更新中',
        '新一轮模拟评标正在执行，当前分数仅供参考。',
        true,
      );
    }
    if (currentReviewRunStatus === 'queued' || currentReviewRunStatus === 'running'
      || reviewRunDoesNotMatchScore || reviewRunLinkIsPending) {
      return scoreViewModel(
        score,
        'updating',
        '最近一次评分 · 更新中',
        '最新评审尚未与评分摘要收敛，当前分数仅供参考。',
        Boolean(reviewTask),
      );
    }
    return {
      canOpenTaskProgress: false,
      description: '评分参数来自当前项目最近一次成功读取的后端模拟评标结果。',
      score,
      state: 'ready',
      title: '模拟评标',
    };
  }

  if (reviewTask?.status === 'waiting_user') {
    return {
      canOpenTaskProgress: true,
      description: '评分任务需要补充信息或人工处理，请查看任务进度。',
      state: 'waiting-user',
      title: '初次评分等待处理',
    };
  }

  if (reviewTask && activeTaskStatuses.has(reviewTask.status)) {
    return {
      canOpenTaskProgress: true,
      description: '系统正依据已识别的评分规则评审当前标书成果，请留意任务进度。',
      state: 'evaluating',
      title: '正在生成初次评分结果',
    };
  }

  if (currentReviewRunStatus === 'queued' || currentReviewRunStatus === 'running') {
    return {
      canOpenTaskProgress: Boolean(reviewTask),
      description: '后端评审正在处理当前标书成果，评分返回后将在此展示。',
      state: 'evaluating',
      title: '正在生成初次评分结果',
    };
  }

  if (generationTask?.status === 'waiting_user') {
    return {
      canOpenTaskProgress: true,
      description: '标书成果生成需要补充信息或人工处理，完成后才能进行模拟评标。',
      state: 'waiting-user',
      title: '等待标书成果生成',
    };
  }

  if (generationTask && activeTaskStatuses.has(generationTask.status)) {
    return {
      canOpenTaskProgress: true,
      description: '标书成果仍在生成，成果完成后才能开始模拟评标。',
      state: 'waiting-results',
      title: '等待标书成果生成完成',
    };
  }

  if (scoreSourceState === 'loading') {
    return {
      canOpenTaskProgress: false,
      description: '正在读取当前项目的最新评分。',
      state: 'loading',
      title: '正在加载模拟评标结果',
    };
  }

  if (scoreSourceState === 'error') {
    return {
      canOpenTaskProgress: false,
      description: '暂时无法读取最新评分，请稍后重试。',
      state: 'error',
      title: '模拟评标结果暂不可用',
    };
  }

  if (reviewTask?.status === 'succeeded' || currentReviewRunStatus === 'succeeded') {
    return {
      canOpenTaskProgress: Boolean(reviewTask),
      description: '评审任务已完成，正在等待后端返回可展示的评分汇总。',
      state: 'syncing',
      title: '评分结果正在同步',
    };
  }

  if (reviewTask?.status === 'failed' || reviewTask?.status === 'cancelled'
    || failedReviewRunStatuses.has(currentReviewRunStatus)) {
    return {
      canOpenTaskProgress: Boolean(reviewTask),
      description: '本次模拟评标未产生可用评分，请查看任务详情后重试。',
      state: 'failed',
      title: '初次评分未完成',
    };
  }

  if (reviewSourceState === 'loading') {
    return {
      canOpenTaskProgress: false,
      description: '正在读取当前项目的模拟评标状态。',
      state: 'loading',
      title: '正在加载模拟评标结果',
    };
  }

  if (reviewSourceState === 'error') {
    return {
      canOpenTaskProgress: false,
      description: '暂时无法读取模拟评标结果，请稍后重试。',
      state: 'error',
      title: '模拟评标结果暂不可用',
    };
  }

  if (tasksState === 'loading') {
    return {
      canOpenTaskProgress: false,
      description: '正在读取当前项目的任务状态。',
      state: 'loading',
      title: '正在加载模拟评标状态',
    };
  }

  if (tasksState === 'error') {
    return {
      canOpenTaskProgress: false,
      description: '暂时无法确认模拟评标任务状态，请稍后重试。',
      state: 'error',
      title: '模拟评标状态暂不可用',
    };
  }

  return {
    canOpenTaskProgress: false,
    description: '完成标书成果生成并发起模拟评标后，评分结果将在此展示。',
    state: 'empty',
    title: '尚无模拟评标结果',
  };
}

function scoreViewModel(
  score: ProjectOutcomeScore,
  state: Extract<ProjectOutcomeReviewState, 'refresh-error' | 'refreshing' | 'stale' | 'updating'>,
  title: string,
  description: string,
  canOpenTaskProgress = false,
): ProjectOutcomeReviewViewModel {
  return { canOpenTaskProgress, description, score, state, title };
}

const defaultViewModel = buildProjectOutcomeReviewViewModel({});

export function ProjectOutcomeReviewPanel({
  onOpenImprovementSuggestions,
  onOpenReviewCenter,
  onOpenTasks,
  viewModel = defaultViewModel,
}: {
  onOpenImprovementSuggestions?: () => void;
  onOpenReviewCenter?: () => void;
  onOpenTasks?: () => void;
  viewModel?: ProjectOutcomeReviewViewModel;
}) {
  const titleId = useId();

  return (
    <section
      className="project-outcome-review"
      data-review-state={viewModel.state}
      aria-labelledby={titleId}
    >
      <header className="project-outcome-review__heading">
        <div>
          <h2 id={titleId}>模拟评标</h2>
          <p>标书成果评分</p>
        </div>
        {viewModel.state === 'ready' ? <CheckCircle2 aria-label="评分已返回" size={19} /> : null}
      </header>
      {viewModel.score ? (
        <ScoreSummary
          onOpenImprovementSuggestions={onOpenImprovementSuggestions}
          onOpenReviewCenter={onOpenReviewCenter}
          onOpenTasks={viewModel.canOpenTaskProgress ? onOpenTasks : undefined}
          score={viewModel.score}
          state={viewModel.state}
          statusDescription={viewModel.description}
          statusTitle={viewModel.title}
        />
      ) : (
        <ReviewStatus
          description={viewModel.description}
          onOpenReviewCenter={onOpenReviewCenter}
          onOpenTasks={viewModel.canOpenTaskProgress ? onOpenTasks : undefined}
          state={viewModel.state}
          title={viewModel.title}
        />
      )}
    </section>
  );
}

function ScoreSummary({
  onOpenImprovementSuggestions,
  onOpenReviewCenter,
  onOpenTasks,
  score,
  state,
  statusDescription,
  statusTitle,
}: {
  onOpenImprovementSuggestions?: () => void;
  onOpenReviewCenter?: () => void;
  onOpenTasks?: () => void;
  score: ProjectOutcomeScore;
  state: ProjectOutcomeReviewState;
  statusDescription: string;
  statusTitle: string;
}) {
  const total = formatScore(score.total);
  const ringValue = Math.max(0, Math.min(100, score.total));
  const metrics = [
    ['商务分', score.business, 'score'],
    ['技术分', score.technical, 'score'],
    ['报价分', score.pricing, 'score'],
    ['否决风险数', score.rejectionRisks, 'count'],
    ['缺失材料数', score.missingMaterials, 'count-warning'],
    ['预计可提升分值', score.estimatedLift, 'score'],
  ] as const;

  return (
    <>
      {state === 'ready' ? null : (
        <div className="project-outcome-review__freshness" data-freshness-state={state} role="status">
          {state === 'refresh-error' || state === 'stale'
            ? <AlertTriangle aria-hidden="true" size={20} />
            : state === 'refreshing'
              ? <LoaderCircle aria-hidden="true" size={20} />
              : <Clock3 aria-hidden="true" size={20} />}
          <div>
            <strong>{statusTitle}</strong>
            <p>{statusDescription}</p>
          </div>
          {onOpenTasks ? <button onClick={onOpenTasks} type="button">查看任务进度</button> : null}
        </div>
      )}
      <div className="project-outcome-review__score-ring" style={{ '--score-progress': `${ringValue * 3.6}deg` } as CSSProperties}>
        <span>综合得分</span>
        <strong>{total}</strong>
        <small>/100</small>
      </div>

      <dl className="project-outcome-review__metrics" aria-label="标书成果模拟评标分项" role="group">
        {metrics.map(([label, value, kind]) => (
          <div data-score-kind={kind} key={label}>
            <dt>{label}</dt>
            <dd>{formatMetric(value, kind)}</dd>
          </div>
        ))}
      </dl>

      {state === 'ready' && onOpenImprovementSuggestions ? (
        <button
          className="project-outcome-review__suggestions"
          onClick={onOpenImprovementSuggestions}
          type="button"
        >
          <Lightbulb aria-hidden="true" size={20} />
          查看提升建议
        </button>
      ) : (state === 'stale' || state === 'refresh-error') && onOpenReviewCenter ? (
        <button
          className="project-outcome-review__suggestions"
          onClick={onOpenReviewCenter}
          type="button"
        >
          <Lightbulb aria-hidden="true" size={20} />
          重新模拟评标
        </button>
      ) : null}
    </>
  );
}

function ReviewStatus({
  description,
  onOpenReviewCenter,
  onOpenTasks,
  state,
  title,
}: {
  description: string;
  onOpenReviewCenter?: () => void;
  onOpenTasks?: () => void;
  state: ProjectOutcomeReviewState;
  title: string;
}) {
  const Icon = state === 'error' || state === 'failed'
    ? AlertTriangle
    : state === 'evaluating' || state === 'loading' || state === 'syncing'
      ? LoaderCircle
      : state === 'waiting-results' || state === 'waiting-user'
        ? Clock3
        : FileSearch2;

  return (
    <div className="project-outcome-review__status" role="status">
      <span className="project-outcome-review__status-icon">
        <Icon aria-hidden="true" size={34} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onOpenTasks ? (
        <button onClick={onOpenTasks} type="button">查看任务进度</button>
      ) : onOpenReviewCenter && (state === 'empty' || state === 'failed' || state === 'error') ? (
        <button onClick={onOpenReviewCenter} type="button">
          {state === 'empty' ? '开始模拟评标' : '进入评审中心'}
        </button>
      ) : null}
    </div>
  );
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMetric(
  value: number | undefined,
  kind: 'count' | 'count-warning' | 'score',
) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${formatScore(value)} ${kind === 'score' ? '分' : '项'}`;
}
