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
  missingMaterials?: number;
  pricing?: number;
  rejectionRisks?: number;
  technical?: number;
  total: number;
};

export type ProjectOutcomeReviewState =
  | 'empty'
  | 'error'
  | 'evaluating'
  | 'failed'
  | 'loading'
  | 'ready'
  | 'syncing'
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
  reviewRunStatus?: ReviewRunView['status'];
  reviewSourceState?: 'error' | 'loading' | 'ready';
  score?: ProjectOutcomeScore;
  tasks?: readonly ProjectOutcomeReviewTask[];
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
  type: 'bid_generate' | 'bid_review',
) {
  return (tasks ?? []).reduce<ProjectOutcomeReviewTask | undefined>(
    (latest, task) => {
      if ((task.task_type ?? task.phase) !== type) return latest;
      return !latest || task.sequence > latest.sequence ? task : latest;
    },
    undefined,
  );
}

function hasRealScore(score: ProjectOutcomeScore | undefined): score is ProjectOutcomeScore {
  return Boolean(score && Number.isFinite(score.total));
}

export function buildProjectOutcomeReviewViewModel({
  reviewRunStatus = 'idle',
  reviewSourceState = 'ready',
  score,
  tasks = [],
}: ProjectOutcomeReviewSource): ProjectOutcomeReviewViewModel {
  if (hasRealScore(score)) {
    return {
      canOpenTaskProgress: false,
      description: '评分参数来自当前项目最近一次后端模拟评标结果。',
      score,
      state: 'ready',
      title: '模拟评标',
    };
  }

  const reviewTask = latestTask(tasks, 'bid_review');
  const generationTask = latestTask(tasks, 'bid_generate');

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

  if (reviewRunStatus === 'queued' || reviewRunStatus === 'running') {
    return {
      canOpenTaskProgress: Boolean(reviewTask),
      description: '后端评审正在处理当前标书成果，评分返回后将在此展示。',
      state: 'evaluating',
      title: '正在生成初次评分结果',
    };
  }

  if (reviewTask?.status === 'succeeded' || reviewRunStatus === 'succeeded') {
    return {
      canOpenTaskProgress: Boolean(reviewTask),
      description: '评审任务已完成，正在等待后端返回可展示的评分汇总。',
      state: 'syncing',
      title: '评分结果正在同步',
    };
  }

  if (reviewTask?.status === 'failed' || reviewTask?.status === 'cancelled'
    || failedReviewRunStatuses.has(reviewRunStatus)) {
    return {
      canOpenTaskProgress: Boolean(reviewTask),
      description: '本次模拟评标未产生可用评分，请查看任务详情后重试。',
      state: 'failed',
      title: '初次评分未完成',
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

  return {
    canOpenTaskProgress: false,
    description: '完成标书成果生成并发起模拟评标后，评分结果将在此展示。',
    state: 'empty',
    title: '尚无模拟评标结果',
  };
}

const defaultViewModel = buildProjectOutcomeReviewViewModel({});

export function ProjectOutcomeReviewPanel({
  onOpenImprovementSuggestions,
  onOpenTasks,
  viewModel = defaultViewModel,
}: {
  onOpenImprovementSuggestions?: () => void;
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
      {viewModel.state === 'ready' && viewModel.score ? (
        <ReadyScore
          onOpenImprovementSuggestions={onOpenImprovementSuggestions}
          score={viewModel.score}
        />
      ) : (
        <ReviewStatus
          description={viewModel.description}
          onOpenTasks={viewModel.canOpenTaskProgress ? onOpenTasks : undefined}
          state={viewModel.state}
          title={viewModel.title}
        />
      )}
    </section>
  );
}

function ReadyScore({
  onOpenImprovementSuggestions,
  score,
}: {
  onOpenImprovementSuggestions?: () => void;
  score: ProjectOutcomeScore;
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

      <button
        className="project-outcome-review__suggestions"
        disabled={!onOpenImprovementSuggestions}
        onClick={onOpenImprovementSuggestions}
        type="button"
      >
        <Lightbulb aria-hidden="true" size={20} />
        查看提升建议
      </button>
    </>
  );
}

function ReviewStatus({
  description,
  onOpenTasks,
  state,
  title,
}: {
  description: string;
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
