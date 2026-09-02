import { BackendApiError, type ImageDescribeProgress } from '../shared/backend-api';
import type { BackendTaskStreamUpdate } from '../shared/backend-api';
import type {
  AgentRunCompletion,
  AgentRunViewModel,
  PublicTaskEvent,
} from '../shared/task-events';

export type ProjectResourceKey =
  | 'materials'
  | 'requirements'
  | 'snapshots'
  | 'tenderNotices'
  | 'tasks'
  | 'agent'
  | 'deliverables'
  | 'review'
  | 'score'
  | 'quote';

export type ProjectResourceErrors = Partial<Record<ProjectResourceKey, string>>;

const activeTaskStatuses = new Set<PublicTaskEvent['status']>([
  'queued',
  'running',
  'retrying',
  'waiting_user',
  'cancel_requested',
]);

const terminalTaskStatuses = new Set<PublicTaskEvent['status']>([
  'cancelled',
  'succeeded',
  'failed',
]);

const projectSubmissionTaskTypes = new Set(['agent_pipeline', 'bid_generate', 'bid_review']);

export function isActiveTaskStatus(status: PublicTaskEvent['status']) {
  return activeTaskStatuses.has(status);
}

export function shouldReloadProjectAfterAgentPoll(
  previous: AgentRunCompletion,
  next: AgentRunCompletion,
  alreadyReloaded: boolean,
) {
  return !alreadyReloaded && previous === 'active' && next !== 'active';
}

export function shouldShowImageDescribeProgress(progress: ImageDescribeProgress | null) {
  if (!progress) return false;
  return progress.queued > 0
    || progress.running > 0
    || progress.remaining > 0;
}

export function findLatestActiveBidGenerateTask(events: readonly PublicTaskEvent[]) {
  return events.reduce<PublicTaskEvent | undefined>((latest, event) => {
    if ((event.task_type ?? event.phase) !== 'bid_generate' || !activeTaskStatuses.has(event.status)) {
      return latest;
    }
    return !latest || event.sequence > latest.sequence ? event : latest;
  }, undefined);
}

/** Selects the newest generation task across the current and legacy pipelines. */
export function findLatestGenerationTask(events: readonly PublicTaskEvent[]) {
  return events.reduce<PublicTaskEvent | undefined>((latest, event) => {
    if (!['agent_pipeline', 'bid_generate'].includes(event.task_type ?? event.phase)) {
      return latest;
    }
    return !latest || event.sequence > latest.sequence ? event : latest;
  }, undefined);
}

/**
 * Agent detail is richer than the public task event, but it is only valid when
 * it describes the generation task selected above. This prevents a historical
 * Agent run from hiding a newer legacy generation task.
 */
export function shouldUseAgentRunForGenerationTask(
  latestTask: PublicTaskEvent | undefined,
  agentRun: AgentRunViewModel | undefined,
) {
  if (!agentRun) return false;
  if (!latestTask) return true;
  return (latestTask.task_type ?? latestTask.phase) === 'agent_pipeline'
    && latestTask.task_id === agentRun.taskId;
}

/**
 * Keeps the task returned by POST /agent/start visible while the eventually
 * consistent task list still contains only older runs. The caller must pass
 * the explicit pending receipt id; an arbitrary historical Agent detail must
 * never be promoted above a newer backend task.
 */
export function mergePendingAgentRunTaskReceipt(
  events: readonly PublicTaskEvent[],
  agentRun: AgentRunViewModel | undefined,
  pendingTaskId: string | undefined,
): PublicTaskEvent[] {
  if (!agentRun || !pendingTaskId || agentRun.taskId !== pendingTaskId) {
    return events as PublicTaskEvent[];
  }

  const hasOpenQuestion = agentRun.completion === 'active'
    && agentRun.questions.some((question) => !question.answered);
  const status: PublicTaskEvent['status'] = hasOpenQuestion
    ? 'waiting_user'
    : agentRun.completion === 'incomplete' || agentRun.completion === 'failed'
      ? 'failed'
      : agentRun.completion === 'cancelled'
        ? 'cancelled'
        : ({
            failed_retryable: 'failed',
            queued: 'queued',
            running: 'running',
            succeeded: 'succeeded',
          } as Partial<Record<AgentRunViewModel['status'], PublicTaskEvent['status']>>)[agentRun.status]
          ?? 'unknown';
  const existingIndex = events.findIndex((event) => event.task_id === pendingTaskId);
  if (existingIndex >= 0 && events[existingIndex].event_id !== `agent-receipt-${pendingTaskId}`) {
    return events as PublicTaskEvent[];
  }
  const existing = existingIndex >= 0 ? events[existingIndex] : undefined;
  const receipt: PublicTaskEvent = {
    schema_version: '1',
    event_id: `agent-receipt-${pendingTaskId}`,
    sequence: existing?.sequence ?? Math.max(0, ...events.map((event) => event.sequence)) + 1,
    task_id: pendingTaskId,
    task_type: 'agent_pipeline',
    project_id: agentRun.projectId,
    phase: agentRun.phase || 'agent_pipeline',
    status,
    percent: agentRun.percent,
    public_message: agentRun.message,
    error_code: null,
    // CreatedTask does not expose created_at. Preserve the client receipt time
    // so timestamp matching remains possible if an older backend omits source_task_id.
    occurred_at: existing?.occurred_at ?? new Date().toISOString(),
  };
  if (!existing) return [...events, receipt];
  const next = [...events];
  next[existingIndex] = receipt;
  return next;
}

/** Selects the latest new-pipeline task without changing the legacy SSE subscription helper. */
export function findLatestAgentPipelineTask(events: readonly PublicTaskEvent[]) {
  const pipelineTasks = events.filter((event) => (
    (event.task_type ?? event.phase) === 'agent_pipeline'
  ));
  const latest = pipelineTasks.reduce<PublicTaskEvent | undefined>((candidate, event) => (
    !candidate || event.sequence > candidate.sequence ? event : candidate
  ), undefined);
  return pipelineTasks.reduce<PublicTaskEvent | undefined>((candidate, event) => {
    if (!activeTaskStatuses.has(event.status)) return candidate;
    return !candidate || event.sequence > candidate.sequence ? event : candidate;
  }, undefined) ?? latest;
}

const statusFromStreamUpdate = (
  update: BackendTaskStreamUpdate,
  fallback: PublicTaskEvent['status'],
): PublicTaskEvent['status'] => {
  const progressStatus = update.progress.status.toLocaleLowerCase();
  const progressStatuses: Record<string, PublicTaskEvent['status']> = {
    queued: 'queued',
    running: 'running',
    retrying: 'retrying',
    waiting_user: 'waiting_user',
    cancel_requested: 'cancel_requested',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    done: 'succeeded',
    succeeded: 'succeeded',
    failed: 'failed',
  };
  if (progressStatuses[progressStatus]) return progressStatuses[progressStatus];
  if (update.type !== 'snapshot') return fallback;
  const backendStatuses: Record<number, PublicTaskEvent['status']> = {
    1: 'queued',
    2: 'running',
    3: 'succeeded',
    4: 'retrying',
    5: 'cancelled',
    6: 'failed',
  };
  return backendStatuses[update.status] ?? fallback;
};

/**
 * Replaces only the matching task in the matching project. The stream DTO is
 * deliberately projected onto PublicTaskEvent instead of being spread into UI
 * state, so unknown backend fields cannot cross the public-event boundary.
 */
export function mergeTaskStreamUpdate(
  previous: readonly PublicTaskEvent[],
  update: BackendTaskStreamUpdate,
  {
    projectId,
    holdTerminalStatus = false,
  }: {
    projectId: string;
    holdTerminalStatus?: boolean;
  },
): PublicTaskEvent[] {
  const index = previous.findIndex((event) =>
    event.task_id === update.taskId && event.project_id === projectId);
  if (index < 0) return previous as PublicTaskEvent[];

  const current = previous[index];
  if ((current.task_type ?? current.phase) !== 'bid_generate') {
    return previous as PublicTaskEvent[];
  }
  const proposedStatus = statusFromStreamUpdate(update, current.status);
  const status = holdTerminalStatus && terminalTaskStatuses.has(proposedStatus)
    ? current.status
    : proposedStatus;
  const message = update.progress.current_work
    ?? update.progress.summary
    ?? update.progress.hint
    ?? current.public_message;
  const nextEvent: PublicTaskEvent = {
    ...current,
    phase: update.progress.phase,
    status,
    percent: Math.max(0, Math.min(100, Math.round(update.progress.percent))),
    public_message: message,
  };
  const next = [...previous];
  next[index] = nextEvent;
  return next;
}

export function findCurrentProjectSubmissionTask(events: readonly PublicTaskEvent[]) {
  const submissionTasks = events.filter((event) => {
    const taskType = event.task_type ?? event.phase;
    return projectSubmissionTaskTypes.has(taskType);
  });
  const latestTask = submissionTasks.reduce<PublicTaskEvent | undefined>((latest, event) =>
    !latest || event.sequence > latest.sequence ? event : latest, undefined);
  return submissionTasks.reduce<PublicTaskEvent | undefined>((latest, event) => {
    if (!activeTaskStatuses.has(event.status)) return latest;
    return !latest || event.sequence > latest.sequence ? event : latest;
  }, undefined) ?? latestTask;
}

export function hasTaskEnteredTerminalState(
  previous: readonly PublicTaskEvent[],
  next: readonly PublicTaskEvent[],
) {
  const previousStatuses = new Map(previous.map((event) => [event.task_id, event.status]));
  return next.some((event) => {
    const previousStatus = previousStatuses.get(event.task_id);
    return previousStatus !== undefined
      && activeTaskStatuses.has(previousStatus)
      && terminalTaskStatuses.has(event.status);
  });
}

export const TASK_POLL_INTERVAL_MS = 2_500;
export const STREAM_CONVERGENCE_POLL_INTERVAL_MS = 15_000;
export const AGENT_RUN_POLL_INTERVAL_MS = 8_000;

export function resolveTaskPollingInterval({
  hasActiveBidGenerateTask,
  hasActiveTasks,
  hasOtherActiveTasks,
  localPreviewActive,
  streamMatchesActiveTask,
  streamStatus,
}: {
  hasActiveBidGenerateTask: boolean;
  hasActiveTasks: boolean;
  hasOtherActiveTasks: boolean;
  localPreviewActive: boolean;
  streamMatchesActiveTask: boolean;
  streamStatus: 'connected' | 'connecting' | 'fallback' | 'idle';
}) {
  if (localPreviewActive || !hasActiveTasks) return null;

  const streamIsLive = streamMatchesActiveTask
    && (streamStatus === 'connecting' || streamStatus === 'connected');
  if (hasActiveBidGenerateTask && !hasOtherActiveTasks && streamIsLive) {
    // The current backend does not emit heartbeats. Keep a low-frequency GET
    // convergence path so a half-open or silent stream cannot freeze the UI.
    return STREAM_CONVERGENCE_POLL_INTERVAL_MS;
  }

  return TASK_POLL_INTERVAL_MS;
}

export function isProjectNotFound(error: unknown) {
  return error instanceof BackendApiError && error.status === 404;
}

export function isReviewScoreUnavailable(error: unknown) {
  if (!(error instanceof BackendApiError) || error.status !== 404) return false;
  if (error.message.trim() === '尚未评标') return true;
  return typeof error.detail === 'string' && error.detail.trim() === '尚未评标';
}

