import {
  BadgeCheck,
  FileCheck2,
  FileLock2,
  FileText,
  FolderCheck,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';

import type { PublicTaskEvent } from '../../shared/task-events';
import './project-review-sidebar.css';

export type ProjectReviewDeliverableKind = 'business' | 'technical' | 'quote';

export type ProjectReviewDeliverableSource = {
  currentVersionNo?: number;
  kind: ProjectReviewDeliverableKind;
};

export type ProjectReviewRequirementSource = {
  type: string;
};

export type ProjectReviewTaskSource = Pick<PublicTaskEvent, 'phase' | 'status' | 'task_type'>;

export type ProjectReviewMetricId =
  | 'score-rules'
  | 'completed-bids'
  | 'business'
  | 'technical'
  | 'quote'
  | 'pending-check';

export type ProjectReviewMetricState =
  | 'available'
  | 'error'
  | 'generated'
  | 'in-progress'
  | 'loading'
  | 'missing'
  | 'unavailable';

export type ProjectReviewSourceState = 'error' | 'loading' | 'ready';

export type ProjectReviewMetric = {
  detail: string;
  id: ProjectReviewMetricId;
  label: string;
  state: ProjectReviewMetricState;
  unit?: string;
  value: number | string;
};

export type ProjectReviewSidebarViewModel = {
  metrics: readonly ProjectReviewMetric[];
};

export type ProjectReviewSidebarSource = {
  deliverables: readonly ProjectReviewDeliverableSource[];
  deliverablesState?: ProjectReviewSourceState;
  requirements: readonly ProjectReviewRequirementSource[];
  requirementsState?: ProjectReviewSourceState;
  tasks: readonly ProjectReviewTaskSource[];
  tasksState?: ProjectReviewSourceState;
};

const activeTaskStatuses = new Set<ProjectReviewTaskSource['status']>([
  'queued',
  'running',
  'retrying',
  'waiting_user',
  'cancel_requested',
]);

const metricIcons: Record<ProjectReviewMetricId, LucideIcon> = {
  business: FileCheck2,
  'completed-bids': FileText,
  'pending-check': ShieldAlert,
  quote: FileLock2,
  'score-rules': BadgeCheck,
  technical: FolderCheck,
};

function deliverableMetric(
  deliverables: readonly ProjectReviewDeliverableSource[],
  kind: ProjectReviewDeliverableKind,
  generationInProgress: boolean,
  deliverablesState: ProjectReviewSourceState,
  tasksState: ProjectReviewSourceState,
): ProjectReviewMetric {
  const label = ({
    business: '商务标状态',
    quote: '报价单状态',
    technical: '技术标状态',
  } as const)[kind];

  if (deliverablesState !== 'ready') {
    return {
      detail: deliverablesState === 'loading' ? '成果状态加载中' : '成果状态暂不可用',
      id: kind,
      label,
      state: deliverablesState,
      value: '—',
    };
  }

  const version = deliverables.reduce<number | undefined>((latest, deliverable) => {
    const currentVersionNo = deliverable.currentVersionNo;
    if (deliverable.kind !== kind
      || currentVersionNo === undefined
      || !Number.isInteger(currentVersionNo)
      || currentVersionNo <= 0) return latest;
    return Math.max(latest ?? 0, currentVersionNo);
  }, undefined);

  if (version !== undefined) {
    return {
      detail: `当前版本 V${version}`,
      id: kind,
      label,
      state: 'generated',
      value: '已生成',
    };
  }
  if (tasksState !== 'ready') {
    return {
      detail: tasksState === 'loading' ? '任务状态加载中' : '任务状态暂不可用',
      id: kind,
      label,
      state: tasksState,
      value: '—',
    };
  }
  if (generationInProgress) {
    return {
      detail: '后端生成任务处理中',
      id: kind,
      label,
      state: 'in-progress',
      value: '执行中',
    };
  }
  return {
    detail: '暂无有效成果版本',
    id: kind,
    label,
    state: 'missing',
    value: '未生成',
  };
}

export function buildProjectReviewSidebarViewModel({
  deliverables,
  deliverablesState = 'ready',
  requirements,
  requirementsState = 'ready',
  tasks,
  tasksState = 'ready',
}: ProjectReviewSidebarSource): ProjectReviewSidebarViewModel {
  const generationInProgress = tasksState === 'ready' && tasks.some((task) =>
    (task.task_type ?? task.phase) === 'bid_generate' && activeTaskStatuses.has(task.status));
  const scoreRuleCount = requirements.filter((requirement) => requirement.type === 'score_rule').length;
  const scoringMetric: ProjectReviewMetric = requirementsState === 'ready'
    ? {
        detail: '来自招标要求',
        id: 'score-rules',
        label: '已识别评分项',
        state: 'available',
        unit: '项',
        value: scoreRuleCount,
      }
    : {
        detail: requirementsState === 'loading' ? '评分项加载中' : '评分项暂不可用',
        id: 'score-rules',
        label: '已识别评分项',
        state: requirementsState,
        value: '—',
      };

  return {
    metrics: [
      scoringMetric,
      {
        detail: '接口待提供',
        id: 'completed-bids',
        label: '已上传标书数量',
        state: 'unavailable',
        value: '—',
      },
      deliverableMetric(deliverables, 'business', generationInProgress, deliverablesState, tasksState),
      deliverableMetric(deliverables, 'technical', generationInProgress, deliverablesState, tasksState),
      deliverableMetric(deliverables, 'quote', generationInProgress, deliverablesState, tasksState),
      {
        detail: '接口待提供',
        id: 'pending-check',
        label: '待校核内容数量',
        state: 'unavailable',
        value: '—',
      },
    ],
  };
}

export const emptyProjectReviewSidebarViewModel = buildProjectReviewSidebarViewModel({
  deliverables: [],
  requirements: [],
  tasks: [],
});

export function ProjectReviewSidebar({
  viewModel = emptyProjectReviewSidebarViewModel,
}: {
  viewModel?: ProjectReviewSidebarViewModel;
}) {
  const titleId = useId();

  return (
    <section className="project-review-preview" aria-labelledby={titleId}>
      <div className="project-review-preview__heading">
        <div>
          <h2 id={titleId}>模拟评标</h2>
          <p>材料与成果真实状态</p>
        </div>
      </div>

      <div className="project-review-metrics" aria-label="模拟评标六项指标" role="list">
        {viewModel.metrics.map((metric) => {
          const Icon = metricIcons[metric.id];
          return (
            <article
              className="project-review-metric-card"
              data-metric-id={metric.id}
              data-metric-state={metric.state}
              key={metric.id}
              role="listitem"
            >
              <div className="project-review-metric-copy">
                <small>{metric.label}</small>
                <strong>{metric.value}{metric.unit ? <span>{metric.unit}</span> : null}</strong>
                <p>{metric.detail}</p>
              </div>
              <span className="project-review-metric-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
