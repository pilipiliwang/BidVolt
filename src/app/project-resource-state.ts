import { BackendApiError } from '../shared/backend-api';
import type { PublicTaskEvent } from '../shared/task-events';

export type ProjectResourceKey =
  | 'materials'
  | 'requirements'
  | 'snapshots'
  | 'tasks'
  | 'deliverables'
  | 'review'
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

export function isProjectNotFound(error: unknown) {
  return error instanceof BackendApiError && error.status === 404;
}

export function isReviewScoreUnavailable(error: unknown) {
  if (!(error instanceof BackendApiError) || error.status !== 404) return false;
  if (error.message.includes('尚未评标')) return true;
  return typeof error.detail === 'string' && error.detail.includes('尚未评标');
}

