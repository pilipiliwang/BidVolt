import { idPath, queryString, type BackendApiClient } from './client';
import {
  consumeBackendTaskStream,
  type BackendTaskStreamTerminal,
  type BackendTaskStreamUpdate,
} from './task-stream';
import type { BackendId, BackendTask, CreatedTask } from './types';

export type BackendTaskPollReason = 'terminal' | 'attempt-limit';

export type BackendTaskPollResult = {
  task: BackendTask;
  attempts: number;
  reason: BackendTaskPollReason;
};

export type BackendTaskPollOptions = {
  signal?: AbortSignal;
  intervalMs?: number;
  maxAttempts?: number;
  onUpdate?: (task: BackendTask, context: { attempt: number }) => void;
  wait?: (intervalMs: number, signal?: AbortSignal) => Promise<void>;
};

export type BackendTaskGetter = (signal?: AbortSignal) => Promise<BackendTask>;

export type BackendTaskStreamOptions = {
  signal?: AbortSignal;
  onUpdate: (event: BackendTaskStreamUpdate) => void;
};

const TERMINAL_TASK_STATUSES = new Set([3, 5, 6]);
const TERMINAL_PROGRESS_STATUSES = new Set([
  'done',
  'succeeded',
  'cancelled',
  'canceled',
  'failed',
]);

export function isBackendTaskTerminal(task: BackendTask) {
  if (task.task_type === 'agent_pipeline' && task.status === 4) return true;
  if (TERMINAL_TASK_STATUSES.has(task.status)) return true;
  const progressStatus = typeof task.progress.status === 'string'
    ? task.progress.status.toLocaleLowerCase()
    : null;
  return progressStatus !== null && TERMINAL_PROGRESS_STATUSES.has(progressStatus);
}

const abortError = (signal: AbortSignal) => {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('任务轮询已取消', 'AbortError');
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError(signal);
};

const waitForNextPoll = (intervalMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    try {
      throwIfAborted(signal);
    } catch (error) {
      reject(error);
      return;
    }

    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, intervalMs);
    const handleAbort = () => {
      globalThis.clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
  });

/**
 * Polls the authenticated task detail endpoint without inventing SSE events.
 * A limit returns the latest non-terminal task explicitly as `attempt-limit`.
 */
export async function pollBackendTask(
  getTask: BackendTaskGetter,
  {
    signal,
    intervalMs = 1_000,
    maxAttempts,
    onUpdate,
    wait = waitForNextPoll,
  }: BackendTaskPollOptions = {},
): Promise<BackendTaskPollResult> {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new RangeError('intervalMs 必须是大于或等于 0 的有限数字');
  }
  if (maxAttempts !== undefined
    && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    throw new RangeError('maxAttempts 必须是大于或等于 1 的整数');
  }

  const attemptLimit = maxAttempts ?? Number.POSITIVE_INFINITY;
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    throwIfAborted(signal);
    let task: BackendTask;
    try {
      task = await getTask(signal);
    } catch (error) {
      throwIfAborted(signal);
      throw error;
    }
    throwIfAborted(signal);
    onUpdate?.(task, { attempt });
    throwIfAborted(signal);

    if (isBackendTaskTerminal(task)) {
      return { task, attempts: attempt, reason: 'terminal' };
    }
    if (attempt === attemptLimit) {
      return { task, attempts: attempt, reason: 'attempt-limit' };
    }
    await wait(intervalMs, signal);
  }

  throw new Error('任务轮询未执行');
}

export const createTasksApi = (client: BackendApiClient) => {
  const get = (
    taskId: BackendId,
    { signal }: { signal?: AbortSignal } = {},
  ) => client.request<BackendTask>(`/tasks/${idPath(taskId)}`, { signal });

  return {
    list: (projectId: BackendId, statusFilter?: number) =>
      client.request<{ items: BackendTask[] }>(
        `/projects/${idPath(projectId)}/tasks${queryString({ status_filter: statusFilter })}`,
      ),
    create: (projectId: BackendId, body: {
      task_type: string; idempotency_key: string; payload?: Record<string, unknown>;
    }) => client.request<CreatedTask>(`/projects/${idPath(projectId)}/tasks`, { method: 'POST', body }),
    get,
    poll: (taskId: BackendId, options: BackendTaskPollOptions = {}) =>
      pollBackendTask((signal) => get(taskId, { signal }), options),
    interrupt: (projectId: BackendId, taskId: BackendId) =>
      client.request<{ task_id: number; generation: number }>(
        `/projects/${idPath(projectId)}/tasks/${idPath(taskId)}/interrupt`, { method: 'POST' },
      ),
    stream: async (
      taskId: BackendId,
      { signal, onUpdate }: BackendTaskStreamOptions,
    ): Promise<BackendTaskStreamTerminal> => {
      const publicTaskId = String(taskId);
      return client.requestStream(
        `/tasks/${idPath(taskId)}/stream`,
        { headers: { Accept: 'text/event-stream' }, signal },
        (response) => consumeBackendTaskStream(
          response,
          { taskId: publicTaskId, signal, onUpdate },
        ),
      );
    },
    streamUrl: (taskId: BackendId, baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1') =>
      `${baseUrl.replace(/\/+$/, '')}/tasks/${idPath(taskId)}/stream`,
  };
};
