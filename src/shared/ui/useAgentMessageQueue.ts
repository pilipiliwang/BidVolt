import { useCallback, useEffect, useRef, useState } from 'react';
import { publicAgentReply } from './agent-timeline-classification';

export type AgentMessageQueueResponse = {
  queued?: boolean;
  reply?: string | null;
  returncode?: number;
  message?: string;
  status?: string;
} | void;
export type AgentMessageQueueLocalMessage = {
  id: string;
  content: string;
  echoContent?: string;
  replyToMessageId?: string;
  createdAt: string;
  role: 'user' | 'agent';
  status: 'waiting' | 'unconfirmed' | 'accepted' | 'no-reply' | 'sent' | 'failed';
  /** Informational waiting state, distinct from an actual request failure. */
  notice?: string | null;
  error?: string | null;
  afterSequence?: number;
};
export type AgentMessageQueueEntry = {
  localId: string;
  content: string;
  summary?: string;
  createdAt: string;
  pending: false;
};
export type AgentMessageQueueSendOptions = {
  summary?: string;
  afterSequence?: number;
  onFailure?: (error: unknown) => void;
};
export type AgentMessageQueueOptions = {
  scopeKey: string | number;
  onSend?: (
    content: string,
    mode: 'queue' | 'steer',
  ) => AgentMessageQueueResponse | Promise<AgentMessageQueueResponse>;
  timeoutMs?: number;
};

type Job = AgentMessageQueueEntry & AgentMessageQueueSendOptions;
type QueueState = {
  scopeKey: string | number;
  alive: boolean;
  jobs: Map<string, Job>;
  queued: string[];
  active: Set<string>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  messages: AgentMessageQueueLocalMessage[];
};
type Snapshot = {
  scopeKey: string | number;
  queuedMessages: AgentMessageQueueEntry[];
  localMessages: AgentMessageQueueLocalMessage[];
  pending: boolean;
  hasInFlight: boolean;
};

function newState(scopeKey: string | number): QueueState {
  return {
    scopeKey, alive: true, jobs: new Map(), queued: [], active: new Set(),
    timers: new Map(), messages: [],
  };
}

export function isUnconfirmedAgentRequestError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  if ('status' in error && typeof error.status === 'number') {
    return error.status === 0 || error.status === 408 || error.status >= 500;
  }
  return 'name' in error
    && typeof error.name === 'string'
    && ['AbortError', 'TimeoutError', 'TypeError'].includes(error.name);
}

function requestErrorDetail(error: unknown, fallback: string) {
  return typeof error === 'object' && error !== null
    && 'message' in error && typeof error.message === 'string' && error.message.trim()
    ? publicAgentReply(error.message) || fallback
    : fallback;
}

function snapshot(state: QueueState): Snapshot {
  return {
    scopeKey: state.scopeKey,
    queuedMessages: state.queued.flatMap((id) => {
      const job = state.jobs.get(id);
      return job ? [{
        localId: job.localId, content: job.content, summary: job.summary,
        createdAt: job.createdAt, pending: false as const,
      }] : [];
    }),
    localMessages: [...state.messages],
    pending: state.messages.some((message) => state.active.has(message.id) && message.status === 'waiting'),
    hasInFlight: state.active.size > 0,
  };
}

/** Only unsent browser-local entries are editable/removable. Submitted requests
 * remain in the timeline, even after a timeout, until their actual reply arrives. */
export function useAgentMessageQueue({ scopeKey, onSend, timeoutMs = 30_000 }: AgentMessageQueueOptions) {
  const stateRef = useRef<QueueState>(newState(scopeKey));
  const optionsRef = useRef({ scopeKey, onSend, timeoutMs });
  optionsRef.current = { scopeKey, onSend, timeoutMs };
  const [view, setView] = useState(() => snapshot(stateRef.current));

  useEffect(() => {
    if (!stateRef.current.alive || stateRef.current.scopeKey !== scopeKey) {
      stateRef.current = newState(scopeKey);
      setView(snapshot(stateRef.current));
    }
    const state = stateRef.current;
    return () => {
      state.alive = false;
      state.timers.forEach(clearTimeout);
      state.timers.clear();
      state.queued = [];
      state.jobs.clear();
    };
  }, [scopeKey]);

  const isCurrent = useCallback((state: QueueState) => (
    state.alive && stateRef.current === state && optionsRef.current.scopeKey === state.scopeKey
  ), []);
  const publish = useCallback((state: QueueState) => {
    if (isCurrent(state)) setView(snapshot(state));
  }, [isCurrent]);

  const dispatch = useCallback(function dispatchJob(state: QueueState, job: Job, mode: 'queue' | 'steer') {
    if (!isCurrent(state) || state.active.has(job.localId)) return;
    state.queued = state.queued.filter((id) => id !== job.localId);
    state.active.add(job.localId);
    state.messages.push({
      id: job.localId, content: job.summary?.trim() || job.content,
      echoContent: job.content, createdAt: job.createdAt,
      afterSequence: job.afterSequence, role: 'user', status: 'waiting', error: null,
    });
    publish(state);

    const updateMessage = (
      status: AgentMessageQueueLocalMessage['status'],
      error: string | null = null,
      notice: string | null = null,
    ) => {
      state.messages = state.messages.map((message) => message.id === job.localId
        ? { ...message, status, error, notice }
        : message);
    };
    const timeout = setTimeout(() => {
      if (!isCurrent(state) || !state.active.has(job.localId)) return;
      state.timers.delete(job.localId);
      // This is a slow-response notice, not a transport timeout. The request is
      // still open; neither receipt nor failure can be inferred from elapsed time.
      updateMessage('waiting', null, '处理时间较长，仍在等待 BidVolt 回复。');
      publish(state);
    }, Math.max(1, optionsRef.current.timeoutMs));
    state.timers.set(job.localId, timeout);

    const finish = (response: AgentMessageQueueResponse, failure?: { error: unknown }) => {
      if (!isCurrent(state)) return;
      if (!failure && response?.returncode !== undefined && response.returncode !== 0) {
        failure = { error: new Error(publicAgentReply(response.message || response.reply || '') || 'BidVolt 未能完成本次请求，请稍后重试。') };
      }
      clearTimeout(state.timers.get(job.localId));
      state.timers.delete(job.localId);
      state.active.delete(job.localId);
      state.jobs.delete(job.localId);
      if (failure) {
        const error = failure.error;
        if (isUnconfirmedAgentRequestError(error)) {
          // A lost receipt is not proof that the server rejected the message.
          // This promise settled, so later distinct jobs can proceed, but this
          // submitted job must never be retried or have its attachments restored.
          updateMessage(
            'unconfirmed',
            requestErrorDetail(error, '连接中断，无法确认本次请求结果。'),
            '连接已中断，结果待确认；请勿重复发送。',
          );
        } else {
          updateMessage('failed', requestErrorDetail(error, '消息发送失败，请检查连接后重试。'));
          // A consumer's attachment recovery must never prevent the queue draining.
          try { job.onFailure?.(error); } catch { /* The request failure is already visible. */ }
        }
      } else {
        const reply = typeof response?.reply === 'string' ? publicAgentReply(response.reply) : '';
        // HTTP success / queued acknowledgement is not a completed Agent reply.
        // Keep that distinction even when the server returns an empty body.
        const processedWithoutReply = !reply && !response?.queued
          && (response?.status === 'processed' || response?.returncode === 0);
        updateMessage(reply ? 'sent' : processedWithoutReply ? 'no-reply' : 'accepted', null,
          processedWithoutReply ? '本次请求已结束，但未返回有效回复。可继续发送新的问题。' : null);
        if (reply?.trim()) state.messages.push({
          id: `${job.localId}:reply`, replyToMessageId: job.localId,
          content: reply, createdAt: new Date().toISOString(),
          afterSequence: job.afterSequence, role: 'agent', status: 'sent', error: null,
        });
      }
      publish(state);
      // All submitted requests, including concurrent steering requests and timed
      // out requests, must settle before normal FIFO dispatch can resume.
      if (state.active.size === 0) {
        const next = state.jobs.get(state.queued[0]);
        if (next) dispatchJob(state, next, 'queue');
      }
    };

    try {
      const send = optionsRef.current.onSend;
      if (!send) throw new Error('当前会话暂时无法发送消息。');
      void Promise.resolve(send(job.content, mode)).then(
        (response) => finish(response),
        (error: unknown) => finish(undefined, { error }),
      );
    } catch (error) {
      finish(undefined, { error });
    }
  }, [isCurrent, publish]);

  const send = useCallback((content: string, options: AgentMessageQueueSendOptions = {}) => {
    const state = stateRef.current;
    if (!content.trim() || !isCurrent(state) || !optionsRef.current.onSend) return undefined;
    const job: Job = {
      ...options, localId: crypto.randomUUID(), content,
      createdAt: new Date().toISOString(), pending: false,
    };
    state.jobs.set(job.localId, job);
    const queued = state.active.size > 0;
    if (queued) {
      state.queued.push(job.localId);
      publish(state);
    } else {
      dispatch(state, job, 'queue');
    }
    return { id: job.localId, queued };
  }, [dispatch, isCurrent, publish]);

  const deleteQueued = useCallback((message: { localId?: string } | string) => {
    const state = stateRef.current;
    const id = typeof message === 'string' ? message : message.localId;
    if (!id || !isCurrent(state) || !state.queued.includes(id)) return false;
    state.queued = state.queued.filter((queuedId) => queuedId !== id);
    state.jobs.delete(id);
    publish(state);
    return true;
  }, [isCurrent, publish]);

  const steer = useCallback((message: { localId?: string } | string) => {
    const state = stateRef.current;
    const id = typeof message === 'string' ? message : message.localId;
    if (!id || !isCurrent(state) || !state.queued.includes(id)) return false;
    const job = state.jobs.get(id);
    if (!job) return false;
    dispatch(state, job, 'steer');
    return true;
  }, [dispatch, isCurrent]);

  const currentView = view.scopeKey === scopeKey ? view : snapshot(newState(scopeKey));
  return { ...currentView, send, steer, deleteQueued };
}
