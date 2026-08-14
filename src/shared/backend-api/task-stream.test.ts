import { describe, expect, it, vi } from 'vitest';

import {
  BackendTaskStreamProtocolError,
  consumeBackendTaskStream,
  parseBackendTaskStreamEvent,
} from './task-stream';

const sseResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
};

describe('backend task SSE parser', () => {
  it('parses the actual snapshot/progress/terminal contract across chunk boundaries', async () => {
    const onUpdate = vi.fn();
    const response = sseResponse([
      'event: snapshot\ndata: {"task_id":5,"status":1,"progress":{"phase":"bid_generate",',
      '"status":"queued","percent":0,"internal_id":"never-forward"}}\n\n',
      'event: progress\ndata: {"phase":"bid_generate","status":"running","percent":42,',
      '"current_work":"生成技术标","secret":"discard"}\n\n',
      'event: done\ndata: {"task_id":5,"status":3}\n\n',
    ]);

    await expect(consumeBackendTaskStream(response, {
      taskId: '5',
      onUpdate,
    })).resolves.toEqual({ type: 'done', taskId: '5', status: 3 });

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[0][0]).toEqual({
      type: 'snapshot',
      taskId: '5',
      status: 1,
      progress: { phase: 'bid_generate', status: 'queued', percent: 0 },
    });
    expect(onUpdate.mock.calls[1][0]).toEqual({
      type: 'progress',
      taskId: '5',
      progress: {
        phase: 'bid_generate',
        status: 'running',
        percent: 42,
        current_work: '生成技术标',
      },
    });
    expect(JSON.stringify(onUpdate.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(onUpdate.mock.calls)).not.toContain('internal_id');
  });

  it('rejects task mismatches, heartbeat extensions, malformed allowlist values, and early EOF', async () => {
    expect(() => parseBackendTaskStreamEvent(
      'snapshot',
      '{"task_id":9,"status":1,"progress":{"phase":"bid_generate","status":"queued","percent":0}}',
      '5',
    )).toThrow(/task_id/);
    expect(() => parseBackendTaskStreamEvent('heartbeat', '{}', '5'))
      .toThrow(BackendTaskStreamProtocolError);
    expect(() => parseBackendTaskStreamEvent(
      'progress',
      '{"phase":"bid_generate","status":"running","percent":"50"}',
      '5',
    )).toThrow(/percent/);
    await expect(consumeBackendTaskStream(sseResponse([
      'event: progress\ndata: {"phase":"bid_generate","status":"running","percent":50}\n\n',
    ]), { taskId: '5', onUpdate: vi.fn() })).rejects.toThrow(/终态事件前断开/);
  });

  it('cancels a pending reader immediately when its AbortSignal is aborted', async () => {
    let cancelCalled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalled = true;
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const controller = new AbortController();
    const consuming = consumeBackendTaskStream(response, {
      taskId: '5',
      signal: controller.signal,
      onUpdate: vi.fn(),
    });

    controller.abort();

    await expect(consuming).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelCalled).toBe(true);
  });
});
