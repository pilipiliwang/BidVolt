import { describe, expect, it } from 'vitest';

import { BackendApiError } from '../shared/backend-api';
import type { PublicTaskEvent } from '../shared/task-events';
import {
  findLatestActiveBidGenerateTask,
  findLatestAgentPipelineTask,
  findCurrentProjectSubmissionTask,
  hasTaskEnteredTerminalState,
  isActiveTaskStatus,
  isProjectNotFound,
  isReviewScoreUnavailable,
  mergeTaskStreamUpdate,
  resolveTaskPollingInterval,
  shouldReloadProjectAfterAgentPoll,
  shouldShowImageDescribeProgress,
  STREAM_CONVERGENCE_POLL_INTERVAL_MS,
  TASK_POLL_INTERVAL_MS,
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
  it('keeps low-frequency GET convergence while the active SSE stream is live', () => {
    expect(resolveTaskPollingInterval({
      hasActiveBidGenerateTask: true,
      hasActiveTasks: true,
      hasOtherActiveTasks: false,
      localPreviewActive: false,
      streamMatchesActiveTask: true,
      streamStatus: 'connected',
    })).toBe(STREAM_CONVERGENCE_POLL_INTERVAL_MS);

    expect(resolveTaskPollingInterval({
      hasActiveBidGenerateTask: true,
      hasActiveTasks: true,
      hasOtherActiveTasks: false,
      localPreviewActive: false,
      streamMatchesActiveTask: true,
      streamStatus: 'connecting',
    })).toBe(STREAM_CONVERGENCE_POLL_INTERVAL_MS);
  });

  it('uses fast polling for fallback or other active tasks and stops without active tasks', () => {
    const base = {
      hasActiveBidGenerateTask: true,
      hasActiveTasks: true,
      hasOtherActiveTasks: false,
      localPreviewActive: false,
      streamMatchesActiveTask: true,
    } as const;

    expect(resolveTaskPollingInterval({ ...base, streamStatus: 'fallback' }))
      .toBe(TASK_POLL_INTERVAL_MS);
    expect(resolveTaskPollingInterval({
      ...base,
      hasOtherActiveTasks: true,
      streamStatus: 'connected',
    })).toBe(TASK_POLL_INTERVAL_MS);
    expect(resolveTaskPollingInterval({
      ...base,
      hasActiveTasks: false,
      streamStatus: 'connected',
    })).toBeNull();
    expect(resolveTaskPollingInterval({
      ...base,
      localPreviewActive: true,
      streamStatus: 'connected',
    })).toBeNull();
  });

  it('only treats an explicit backend 404 as a missing project', () => {
    expect(isProjectNotFound(new BackendApiError(404, 'missing'))).toBe(true);
    expect(isProjectNotFound(new BackendApiError(500, 'failed'))).toBe(false);
    expect(isProjectNotFound(new TypeError('network failed'))).toBe(false);
  });

  it('treats the backend not-reviewed 404 as an empty review state', () => {
    expect(isReviewScoreUnavailable(new BackendApiError(404, '尚未评标'))).toBe(true);
    expect(isReviewScoreUnavailable(new BackendApiError(404, ' 尚未评标 '))).toBe(true);
    expect(isReviewScoreUnavailable(new BackendApiError(404, 'request failed', ' 尚未评标 '))).toBe(true);
    expect(isReviewScoreUnavailable(new BackendApiError(404, '尚未评标结果不存在'))).toBe(false);
    expect(isReviewScoreUnavailable(new BackendApiError(404, 'request failed', '尚未评标结果不存在'))).toBe(false);
    expect(isReviewScoreUnavailable(new BackendApiError(404, '项目不存在'))).toBe(false);
    expect(isReviewScoreUnavailable(new BackendApiError(500, '尚未评标'))).toBe(false);
  });

  it('detects a task moving from an active state to a terminal state', () => {
    expect(hasTaskEnteredTerminalState([task('7', 'running')], [task('7', 'succeeded')])).toBe(true);
    expect(hasTaskEnteredTerminalState([task('7', 'succeeded')], [task('7', 'succeeded')])).toBe(false);
    expect(hasTaskEnteredTerminalState([], [task('7', 'succeeded')])).toBe(false);
  });

  it('reloads project resources only once when Agent polling observes a terminal result', () => {
    expect(shouldReloadProjectAfterAgentPoll('active', 'complete', false)).toBe(true);
    expect(shouldReloadProjectAfterAgentPoll('active', 'incomplete', true)).toBe(false);
    expect(shouldReloadProjectAfterAgentPoll('complete', 'complete', false)).toBe(false);
    expect(shouldReloadProjectAfterAgentPoll('active', 'active', false)).toBe(false);
  });

  it('hides the image-description bar after all background work finishes', () => {
    const completed = {
      queued: 0,
      running: 0,
      done: 4,
      failed_terminal: 0,
      remaining: 0,
      described_images: 12,
    };

    expect(shouldShowImageDescribeProgress(completed)).toBe(false);
    expect(shouldShowImageDescribeProgress({ ...completed, done: 0, described_images: 0 })).toBe(false);
    expect(shouldShowImageDescribeProgress({ ...completed, done: 3, failed_terminal: 1 })).toBe(false);
    expect(shouldShowImageDescribeProgress({ ...completed, queued: 1, remaining: 1 })).toBe(true);
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

  it('selects only the latest active bid_generate task for SSE subscription', () => {
    const olderGeneration = {
      ...task('generate-7', 'running'),
      sequence: 7,
      task_type: 'bid_generate',
    };
    const latestGeneration = {
      ...task('generate-9', 'queued'),
      sequence: 9,
      task_type: 'bid_generate',
    };
    const newerReview = {
      ...task('review-10', 'running'),
      sequence: 10,
      task_type: 'bid_review',
    };
    const terminalGeneration = {
      ...task('generate-11', 'succeeded'),
      sequence: 11,
      task_type: 'bid_generate',
    };

    expect(findLatestActiveBidGenerateTask([
      olderGeneration,
      latestGeneration,
      newerReview,
      terminalGeneration,
    ])).toBe(latestGeneration);
    expect(findLatestActiveBidGenerateTask([newerReview, terminalGeneration])).toBeUndefined();
  });

  it('safely merges only allowlisted stream progress into the matching project task', () => {
    const generation = {
      ...task('5', 'queued'),
      project_id: '1',
      phase: 'bid_generate',
      task_type: 'bid_generate',
      percent: 0,
      public_message: '等待执行',
    };
    const other = { ...task('6', 'running'), project_id: '1', task_type: 'bid_review' };
    const update = {
      type: 'progress' as const,
      taskId: '5',
      progress: {
        phase: 'bid_generate',
        status: 'running',
        percent: 47.6,
        current_work: '正在生成技术标',
      },
    };

    const merged = mergeTaskStreamUpdate([generation, other], update, { projectId: '1' });

    expect(merged[0]).toMatchObject({
      task_id: '5',
      project_id: '1',
      phase: 'bid_generate',
      status: 'running',
      percent: 48,
      public_message: '正在生成技术标',
      occurred_at: '2026-08-14T00:00:00Z',
      error_code: null,
      event_id: '5-queued',
    });
    expect(merged[1]).toBe(other);
    expect(mergeTaskStreamUpdate([generation], { ...update, taskId: '999' }, { projectId: '1' }))
      .toEqual([generation]);
    expect(mergeTaskStreamUpdate([generation], update, { projectId: 'other' }))
      .toEqual([generation]);
  });

  it('holds a progress-level terminal status until the terminal event is confirmed by GET detail', () => {
    const generation = {
      ...task('5', 'running'),
      project_id: '1',
      phase: 'bid_generate',
      task_type: 'bid_generate',
    };
    const merged = mergeTaskStreamUpdate([generation], {
      type: 'progress',
      taskId: '5',
      progress: { phase: 'bid_generate', status: 'done', percent: 100, summary: '完成' },
    }, { projectId: '1', holdTerminalStatus: true });

    expect(merged[0]).toMatchObject({ status: 'running', percent: 100, public_message: '完成' });
  });

  it('prefers an active Agent pipeline task and preserves a terminal task for result rendering', () => {
    const legacyGeneration = {
      ...task('generate-7', 'running'),
      sequence: 7,
      task_type: 'bid_generate',
    };
    const activeAgent = {
      ...task('agent-10', 'running'),
      phase: 'agent_pipeline',
      sequence: 10,
      task_type: 'agent_pipeline',
    };
    const terminalAgent = {
      ...task('agent-11', 'succeeded'),
      phase: 'package_response',
      sequence: 11,
      task_type: 'agent_pipeline',
    };

    expect(findLatestAgentPipelineTask([legacyGeneration, terminalAgent, activeAgent])).toBe(activeAgent);
    expect(findLatestAgentPipelineTask([legacyGeneration, terminalAgent])).toBe(terminalAgent);
    expect(findCurrentProjectSubmissionTask([legacyGeneration, terminalAgent, activeAgent]))
      .toBe(activeAgent);
  });

  it('does not invent a timestamp or backend error code from a stream-only failure status', () => {
    const generation = {
      ...task('5', 'running'),
      project_id: '1',
      phase: 'bid_generate',
      task_type: 'bid_generate',
    };
    const merged = mergeTaskStreamUpdate([generation], {
      type: 'progress',
      taskId: '5',
      progress: { phase: 'bid_generate', status: 'failed', percent: 58, summary: '执行失败' },
    }, { projectId: '1' });

    expect(merged[0]).toMatchObject({
      status: 'failed',
      error_code: null,
      occurred_at: '2026-08-14T00:00:00Z',
      event_id: '5-running',
    });
  });
});
