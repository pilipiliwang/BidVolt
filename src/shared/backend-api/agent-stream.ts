import type { JsonValue } from './types';

export type AgentRunStreamMessage = Readonly<{
  type: 'message';
  seq: number;
  kind: string;
  content: string;
}>;

export type AgentRunStreamEnd = Readonly<{
  type: 'end';
  status: number;
  sessionId: string | null;
  outcome: string | null;
  reason: string | null;
  actionList: readonly string[];
  error: JsonValue | null;
}>;

export type AgentRunStreamEvent = AgentRunStreamMessage | AgentRunStreamEnd;

export class AgentRunStreamProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AgentRunStreamProtocolError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const protocolError = (message: string, cause?: unknown) =>
  new AgentRunStreamProtocolError(message, cause === undefined ? undefined : { cause });

const nullableString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw protocolError(`BidVolt 会话流 ${field} 无效`);
  return value;
};

const jsonValue = (value: unknown): value is JsonValue => {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(jsonValue);
  return isRecord(value) && Object.values(value).every(jsonValue);
};

export function parseAgentRunStreamEvent(eventName: string, data: string): AgentRunStreamEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(data) as unknown;
  } catch (error) {
    throw protocolError('BidVolt 会话流 data 不是有效 JSON', error);
  }
  if (!isRecord(payload)) throw protocolError('BidVolt 会话流 data 必须是对象');

  if (eventName === 'message') {
    if (!Number.isInteger(payload.seq) || (payload.seq as number) < 0) {
      throw protocolError('BidVolt 会话流 message.seq 无效');
    }
    if (typeof payload.kind !== 'string' || !payload.kind) {
      throw protocolError('BidVolt 会话流 message.kind 无效');
    }
    if (typeof payload.content !== 'string') {
      throw protocolError('BidVolt 会话流 message.content 无效');
    }
    return Object.freeze({
      type: 'message',
      seq: payload.seq as number,
      kind: payload.kind,
      content: payload.content,
    });
  }

  if (eventName === 'end') {
    if (!Number.isInteger(payload.status)) {
      throw protocolError('BidVolt 会话流 end.status 无效');
    }
    const actionList = payload.action_list ?? [];
    if (!Array.isArray(actionList) || !actionList.every((item) => typeof item === 'string')) {
      throw protocolError('BidVolt 会话流 end.action_list 无效');
    }
    const error = payload.error ?? null;
    if (!jsonValue(error)) throw protocolError('BidVolt 会话流 end.error 无效');
    return Object.freeze({
      type: 'end',
      status: payload.status as number,
      sessionId: nullableString(payload.session_id, 'end.session_id'),
      outcome: nullableString(payload.outcome, 'end.outcome'),
      reason: nullableString(payload.reason, 'end.reason'),
      actionList: Object.freeze([...actionList]),
      error,
    });
  }

  throw protocolError(`BidVolt 会话流包含不支持的事件：${eventName || '(empty)'}`);
}

const abortError = (signal: AbortSignal) => {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('BidVolt 会话订阅已取消', 'AbortError');
};

const findFrameBoundary = (buffer: string) => {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
};

const parseFrame = (frame: string) => {
  let eventName = '';
  const dataLines: string[] = [];
  for (const rawLine of frame.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    const separator = rawLine.indexOf(':');
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator);
    const rawValue = separator < 0 ? '' : rawLine.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') {
      if (eventName) throw protocolError('BidVolt 会话流单帧包含多个 event 字段');
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    } else {
      throw protocolError(`BidVolt 会话流包含不支持的字段：${field}`);
    }
  }
  if (!eventName || dataLines.length === 0) {
    throw protocolError('BidVolt 会话流帧缺少 event 或 data');
  }
  return parseAgentRunStreamEvent(eventName, dataLines.join('\n'));
};

export type ConsumeAgentRunStreamOptions = {
  signal?: AbortSignal;
  onMessage: (event: AgentRunStreamMessage) => void;
};

export async function consumeAgentRunStream(
  response: Response,
  { signal, onMessage }: ConsumeAgentRunStreamOptions,
): Promise<AgentRunStreamEnd> {
  if (!response.headers.get('Content-Type')?.toLocaleLowerCase().includes('text/event-stream')) {
    throw protocolError('BidVolt 会话进度接口未返回 text/event-stream');
  }
  if (!response.body) throw protocolError('BidVolt 会话流没有可读取的响应体');
  if (signal?.aborted) throw abortError(signal);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const cancelReader = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
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
          const event = parseFrame(frame);
          if (event.type === 'message') onMessage(event);
          else return event;
        }
        boundary = findFrameBoundary(buffer);
      }

      if (done) {
        if (buffer.trim()) {
          const event = parseFrame(buffer);
          if (event.type === 'message') onMessage(event);
          else return event;
        }
        throw protocolError('BidVolt 会话流在 end 事件前断开');
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}
