import { describe, expect, it, vi } from 'vitest';

import type { BackendApiClient } from './client';
import {
  createTasksApi,
  isBackendTaskTerminal,
  pollBackendTask,
} from './tasks';
import type { BackendTask } from './types';

const task = (
  status: number,
  progressStatus: string,
  percent = 0,
): BackendTask => ({
  task_id: 17,
  task_type: 'tender_parse',
  status,
  retry_count: 0,
  progress: {
    phase: 'tender_parse',
    status: progressStatus,
    percent,
  },
});

const clientWithRequest = (request: BackendApiClient['request']): BackendApiClient => ({
  request,
  requestBlob: vi.fn(),
  requestVoid: vi.fn(),
});

describe('backend task polling', () => {
  it('recognizes only real backend terminal states', () => {
    expect(isBackendTaskTerminal(task(3, 'done', 100))).toBe(true);
    expect(isBackendTaskTerminal(task(5, 'cancelled', 100))).toBe(true);
    expect(isBackendTaskTerminal(task(6, 'failed', 100))).toBe(true);
    expect(isBackendTaskTerminal(task(2, 'succeeded', 100))).toBe(true);
    expect(isBackendTaskTerminal(task(1, 'queued'))).toBe(false);
    expect(isBackendTaskTerminal(task(2, 'running', 80))).toBe(false);
    expect(isBackendTaskTerminal(task(4, 'retrying', 5))).toBe(false);
  });

  it('polls task detail until a terminal response and reports every update', async () => {
    const responses = [
      task(1, 'queued'),
      task(2, 'running', 50),
      task(3, 'done', 100),
    ];
    const getTask = vi.fn(async () => responses.shift() as BackendTask);
    const wait = vi.fn(async () => undefined);
    const updates: Array<{ status: number; attempt: number }> = [];

    const result = await pollBackendTask(getTask, {
      intervalMs: 25,
      maxAttempts: 5,
      wait,
      onUpdate: (value, { attempt }) => updates.push({ status: value.status, attempt }),
    });

    expect(result).toEqual({ task: task(3, 'done', 100), attempts: 3, reason: 'terminal' });
    expect(getTask).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 25, undefined);
    expect(updates).toEqual([
      { status: 1, attempt: 1 },
      { status: 2, attempt: 2 },
      { status: 3, attempt: 3 },
    ]);
  });

  it('returns the latest non-terminal task honestly when the attempt limit is reached', async () => {
    const latest = task(2, 'running', 70);
    const getTask = vi.fn()
      .mockResolvedValueOnce(task(1, 'queued'))
      .mockResolvedValueOnce(latest);

    const result = await pollBackendTask(getTask, {
      intervalMs: 0,
      maxAttempts: 2,
      wait: async () => undefined,
    });

    expect(result).toEqual({ task: latest, attempts: 2, reason: 'attempt-limit' });
  });

  it('does not issue a request when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const getTask = vi.fn(async () => task(1, 'queued'));

    await expect(pollBackendTask(getTask, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(getTask).not.toHaveBeenCalled();
  });

  it('cancels the wait immediately and does not issue another request', async () => {
    const controller = new AbortController();
    const getTask = vi.fn(async () => task(2, 'running', 30));
    const polling = pollBackendTask(getTask, {
      signal: controller.signal,
      intervalMs: 60_000,
    });
    await vi.waitFor(() => expect(getTask).toHaveBeenCalledOnce());

    controller.abort();

    await expect(polling).rejects.toMatchObject({ name: 'AbortError' });
    expect(getTask).toHaveBeenCalledOnce();
  });

  it('propagates detail endpoint failures without inventing task updates or retrying', async () => {
    const failure = new Error('backend unavailable');
    const getTask = vi.fn().mockRejectedValue(failure);
    const onUpdate = vi.fn();

    await expect(pollBackendTask(getTask, { onUpdate })).rejects.toBe(failure);
    expect(getTask).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('validates polling limits before issuing a backend request', async () => {
    const getTask = vi.fn(async () => task(1, 'queued'));

    await expect(pollBackendTask(getTask, { intervalMs: -1 })).rejects.toBeInstanceOf(RangeError);
    await expect(pollBackendTask(getTask, { maxAttempts: 0 })).rejects.toBeInstanceOf(RangeError);
    expect(getTask).not.toHaveBeenCalled();
  });

  it('uses the authenticated tasks.get client path and forwards AbortSignal', async () => {
    const terminal = task(3, 'done', 100);
    const request = vi.fn().mockResolvedValue(terminal) as unknown as BackendApiClient['request'];
    const api = createTasksApi(clientWithRequest(request));
    const controller = new AbortController();

    await expect(api.poll('task/17', {
      signal: controller.signal,
      maxAttempts: 1,
    })).resolves.toEqual({ task: terminal, attempts: 1, reason: 'terminal' });

    expect(request).toHaveBeenCalledWith('/tasks/task%2F17', { signal: controller.signal });
  });
});
