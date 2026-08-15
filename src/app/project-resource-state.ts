import { BackendApiError } from '../shared/backend-api';
import type { BackendTaskStreamUpdate } from '../shared/backend-api';
import type { PublicTaskEvent } from '../shared/task-events';

export type ProjectResourceKey =
  | 'materials'
  | 'requirements'
  | 'snapshots'
  | 'tasks'
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

const projectSubmissionTaskTypes = new Set(['bid_generate', 'bid_review']);

export function isActiveTaskStatus(status: PublicTaskEvent['status']) {
  return activeTaskStatuses.has(status);
}

export function findLatestActiveBidGenerateTask(events: readonly PublicTaskEvent[]) {
  return events.reduce<PublicTaskEvent | undefined>((latest, event) => {
    if ((event.task_type ?? event.phase) !== 'bid_generate' || !activeTaskStatuses.has(event.status)) {
      return latest;
    }
    return !latest || event.sequence > latest.sequence ? event : latest;
  }, undefined);
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
  if (error.message.includes('尚未评标')) return true;
  return typeof error.detail === 'string' && error.detail.includes('尚未评标');
}

