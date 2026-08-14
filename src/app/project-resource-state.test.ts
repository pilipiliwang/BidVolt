import { describe, expect, it } from 'vitest';

import { BackendApiError } from '../shared/backend-api';
import type { PublicTaskEvent } from '../shared/task-events';
import {
  findCurrentProjectSubmissionTask,
  hasTaskEnteredTerminalState,
  isActiveTaskStatus,
  isProjectNotFound,
  isReviewScoreUnavailable,
} from './project-resource-state';

const task = (taskId: string, status: PublicTaskEvent['status']): PublicTaskEvent => ({
  schema_version: '1',
  event_id: `${taskId}-${status}`,
  sequence: 1,
  task_id: taskId,
  project_id: 'project-1',
  phase: 'generate',
  status,
  percent: null,
  public_message: status,
  error_code: null,
  occurred_at: '2026-08-14T00:00:00Z',
});

describe('project resource state', () => {
  it('only treats an explicit backend 404 as a missing project', () => {
    expect(isProjectNotFound(new BackendApiError(404, 'missing'))).toBe(true);
    expect(isProjectNotFound(new BackendApiError(500, 'failed'))).toBe(false);
    expect(isProjectNotFound(new TypeError('network failed'))).toBe(false);
  });

  it('treats the backend not-reviewed 404 as an empty review state', () => {
    expect(isReviewScoreUnavailable(new BackendApiError(404, '尚未评标'))).toBe(true);
    expect(isReviewScoreUnavailable(new BackendApiError(404, '项目不存在'))).toBe(false);
    expect(isReviewScoreUnavailable(new BackendApiError(500, '尚未评标'))).toBe(false);
  });

  it('detects a task moving from an active state to a terminal state', () => {
    expect(hasTaskEnteredTerminalState([task('7', 'running')], [task('7', 'succeeded')])).toBe(true);
    expect(hasTaskEnteredTerminalState([task('7', 'succeeded')], [task('7', 'succeeded')])).toBe(false);
    expect(hasTaskEnteredTerminalState([], [task('7', 'succeeded')])).toBe(false);
  });

  it('keeps cancel-requested tasks in the polling set', () => {
    expect(isActiveTaskStatus('cancel_requested')).toBe(true);
    expect(isActiveTaskStatus('cancelled')).toBe(false);
  });

  it('selects the latest generation or review task without mistaking material parsing for submission', () => {
    const generation = {
      ...task('generate-7', 'queued'),
      phase: 'generate_sections',
      sequence: 7,
      task_type: 'bid_generate',
    };
    const review = {
      ...task('review-8', 'running'),
      phase: 'bid_review',
      sequence: 8,
    };
    const parsing = {
      ...task('parse-9', 'queued'),
      phase: 'tender_parse',
      sequence: 9,
      task_type: 'tender_parse',
    };

    expect(findCurrentProjectSubmissionTask([generation, parsing, review])).toBe(review);
    expect(findCurrentProjectSubmissionTask([generation, parsing])).toBe(generation);
    expect(findCurrentProjectSubmissionTask([parsing])).toBeUndefined();
  });

  it('keeps an existing active submission selected over a newer terminal task', () => {
    const queued = {
      ...task('generate-7', 'queued'),
      sequence: 7,
      task_type: 'bid_generate',
    };
    const failed = {
      ...task('review-9', 'failed'),
      sequence: 9,
      task_type: 'bid_review',
    };

    expect(findCurrentProjectSubmissionTask([failed, queued])).toBe(queued);
  });
});
