export type BackendTaskStreamProgress = Readonly<{
  phase: string;
  status: string;
  percent: number;
  current_work?: string;
  summary?: string;
  hint?: string;
}>;

export type BackendTaskStreamUpdate =
  | Readonly<{
      type: 'snapshot';
      taskId: string;
      status: number;
      progress: BackendTaskStreamProgress;
    }>
  | Readonly<{
      type: 'progress';
      taskId: string;
      progress: BackendTaskStreamProgress;
    }>;

export type BackendTaskStreamTerminal = Readonly<{
  type: 'done' | 'cancelled' | 'failed';
  taskId: string;
  status: number;
}>;

export type BackendTaskStreamEvent = BackendTaskStreamUpdate | BackendTaskStreamTerminal;

export class BackendTaskStreamProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackendTaskStreamProtocolError';
  }
}

const terminalEventNames = new Set<BackendTaskStreamTerminal['type']>([
  'done',
  'cancelled',
  'failed',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const protocolError = (message: string, cause?: unknown) =>
  new BackendTaskStreamProtocolError(message, cause === undefined ? undefined : { cause });

const readTaskId = (payload: Record<string, unknown>, expectedTaskId: string) => {
  const taskId = payload.task_id;
  if ((typeof taskId !== 'number' && typeof taskId !== 'string') || String(taskId) !== expectedTaskId) {
    throw protocolError('任务进度流返回了不匹配的 task_id');
  }
  return expectedTaskId;
};

const readStatus = (payload: Record<string, unknown>) => {
  if (!Number.isInteger(payload.status)) {
    throw protocolError('任务进度流返回了无效的 status');
  }
  return payload.status as number;
};

/**
 * Copies only the backend public-event allowlist. Unknown keys are discarded
 * instead of ever reaching UI state.
 */
export function readBackendTaskStreamProgress(value: unknown): BackendTaskStreamProgress {
  if (!isRecord(value)) throw protocolError('任务进度流缺少 progress 对象');

  const phase = value.phase;
  const status = value.status;
  if (typeof phase !== 'string' || phase.length === 0) {
    throw protocolError('任务进度流 progress.phase 无效');
  }
  if (typeof status !== 'string' || status.length === 0) {
    throw protocolError('任务进度流 progress.status 无效');
  }
  if (typeof value.percent !== 'number' || !Number.isFinite(value.percent)) {
    throw protocolError('任务进度流 progress.percent 无效');
  }

  const progress: {
    phase: string;
    status: string;
    percent: number;
    current_work?: string;
    summary?: string;
    hint?: string;
  } = {
    phase,
    status,
    percent: value.percent,
  };
  for (const key of ['current_work', 'summary', 'hint'] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string') {
      throw protocolError(`任务进度流 progress.${key} 无效`);
    }
    progress[key] = value[key];
  }
  return Object.freeze(progress);
}

export function parseBackendTaskStreamEvent(
  eventName: string,
  data: string,
  expectedTaskId: string,
): BackendTaskStreamEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch (error) {
    throw protocolError('任务进度流 data 不是有效 JSON', error);
  }
  if (!isRecord(parsed)) throw protocolError('任务进度流 data 必须是对象');

  if (eventName === 'snapshot') {
    return Object.freeze({
      type: 'snapshot',
      taskId: readTaskId(parsed, expectedTaskId),
      status: readStatus(parsed),
      progress: readBackendTaskStreamProgress(parsed.progress),
    });
  }
  if (eventName === 'progress') {
    return Object.freeze({
      type: 'progress',
      taskId: expectedTaskId,
      progress: readBackendTaskStreamProgress(parsed),
    });
  }
  if (terminalEventNames.has(eventName as BackendTaskStreamTerminal['type'])) {
    return Object.freeze({
      type: eventName as BackendTaskStreamTerminal['type'],
      taskId: readTaskId(parsed, expectedTaskId),
      status: readStatus(parsed),
    });
  }
  throw protocolError(`任务进度流包含不支持的事件：${eventName || '(empty)'}`);
}

const abortError = (signal: AbortSignal) => {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('任务进度订阅已取消', 'AbortError');
};

const findFrameBoundary = (buffer: string) => {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
};

const parseFrame = (frame: string, expectedTaskId: string) => {
  let eventName = '';
  const dataLines: string[] = [];
  for (const rawLine of frame.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    const separator = rawLine.indexOf(':');
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator);
    const rawValue = separator < 0 ? '' : rawLine.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') {
      if (eventName) throw protocolError('任务进度流单帧包含多个 event 字段');
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    } else {
      // This backend contract has no id, retry, or heartbeat extension.
      throw protocolError(`任务进度流包含不支持的字段：${field}`);
    }
  }
  if (!eventName || dataLines.length === 0) {
    throw protocolError('任务进度流帧缺少 event 或 data');
  }
  return parseBackendTaskStreamEvent(eventName, dataLines.join('\n'), expectedTaskId);
};

export type ConsumeBackendTaskStreamOptions = {
  taskId: string;
  signal?: AbortSignal;
  onUpdate: (event: BackendTaskStreamUpdate) => void;
};

/** Reads one authenticated fetch response until the backend emits a terminal event. */
export async function consumeBackendTaskStream(
  response: Response,
  { taskId, signal, onUpdate }: ConsumeBackendTaskStreamOptions,
): Promise<BackendTaskStreamTerminal> {
  if (!response.headers.get('Content-Type')?.toLocaleLowerCase().includes('text/event-stream')) {
    throw protocolError('任务进度接口未返回 text/event-stream');
  }
  if (!response.body) throw protocolError('任务进度接口没有可读取的响应体');
  if (signal?.aborted) throw abortError(signal);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const cancelReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted) throw abortError(signal);
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortError(signal);
      buffer += decoder.decode(value, { stream: !done });

      let boundary = findFrameBoundary(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        if (frame.trim()) {
          const event = parseFrame(frame, taskId);
          if (event.type === 'snapshot' || event.type === 'progress') onUpdate(event);
          else return event;
        }
        boundary = findFrameBoundary(buffer);
      }

      if (done) {
        if (buffer.trim()) {
          const event = parseFrame(buffer, taskId);
          if (event.type === 'snapshot' || event.type === 'progress') onUpdate(event);
          else return event;
        }
        throw protocolError('任务进度流在终态事件前断开');
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}
