import { describe, expect, it } from 'vitest';

import { BackendApiError } from '../shared/backend-api';
import type { PublicTaskEvent } from '../shared/task-events';
import {
  hasTaskEnteredTerminalState,
  isActiveTaskStatus,
  isProjectNotFound,
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

  it('detects a task moving from an active state to a terminal state', () => {
    expect(hasTaskEnteredTerminalState([task('7', 'running')], [task('7', 'succeeded')])).toBe(true);
    expect(hasTaskEnteredTerminalState([task('7', 'succeeded')], [task('7', 'succeeded')])).toBe(false);
    expect(hasTaskEnteredTerminalState([], [task('7', 'succeeded')])).toBe(false);
  });

  it('keeps cancel-requested tasks in the polling set', () => {
    expect(isActiveTaskStatus('cancel_requested')).toBe(true);
    expect(isActiveTaskStatus('cancelled')).toBe(false);
  });
});
