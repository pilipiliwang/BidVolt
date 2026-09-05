import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  ListChecks,
  Send,
} from 'lucide-react';

import {
  getAgentQuestionWindow,
  type AgentQuestion,
  type AgentRunViewModel,
} from '../task-events';
import { MarkdownContent } from './MarkdownContent';
import { classifyAgentConversation, publicAgentReply, summarizeRuntimeLog } from './agent-timeline-classification';
import './AgentActivityTimeline.css';

export type AgentTimelineLocalMessageStatus =
  | 'queued'
  | 'waiting'
  | 'unconfirmed'
  | 'accepted'
  | 'sent'
  | 'steer'
  | 'cancelled'
  | 'failed';

export type AgentTimelineLocalMessage = {
  /** Only newer SSE entries may acknowledge this locally submitted message. */
  afterSequence?: number;
  content: string;
  echoContent?: string;
  createdAt?: string | null;
  error?: string | null;
  notice?: string | null;
  id: string;
  replyToMessageId?: string;
  role?: 'user' | 'agent';
  sequence?: number | null;
  status?: AgentTimelineLocalMessageStatus;
};

export type AgentTimelineAnswerResult = {
  queued?: boolean;
  reply?: string | null;
};

export type AgentActivityTimelineProps = {
  answeringAskId?: string | null;
  compact?: boolean;
  localMessages?: readonly AgentTimelineLocalMessage[];
  now?: number;
  onAnswerInteraction?: (
    askId: string,
    answers: string[],
  ) => AgentTimelineAnswerResult | Promise<AgentTimelineAnswerResult | void> | void;
  run: AgentRunViewModel;
};

type MessageEntry = {
  content: string;
  id: string;
  kind: 'agent' | 'error' | 'interaction' | 'log' | 'user';
  label: string;
  sequence: number | null;
  timestamp: number | null;
  userStatus?: AgentTimelineLocalMessageStatus;
  error?: string | null;
  notice?: string | null;
};

type InteractionEntry = {
  id: string;
  kind: 'question';
  question: AgentQuestion;
  sequence: null;
  timestamp: number | null;
};

type ActionEntry = {
  actions: string[];
  id: string;
  kind: 'actions';
  sequence: null;
  timestamp: null;
};

type TimelineEntry = MessageEntry | InteractionEntry | ActionEntry;

type TimelineBlock =
  | Exclude<TimelineEntry, MessageEntry & { kind: 'log' }>
  | {
    entries: MessageEntry[];
    id: string;
    kind: 'log-group';
  };


const localStatusLabels: Record<AgentTimelineLocalMessageStatus, string> = {
  cancelled: '已撤回',
  failed: '发送失败',
  queued: '排队中',
  waiting: '等待回复',
  unconfirmed: '结果待确认',
  accepted: '等待回复',
  sent: '已发送',
  steer: '方向调整',
};

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function displayTime(timestamp: number | null) {
  if (timestamp === null) return null;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}


function messageLabel(kind: MessageEntry['kind']) {
  const labels: Record<MessageEntry['kind'], string> = {
    agent: 'BidVolt',
    error: '执行异常',
    interaction: 'BidVolt 提示',
    log: '运行记录',
    user: '我',
  };
  return labels[kind];
}

export function buildAgentTimelineEntries(
  run: AgentRunViewModel,
  localMessages: readonly AgentTimelineLocalMessage[] = [],
): TimelineEntry[] {
  // Classify the ordered stream as a whole so terminal fragments retain context.
  const entries: TimelineEntry[] = classifyAgentConversation(run.conversation).map((message) => ({
    ...message,
    label: messageLabel(message.kind),
    timestamp: null,
  }));

  // Stream records and local messages must share one ordering axis. A local
  // message belongs *after* its submission boundary, not after every SSE record.
  // Legacy action_list has no event time/sequence: anchor that existing task
  // footer before the earliest post-task local submission, not after new replies.
  type Position = { anchor: number; phase: number; timestamp: number | null; index: number };
  const positions = new Map<string, Position>();
  let nextIndex = 0;
  const position = (entry: TimelineEntry, anchor: number, phase: number) => {
    positions.set(entry.id, { anchor, phase, timestamp: entry.timestamp, index: nextIndex++ });
  };
  entries.forEach((entry) => position(entry, entry.sequence ?? 0, 0));
  const latestSequence = Math.max(0, ...run.conversation.map((message) => message.seq));
  const localBoundaries = localMessages.filter((message) => message.role !== 'agent'
    && typeof message.afterSequence === 'number' && Number.isFinite(message.afterSequence))
    .map((message) => message.afterSequence!);
  const legacyBoundary = localBoundaries.length ? Math.min(...localBoundaries) : latestSequence;
  const actionListBoundary = typeof run.actionListAfterSequence === 'number' && Number.isFinite(run.actionListAfterSequence)
    ? run.actionListAfterSequence : legacyBoundary;
  const localEntries = new Map<string, MessageEntry>();

  const claimedEchoes = new Set<string>();
  for (const message of localMessages) {
    if (!message.content.trim()) continue;
    const isAgent = message.role === 'agent';
    const publicContent = isAgent ? publicAgentReply(message.content) : message.content;
    const kind = isAgent ? (publicContent ? 'agent' : 'log') : 'user';
    // Reconcile only fresh echoes, one-to-one: repeating "继续" must not be
    // swallowed by an older user message or acknowledge two new submissions.
    const echo = typeof message.afterSequence === 'number'
      ? entries.find((entry): entry is MessageEntry => (
        'content' in entry && entry.kind === kind
        && entry.sequence !== null && entry.sequence > message.afterSequence!
        && !claimedEchoes.has(entry.id)
        && entry.content.trim() === (isAgent ? publicContent : message.echoContent ?? message.content).trim()
      ))
      : undefined;
    if (echo) {
      claimedEchoes.add(echo.id);
      if (kind === 'user') {
        echo.userStatus = message.status;
        echo.error = message.error;
        echo.notice = message.notice;
      }
      localEntries.set(message.id, echo);
      continue;
    }
    const entry: MessageEntry = {
      content: publicContent || '运行分析（内部详情已隐藏）',
      id: `local-${message.id}`,
      kind,
      label: messageLabel(kind),
      sequence: typeof message.sequence === 'number' && Number.isFinite(message.sequence)
        ? message.sequence
        : null,
      timestamp: parseTimestamp(message.createdAt),
      userStatus: kind === 'user' ? message.status : undefined,
      error: message.error,
      notice: message.notice,
    };
    entries.push(entry);
    localEntries.set(message.id, entry);
    position(entry, entry.sequence ?? (typeof message.afterSequence === 'number' && Number.isFinite(message.afterSequence)
      ? message.afterSequence : latestSequence), entry.sequence === null ? 2 : 0);
  }

  // A later queued submission can share an old boundary with an earlier user
  // whose echo already gained a sequence. Do not move the later user before it.
  let previousUserPosition: Position | undefined;
  for (const message of localMessages) {
    if (message.role === 'agent') continue;
    const user = localEntries.get(message.id);
    if (!user) continue;
    let current = positions.get(user.id)!;
    if (user.sequence === null && previousUserPosition && current.anchor < previousUserPosition.anchor) {
      current = { ...current, anchor: previousUserPosition.anchor, phase: 2 };
      positions.set(user.id, current);
    }
    previousUserPosition = current;
  }

  // HTTP replies may arrive without a user SSE echo, or after the echo has
  // acquired a newer sequence. Keep each reply behind its own user in either case.
  for (const message of localMessages) {
    if (message.role !== 'agent') continue;
    const reply = localEntries.get(message.id);
    const userId = message.replyToMessageId ?? (message.id.endsWith(':reply') ? message.id.slice(0, -6) : null);
    const user = userId ? localEntries.get(userId) : null;
    if (!reply || !user || reply.sequence !== null) continue;
    const userPosition = positions.get(user.id)!;
    const replyPosition = positions.get(reply.id)!;
    positions.set(reply.id, { ...replyPosition, anchor: userPosition.anchor, phase: 2,
      timestamp: reply.timestamp ?? user.timestamp,
      index: Math.max(replyPosition.index, userPosition.index + 0.5) });
  }

  for (const question of run.questions) {
    const entry: InteractionEntry = {
      id: `interaction-${question.askId}`,
      kind: 'question',
      question: { ...question, items: question.items.map((item) => ({ ...item,
        question: publicAgentReply(item.question) || 'BidVolt 请求补充信息。',
        need: publicAgentReply(item.need), checked: publicAgentReply(item.checked),
      })) },
      sequence: null,
      timestamp: parseTimestamp(question.createdAt),
    };
    entries.push(entry);
    // Question timestamps are available even though their SSE sequence is not.
    const precedingLocal = [...localEntries.values()].filter((local) => local.kind === 'user'
      && local.timestamp !== null && entry.timestamp !== null && local.timestamp <= entry.timestamp)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
    position(entry, precedingLocal ? positions.get(precedingLocal.id)!.anchor : legacyBoundary,
      precedingLocal ? 3 : 1);
  }

  if (run.actionList.length > 0) {
    const entry: ActionEntry = {
      actions: [...new Set(run.actionList.map(publicAgentReply).filter(Boolean))],
      id: 'action-list',
      kind: 'actions',
      sequence: null,
      timestamp: null,
    };
    if (entry.actions.length) {
      entries.push(entry);
      position(entry, actionListBoundary, 1);
    }
  }

  if (run.errorMessage?.trim()) {
    const duplicateError = entries.some((entry) => (
      'content' in entry
      && entry.kind === 'error'
      && entry.content.trim() === run.errorMessage?.trim()
    ));
    if (!duplicateError) {
      const entry: MessageEntry = {
        content: publicAgentReply(run.errorMessage) || '执行异常，内部运行详情已隐藏。',
        id: 'run-error',
        kind: 'error',
        label: '执行异常',
        sequence: null,
        timestamp: null,
      };
      entries.push(entry);
      position(entry, legacyBoundary, 1);
    }
  }

  return entries.sort((left, right) => {
    const a = positions.get(left.id)!;
    const b = positions.get(right.id)!;
    return a.anchor - b.anchor || a.phase - b.phase
      || (a.timestamp !== null && b.timestamp !== null ? a.timestamp - b.timestamp : 0)
      || a.index - b.index;
  });
}

export function groupAgentTimelineLogs(entries: readonly TimelineEntry[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let pendingLogs: MessageEntry[] = [];

  const flushLogs = () => {
    if (pendingLogs.length === 0) return;
    // Filter private placeholders once, before grouping reaches the renderer.
    // Counts, category summaries and expanded rows then share the same records;
    // a private-only segment never becomes an empty, misleading disclosure.
    const visibleEntries = pendingLogs.filter((entry) => entry.content.trim()
      && !/^(?:系统记录|运行分析|工具调用|任务调度|命令与执行)（内部详情已隐藏）$/.test(entry.content.trim()));
    if (visibleEntries.length > 0) {
      blocks.push({
        entries: visibleEntries,
        // Keep the original segment key even when its first entry is hidden,
        // so streamed content updates preserve the user's disclosure choice.
        id: `logs-${pendingLogs[0].id}`,
        kind: 'log-group',
      });
    }
    pendingLogs = [];
  };

  for (const entry of entries) {
    if (entry.kind === 'log') {
      pendingLogs.push(entry);
      continue;
    }
    flushLogs();
    blocks.push(entry);
  }
  flushLogs();
  return blocks;
}

function coalesceAgentMessages(entries: readonly TimelineEntry[]): TimelineEntry[] {
  const merged: TimelineEntry[] = [];
  for (const entry of entries) {
    const previous = merged.at(-1);
    if (entry.kind === 'agent' && previous?.kind === 'agent'
      && entry.sequence !== null && previous.sequence !== null
      && entry.sequence === previous.sequence + 1) {
      merged[merged.length - 1] = {
        ...previous,
        content: joinStreamFragments(previous.content, entry.content),
        id: `${previous.id}-${entry.id}`,
        sequence: entry.sequence,
      };
    } else {
      merged.push(entry);
    }
  }
  return merged;
}

function joinStreamFragments(previous: string, next: string) {
  if (!previous || !next || /\s$/.test(previous) || /^\s/.test(next)) return `${previous}${next}`;
  if (/^[,.;:!?，。；：！？)\]}]/.test(next)) return `${previous}${next}`;
  if (/^(?:#{1,6}\s|[-*+]\s|>\s|```|\d+[.)]\s)/.test(next)) return `${previous}\n\n${next}`;
  if (/[。！？!?；;.]$/.test(previous)) return `${previous}\n\n${next}`;
  return `${previous}${next}`;
}

function MessageBlock({ entry }: { entry: MessageEntry }) {
  return (
    <article
      className="agent-timeline-message"
      data-kind={entry.kind}
      role={entry.kind === 'error' ? 'alert' : undefined}
    >
      <header>
        <span className="agent-timeline-message__author">
          {entry.label}
        </span>
        {entry.userStatus ? (
          <span className="agent-timeline-message__status" data-status={entry.userStatus}>
            {localStatusLabels[entry.userStatus]}
          </span>
        ) : null}
      </header>
      <MarkdownContent className="agent-timeline-message__content" content={entry.content} />
      {entry.notice ? (
        <p className="agent-timeline-message__delivery-note" role={entry.userStatus === 'failed' ? 'alert' : 'status'}>
          {entry.notice}
        </p>
      ) : null}
      {entry.error ? (
        <details className="agent-timeline-message__delivery-detail">
          <summary>查看详情</summary>
          <p>{publicAgentReply(entry.error) || '内部运行详情已隐藏。'}</p>
        </details>
      ) : null}
    </article>
  );
}

function LogGroup({ entries }: { entries: MessageEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const typeCounts = entries.reduce((counts, entry) => {
    const label = summarizeRuntimeLog(entry.content);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const summary = [...typeCounts].map(([label, count]) => `${label} ${count}`).join(' · ');

  return (
    <article aria-label={`运行记录，共 ${entries.length} 条`} className="agent-timeline-logs" data-expanded={expanded ? 'true' : 'false'}>
      <header>
        <span className="agent-timeline-logs__label">
          <Clock3 aria-hidden="true" size={14} />
          运行记录
          <small>· {entries.length} 条</small>
        </span>
        <span className="agent-timeline-logs__summary" title={summary}>{summary}</span>
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? <ChevronUp aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />}
          {expanded ? '收起' : '展开全部'}
        </button>
      </header>
      <div hidden={!expanded} id={contentId}>
        {expanded ? (
          <ol aria-label="运行摘要">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p>{entry.content}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </article>
  );
}

function InteractionCard({
  answering,
  now,
  onAnswer,
  question,
}: {
  answering: boolean;
  now: number;
  onAnswer?: AgentActivityTimelineProps['onAnswerInteraction'];
  question: AgentQuestion;
}) {
  const [answers, setAnswers] = useState(() => question.items.map((_, index) => (
    question.answer?.[index] ?? ''
  )));
  const [feedback, setFeedback] = useState('');
  const [localError, setLocalError] = useState('');
  const windowState = getAgentQuestionWindow(question, now);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedAnswers = answers.map((answer) => answer.trim());
    if (!normalizedAnswers.some(Boolean)) {
      setLocalError('请至少填写一项回复。');
      return;
    }
    setLocalError('');
    try {
      const result = await onAnswer?.(question.askId, normalizedAnswers);
      const reply = result?.reply ? publicAgentReply(result.reply) : '';
      setFeedback(reply
        ? `BidVolt 回复：${reply}`
        : result?.queued === false
          ? '回复已处理。'
          : '回复已提交，等待 BidVolt 处理。');
    } catch (error) {
      setLocalError(error instanceof Error && error.message
        ? publicAgentReply(error.message) || '回复提交失败，内部运行详情已隐藏。'
        : '回复提交失败，请重试。');
    }
  };

  return (
    <article className="agent-timeline-interaction" data-resolved={question.answered ? 'true' : 'false'}>
      <header>
        <span>
          <CircleHelp aria-hidden="true" size={16} />
          {question.answered ? '已处理的 BidVolt 内容' : '需要你处理'}
        </span>
        <span>{question.answered ? '已处理' : windowState.label}</span>
      </header>
      {displayTime(parseTimestamp(question.createdAt)) ? (
        <time dateTime={question.createdAt ?? undefined}>{displayTime(parseTimestamp(question.createdAt))}</time>
      ) : null}
      <ol>
        {question.items.map((item, index) => (
          <li key={`${question.askId}-${index}`}>
            <strong>{item.question}</strong>
            {item.need ? <p>需要说明：{item.need}</p> : null}
            {item.checked ? <p>BidVolt 已核查：{item.checked}</p> : null}
            {question.answered ? <p className="agent-timeline-interaction__answer">我的回复：{question.answer?.[index] || '未填写'}</p> : null}
          </li>
        ))}
      </ol>

      {!question.answered && question.legacy ? (
        <p className="agent-timeline-interaction__notice">该历史内容没有可提交编号，请通过底部输入框回复。</p>
      ) : null}

      {!question.answered && !question.legacy && onAnswer ? (
        <form onSubmit={(event) => void submit(event)}>
          {question.items.map((item, index) => (
            <label key={`${question.askId}-answer-${index}`}>
              <span>回复第 {index + 1} 项</span>
              <textarea
                aria-label={`回复：${item.question}`}
                disabled={answering}
                onChange={(event) => {
                  const nextAnswers = [...answers];
                  nextAnswers[index] = event.target.value;
                  setAnswers(nextAnswers);
                }}
                rows={2}
                value={answers[index]}
              />
            </label>
          ))}
          {localError ? <p className="agent-timeline-interaction__error" role="alert">{localError}</p> : null}
          {feedback ? <p className="agent-timeline-interaction__feedback" role="status">{feedback}</p> : null}
          <button disabled={answering} type="submit">
            <Send aria-hidden="true" size={14} />
            {answering ? '正在提交' : windowState.state === 'expired' ? '补充回复并继续' : '确认回复并继续'}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function ActionCard({ actions }: { actions: string[] }) {
  return (
    <article className="agent-timeline-actions">
      <header>
        <ListChecks aria-hidden="true" size={16} />
        BidVolt 提示
      </header>
      <ul>{actions.map((action, index) => (
        <li key={`${index}-${action}`}><MarkdownContent content={action} /></li>
      ))}</ul>
    </article>
  );
}

export function AgentActivityTimeline({
  answeringAskId = null,
  compact = false,
  localMessages = [],
  now = Date.now(),
  onAnswerInteraction,
  run,
}: AgentActivityTimelineProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const initialScrollRef = useRef(false);
  const scrollTaskIdRef = useRef(run.taskId);
  if (scrollTaskIdRef.current !== run.taskId) {
    scrollTaskIdRef.current = run.taskId;
    initialScrollRef.current = false;
  }
  const blocks = useMemo(
    () => groupAgentTimelineLogs(coalesceAgentMessages(
      buildAgentTimelineEntries(run, localMessages),
    )),
    [localMessages, run],
  );
  const openInteractionCount = run.questions.filter((question) => !question.answered).length;

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const context = stream.closest<HTMLElement>('.project-result-workspace__context');
    const completionTimeline = context?.dataset.layout === 'completion-summary'
      ? stream.closest<HTMLElement>('.agent-activity-timeline')
      : null;
    const scrollContainer = completionTimeline
      ?? stream.closest<HTMLElement>('.project-result-workspace__activity')
      ?? stream;
    const distanceFromBottom = scrollContainer.scrollHeight
      - scrollContainer.scrollTop
      - scrollContainer.clientHeight;
    const shouldKeepLatestVisible = !initialScrollRef.current || distanceFromBottom < 96;
    if (!shouldKeepLatestVisible) return;

    // The completion dashboard and preview panes can change the grid height in
    // the two frames immediately after this component commits. Scroll once
    // now, then again while that layout settles so a freshly opened task shows
    // the newest conversation instead of the oldest runtime record.
    const scrollToLatest = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };
    scrollToLatest();
    initialScrollRef.current = true;

    if (typeof window.requestAnimationFrame !== 'function') return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToLatest();
      secondFrame = window.requestAnimationFrame(scrollToLatest);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [
    blocks.length,
    run.conversation.length,
    run.conversation.at(-1)?.content,
    run.conversation.at(-1)?.seq,
    run.taskId,
  ]);

  return (
    <section
      aria-label="任务动态"
      className="agent-activity-timeline"
      data-compact={compact ? 'true' : 'false'}
    >
      {openInteractionCount > 0 ? (
        <div className="agent-activity-timeline__attention" role="status">
          <CircleHelp aria-hidden="true" size={15} />
          有 {openInteractionCount} 项内容需要处理
        </div>
      ) : null}

      <div className="agent-activity-timeline__stream" ref={streamRef}>
        {blocks.length === 0 ? (
          <p className="agent-activity-timeline__empty">暂无任务动态，新的 BidVolt 内容将在这里显示。</p>
        ) : blocks.map((block) => {
          if (block.kind === 'log-group') {
            return <LogGroup entries={block.entries} key={block.id} />;
          }
          if (block.kind === 'question') {
            return (
              <InteractionCard
                answering={answeringAskId === block.question.askId}
                key={block.id}
                now={now}
                onAnswer={onAnswerInteraction}
                question={block.question}
              />
            );
          }
          if (block.kind === 'actions') {
            return <ActionCard actions={block.actions} key={block.id} />;
          }
          return <MessageBlock entry={block} key={block.id} />;
        })}
      </div>
    </section>
  );
}
