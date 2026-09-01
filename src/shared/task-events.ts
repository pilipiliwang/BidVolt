export type PublicTaskEvent = {
  schema_version: string;
  event_id: string;
  sequence: number;
  task_id: string;
  task_type?: string;
  project_id: string;
  phase: string;
  status:
    | 'queued'
    | 'running'
    | 'retrying'
    | 'waiting_user'
    | 'cancel_requested'
    | 'cancelled'
    | 'succeeded'
    | 'failed'
    | 'unknown';
  percent: number | null;
  public_message: string;
  error_code: string | null;
  occurred_at: string;
  result_refs?: {
    deliverable_ids?: string[];
    requirement_revision_ids?: string[];
    review_run_id?: string;
    quote_calculation_id?: string;
    check_id?: string;
    export_job_id?: string;
  };
};

/**
 * Agent 主会话与旧 task API 的状态语义并不相同：Agent 的数字状态 4
 * 已经是终态（可续跑的失败），不能复用旧任务的 `retrying` 判断。
 */
export type AgentRunTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed_retryable'
  | 'cancelled'
  | 'failed'
  | 'unknown';

export type AgentRunOutcome = 'complete' | 'incomplete';

export type AgentRunCompletion =
  | 'active'
  | 'complete'
  | 'incomplete'
  | 'failed'
  | 'cancelled'
  | 'unknown_terminal';

export type AgentConversationKind = 'hermes' | 'service' | 'user' | 'tool' | 'error' | string;

export type AgentConversationMessage = {
  content: string;
  kind: AgentConversationKind;
  seq: number;
};

export type AgentQuestionItem = {
  checked: string;
  need: string;
  question: string;
};

export type AgentQuestion = {
  answer: string[] | null;
  answered: boolean;
  askId: string;
  createdAt: string | null;
  items: AgentQuestionItem[];
  legacy: boolean;
  timeoutNotified: boolean;
  windowMinutes: number | null;
};

export type AgentStreamState = 'idle' | 'connecting' | 'connected' | 'ended' | 'fallback' | 'error';

/** A backend-DTO-free view model shared by the overview and task drawer. */
export type AgentRunViewModel = {
  actionList: string[];
  completion: AgentRunCompletion;
  conversation: AgentConversationMessage[];
  errorMessage: string | null;
  message: string;
  outcome: AgentRunOutcome | null;
  percent: number | null;
  phase: string;
  projectId: string;
  questions: AgentQuestion[];
  reason: string | null;
  sessionId: string | null;
  status: AgentRunTaskStatus;
  streamState: AgentStreamState;
  taskId: string;
};

export type AgentRunStatusSource = {
  customer?: {
    action_list?: unknown;
    asks?: unknown;
  } | null;
  error?: unknown;
  progress?: {
    current_work?: unknown;
    percent?: unknown;
    phase?: unknown;
    summary?: unknown;
  } | null;
  result?: {
    action_list?: unknown;
    customer_asks?: unknown;
    outcome?: unknown;
    reason?: unknown;
    session_id?: unknown;
  } | null;
  status?: unknown;
  task_id: number | string;
};

const agentStatusByCode: Record<number, AgentRunTaskStatus> = {
  1: 'queued',
  2: 'running',
  3: 'succeeded',
  4: 'failed_retryable',
  5: 'cancelled',
  6: 'failed',
};

export function normalizeAgentRunStatus(value: unknown): AgentRunTaskStatus {
  if (typeof value === 'number') return agentStatusByCode[value] ?? 'unknown';
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLocaleLowerCase();
  const aliases: Record<string, AgentRunTaskStatus> = {
    cancelled: 'cancelled',
    canceled: 'cancelled',
    done: 'succeeded',
    failed: 'failed',
    failed_retryable: 'failed_retryable',
    queued: 'queued',
    running: 'running',
    succeeded: 'succeeded',
  };
  return aliases[normalized] ?? 'unknown';
}

export function isAgentRunTerminal(status: AgentRunTaskStatus) {
  return status === 'succeeded'
    || status === 'failed_retryable'
    || status === 'cancelled'
    || status === 'failed';
}

export function resolveAgentRunCompletion(
  status: AgentRunTaskStatus,
  outcome: AgentRunOutcome | null,
): AgentRunCompletion {
  if (!isAgentRunTerminal(status)) return 'active';
  if (outcome === 'complete') return 'complete';
  if (outcome === 'incomplete') return 'incomplete';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed' || status === 'failed_retryable') return 'failed';
  return 'unknown_terminal';
}

export function normalizeAgentPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = normalizedString(item);
    return normalized ? [normalized] : [];
  });
}

function normalizedOutcome(value: unknown): AgentRunOutcome | null {
  return value === 'complete' || value === 'incomplete' ? value : null;
}

function normalizeAgentQuestionItem(value: unknown): AgentQuestionItem | null {
  if (typeof value === 'string') {
    const question = normalizedString(value);
    return question ? { checked: '', need: '', question } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const question = normalizedString(source.q) ?? normalizedString(source.question);
  if (!question) return null;
  return {
    checked: normalizedString(source.checked) ?? '',
    need: normalizedString(source.need) ?? '',
    question,
  };
}

export function normalizeAgentQuestions(value: unknown): AgentQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const source = candidate as Record<string, unknown>;
    if (source.kind !== undefined && source.kind !== 'question') return [];
    const items = Array.isArray(source.items)
      ? source.items.flatMap((item) => {
        const normalized = normalizeAgentQuestionItem(item);
        return normalized ? [normalized] : [];
      })
      : [];
    if (items.length === 0) return [];
    const rawAnswer = source.answer;
    const answer = typeof rawAnswer === 'string'
      ? [rawAnswer]
      : Array.isArray(rawAnswer)
        ? normalizedStrings(rawAnswer)
        : null;
    const askId = source.ask_id === undefined || source.ask_id === null
      ? `legacy-${index + 1}`
      : String(source.ask_id);
    const windowMinutes = typeof source.window_minutes === 'number'
      && Number.isFinite(source.window_minutes)
      && source.window_minutes > 0
      ? source.window_minutes
      : null;
    return [{
      answer,
      answered: source.answered === true || source.answered === 1,
      askId,
      createdAt: normalizedString(source.created_at),
      items,
      legacy: source.legacy === true || source.ask_id === undefined || source.ask_id === null,
      timeoutNotified: source.timeout_notified === true,
      windowMinutes,
    }];
  });
}

function publicErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') return normalizedString(error);
  if (!error || typeof error !== 'object') return null;
  const source = error as Record<string, unknown>;
  return normalizedString(source.message) ?? normalizedString(source.detail);
}

export function createAgentRunViewModel(
  source: AgentRunStatusSource,
  {
    projectId,
    questions,
    conversation = [],
    streamState = 'idle',
  }: {
    conversation?: AgentConversationMessage[];
    projectId: number | string;
    questions?: unknown;
    streamState?: AgentStreamState;
  },
): AgentRunViewModel {
  const status = normalizeAgentRunStatus(source.status);
  const outcome = normalizedOutcome(source.result?.outcome);
  const explicitQuestionState = questions && typeof questions === 'object' && !Array.isArray(questions)
    ? questions as Record<string, unknown>
    : null;
  const customerQuestions = explicitQuestionState?.asks
    ?? questions
    ?? source.customer?.asks
    ?? source.result?.customer_asks;
  const actionList = normalizedStrings(
    explicitQuestionState?.action_list
      ?? source.customer?.action_list
      ?? source.result?.action_list,
  );
  return {
    actionList,
    completion: resolveAgentRunCompletion(status, outcome),
    conversation: mergeAgentConversationMessages([], conversation),
    errorMessage: publicErrorMessage(source.error),
    message: normalizedString(source.progress?.current_work)
      ?? normalizedString(source.progress?.summary)
      ?? '主会话状态正在更新',
    outcome,
    percent: normalizeAgentPercent(source.progress?.percent),
    phase: normalizedString(source.progress?.phase) ?? 'agent_pipeline',
    projectId: String(projectId),
    questions: normalizeAgentQuestions(customerQuestions),
    reason: normalizedString(source.result?.reason),
    sessionId: normalizedString(source.result?.session_id),
    status,
    streamState,
    taskId: String(source.task_id),
  };
}

export function mergeAgentConversationMessages(
  previous: readonly AgentConversationMessage[],
  incoming: readonly AgentConversationMessage[],
  limit = 2_000,
): AgentConversationMessage[] {
  const bySequence = new Map<number, AgentConversationMessage>();
  for (const message of [...previous, ...incoming]) {
    if (!Number.isFinite(message.seq) || !message.content.trim()) continue;
    bySequence.set(message.seq, {
      content: message.content,
      kind: message.kind,
      seq: message.seq,
    });
  }
  return [...bySequence.values()]
    .sort((left, right) => left.seq - right.seq)
    .slice(-Math.max(1, limit));
}

export function mergeAgentStreamMessage(
  run: AgentRunViewModel,
  message: AgentConversationMessage,
): AgentRunViewModel {
  return {
    ...run,
    conversation: mergeAgentConversationMessages(run.conversation, [message]),
    streamState: 'connected',
  };
}

export type AgentStreamEndSource = {
  action_list?: unknown;
  error?: unknown;
  outcome?: unknown;
  reason?: unknown;
  session_id?: unknown;
  status?: unknown;
};

export function applyAgentStreamEnd(
  run: AgentRunViewModel,
  end: AgentStreamEndSource,
): AgentRunViewModel {
  const status = normalizeAgentRunStatus(end.status);
  const outcome = normalizedOutcome(end.outcome);
  const completion = resolveAgentRunCompletion(status, outcome);
  const reason = normalizedString(end.reason) ?? run.reason;
  const messages: Record<Exclude<AgentRunCompletion, 'active'>, string> = {
    cancelled: '主会话任务已取消',
    complete: '全部验收门已通过，最终成果已生成',
    failed: '主会话任务执行失败',
    incomplete: reason ?? '主会话已结束，但成果尚未完全闭环',
    unknown_terminal: '主会话任务已结束，正在确认最终结果',
  };
  return {
    ...run,
    actionList: normalizedStrings(end.action_list).length > 0
      ? normalizedStrings(end.action_list)
      : run.actionList,
    completion,
    errorMessage: publicErrorMessage(end.error) ?? run.errorMessage,
    message: completion === 'active' ? run.message : messages[completion],
    outcome,
    percent: completion === 'complete' || completion === 'incomplete' ? 100 : run.percent,
    reason,
    sessionId: normalizedString(end.session_id) ?? run.sessionId,
    status,
    streamState: 'ended',
  };
}

export type AgentQuestionWindow = {
  deadline: number | null;
  label: string;
  state: 'open' | 'expired' | 'unavailable';
};

export function getAgentQuestionWindow(
  question: AgentQuestion,
  now = Date.now(),
): AgentQuestionWindow {
  if (!question.createdAt || question.windowMinutes === null) {
    return { deadline: null, label: '问答窗口时间未提供', state: 'unavailable' };
  }
  const createdAt = Date.parse(question.createdAt);
  if (!Number.isFinite(createdAt)) {
    return { deadline: null, label: '问答窗口时间未提供', state: 'unavailable' };
  }
  const deadline = createdAt + question.windowMinutes * 60_000;
  const remaining = deadline - now;
  if (remaining <= 0 || question.timeoutNotified) {
    return {
      deadline,
      label: '已超时，仍可补答；回答将回传主会话重新核验',
      state: 'expired',
    };
  }
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return {
    deadline,
    label: `剩余 ${minutes} 分 ${String(seconds).padStart(2, '0')} 秒，超时后主会话将自行决定`,
    state: 'open',
  };
}

export function agentRunToPublicTaskEvent(
  run: AgentRunViewModel,
  {
    occurredAt = '时间未提供',
    sequence = 1,
  }: {
    occurredAt?: string;
    sequence?: number;
  } = {},
): PublicTaskEvent {
  const publicStatus: PublicTaskEvent['status'] = run.status === 'failed_retryable'
    ? 'failed'
    : run.status;
  return {
    error_code: null,
    event_id: `agent-${run.taskId}`,
    occurred_at: occurredAt,
    percent: run.percent,
    phase: run.phase,
    project_id: run.projectId,
    public_message: run.message,
    schema_version: 'agent-1',
    sequence,
    status: publicStatus,
    task_id: run.taskId,
    task_type: 'agent_pipeline',
  };
}
