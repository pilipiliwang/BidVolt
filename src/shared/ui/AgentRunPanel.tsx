import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  MessageSquareText,
  Send,
} from 'lucide-react';

import {
  getAgentQuestionWindow,
  type AgentQuestion,
  type AgentRunCompletion,
  type AgentRunViewModel,
} from '../task-events';
import './AgentRunPanel.css';

export type AgentChatMode = 'queue' | 'steer';
export type AgentAnswerResult = { queued?: boolean; reply?: string | null };
export type AgentChatResult = { message?: string; queued?: boolean; reply?: string | null };

export type AgentRunPanelProps = {
  answeringAskId?: string | null;
  downloadingPackage?: boolean;
  now?: number;
  onAnswerQuestion?: (
    askId: string,
    answers: string[],
  ) => AgentAnswerResult | Promise<AgentAnswerResult | void> | void;
  onDownloadResponsePackage?: () => Promise<void> | void;
  onResume?: (taskId: string) => Promise<void> | void;
  onSendMessage?: (
    message: string,
    mode: AgentChatMode,
  ) => AgentChatResult | Promise<AgentChatResult | void> | void;
  resuming?: boolean;
  run: AgentRunViewModel;
  sendingMessage?: boolean;
};

const completionContent: Record<AgentRunCompletion, { description: string; title: string }> = {
  active: {
    title: '成果生成正在执行',
    description: '系统正在依据当前项目材料推进成果编制，进度与当前工作由主会话实时返回。',
  },
  complete: {
    title: '成果生成已完成',
    description: '主会话已确认全部验收门通过，可以下载最终响应文件包。',
  },
  incomplete: {
    title: '成果尚未完全闭环',
    description: '主会话已如实结束本次执行，但仍存在需要补齐或确认的事项。',
  },
  failed: {
    title: '成果生成失败',
    description: '本次主会话未完成，请查看公开错误信息后决定是否续跑。',
  },
  cancelled: {
    title: '成果生成已取消',
    description: '本次主会话已经停止，不会继续生成成果。',
  },
  unknown_terminal: {
    title: '任务已经结束',
    description: '后端尚未返回完整或未闭环判定，请查看会话记录确认结果。',
  },
};

const streamLabels: Record<AgentRunViewModel['streamState'], string> = {
  connected: '实时会话已连接',
  connecting: '正在连接实时会话',
  ended: '实时会话已结束',
  error: '实时会话连接失败',
  fallback: '实时连接中断，状态轮询中',
  idle: '实时会话尚未连接',
};

const conversationKindLabels: Record<string, string> = {
  error: '错误',
  hermes: '主会话',
  service: '服务消息',
  tool: '工具与委派',
  user: '我的消息',
};

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    agent_pipeline: 'BidVolt 主会话',
    assembly: '成果成文',
    package_response: '响应文件打包',
    question_gate: '资料确认',
  };
  return labels[phase] ?? phase;
}

function CompletionIcon({ completion }: { completion: AgentRunCompletion }) {
  if (completion === 'complete') return <CheckCircle2 aria-hidden="true" size={22} />;
  if (completion === 'incomplete' || completion === 'failed') {
    return <AlertCircle aria-hidden="true" size={22} />;
  }
  return <Clock3 aria-hidden="true" size={22} />;
}

function useQuestionClock(now: number | undefined) {
  const [clock, setClock] = useState(() => now ?? Date.now());
  useEffect(() => {
    if (now !== undefined) {
      setClock(now);
      return undefined;
    }
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [now]);
  return now ?? clock;
}

function AgentQuestionCard({
  answering,
  index,
  now,
  onAnswer,
  question,
  total,
}: {
  answering: boolean;
  index: number;
  now: number;
  onAnswer?: AgentRunPanelProps['onAnswerQuestion'];
  question: AgentQuestion;
  total: number;
}) {
  const [answers, setAnswers] = useState(() => question.items.map((_, itemIndex) => (
    question.answer?.[itemIndex] ?? ''
  )));
  const [localError, setLocalError] = useState('');
  const [submissionMessage, setSubmissionMessage] = useState('');
  const windowState = getAgentQuestionWindow(question, now);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = answers.map((answer) => answer.trim());
    if (!normalized.some(Boolean)) {
      setLocalError('请至少填写一项回答。');
      return;
    }
    setLocalError('');
    try {
      const result = await onAnswer?.(question.askId, normalized);
      setSubmissionMessage(result?.reply
        ? `主会话回复：${result.reply}`
        : result?.queued === false
          ? '回答已提交，主会话已处理。'
          : '回答已回传主会话，正在等待处理。');
    } catch (error) {
      setLocalError(error instanceof Error && error.message ? error.message : '回答提交失败，请重试。');
    }
  };

  return (
    <article className="agent-question" data-window-state={windowState.state}>
      <header>
        <div>
          <strong>主会话提问</strong>
          {total > 1 ? <span>第 {index + 1}/{total} 组</span> : null}
        </div>
        <span className="agent-question__state">
          {question.answered ? '已回答' : windowState.label}
        </span>
      </header>
      <ol>
        {question.items.map((item, itemIndex) => (
          <li key={`${question.askId}-${itemIndex}`}>
            <strong>{item.question}</strong>
            {item.need ? <p>需要原因：{item.need}</p> : null}
            {item.checked ? <p>主会话已自查：{item.checked}</p> : null}
            {question.answered ? (
              <p className="agent-question__answer">
                我的回答：{question.answer?.[itemIndex] || '未填写'}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {!question.answered && question.legacy ? (
        <p className="agent-question__legacy">该历史待处理内容缺少可提交编号，请通过下方输入框回复 BidVolt。</p>
      ) : null}

      {!question.answered && !question.legacy && onAnswer ? (
        <form onSubmit={(event) => void submit(event)}>
          {question.items.map((item, itemIndex) => (
            <label key={`${question.askId}-answer-${itemIndex}`}>
              <span>回答第 {itemIndex + 1} 项</span>
              <textarea
                aria-label={`回答：${item.question}`}
                disabled={answering}
                onChange={(event) => {
                  const next = [...answers];
                  next[itemIndex] = event.target.value;
                  setAnswers(next);
                }}
                rows={2}
                value={answers[itemIndex]}
              />
            </label>
          ))}
          {localError ? <p className="agent-question__error" role="alert">{localError}</p> : null}
          {submissionMessage ? <p className="agent-question__submitted" role="status">{submissionMessage}</p> : null}
          <button disabled={answering} type="submit">
            <Send aria-hidden="true" size={15} />
            {answering ? '正在回传' : windowState.state === 'expired' ? '补答并回传重验' : '提交本组回答'}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function AgentConversation({
  onSendMessage,
  run,
  sendingMessage,
}: Pick<AgentRunPanelProps, 'onSendMessage' | 'run' | 'sendingMessage'>) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<AgentChatMode>('queue');
  const [sendResult, setSendResult] = useState('');
  const visibleMessages = useMemo(() => run.conversation.slice(-200), [run.conversation]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = message.trim();
    if (!normalized || !onSendMessage) return;
    try {
      const result = await onSendMessage(normalized, mode);
      setSendResult(result?.reply
        ? `主会话回复：${result.reply}`
        : result?.message ?? (result?.queued === false ? '主会话已处理这条消息。' : '消息已送达主会话。'));
      setMessage('');
    } catch (error) {
      setSendResult(error instanceof Error && error.message ? error.message : '消息发送失败，请重试。');
    }
  };

  return (
    <section className="agent-conversation" aria-labelledby="agent-conversation-title">
      <header>
        <div>
          <MessageSquareText aria-hidden="true" size={18} />
          <h3 id="agent-conversation-title">主会话动态</h3>
        </div>
        <span data-stream-state={run.streamState}>{streamLabels[run.streamState]}</span>
      </header>
      {run.conversation.length > visibleMessages.length ? (
        <p className="agent-conversation__limit">仅展示最近 {visibleMessages.length} 条；完整记录随成果包交付。</p>
      ) : null}
      <ol aria-label="BidVolt 主会话实时消息">
        {visibleMessages.length === 0 ? (
          <li className="agent-conversation__empty">暂无会话消息，连接后将在这里实时显示。</li>
        ) : visibleMessages.map((item) => (
          <li data-kind={item.kind} key={item.seq}>
            <span>{conversationKindLabels[item.kind] ?? item.kind}</span>
            <p>{item.content}</p>
          </li>
        ))}
      </ol>
      {onSendMessage ? (
        <form className="agent-conversation__composer" onSubmit={(event) => void submit(event)}>
          <label>
            <span className="sr-only">发送给主会话的消息</span>
            <textarea
              disabled={sendingMessage}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="补充要求或询问当前进展"
              rows={3}
              value={message}
            />
          </label>
          <div>
            <label>
              <span>发送方式</span>
              <select
                aria-label="发送方式"
                disabled={sendingMessage}
                onChange={(event) => setMode(event.target.value as AgentChatMode)}
                value={mode}
              >
                <option value="queue">排队发送</option>
                <option value="steer">下一步调整方向</option>
              </select>
            </label>
            <button disabled={sendingMessage || !message.trim()} type="submit">
              <Send aria-hidden="true" size={15} />
              {sendingMessage ? '正在发送' : '发送'}
            </button>
          </div>
          {sendResult ? <p className="agent-conversation__send-result" role="status">{sendResult}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

export function AgentRunPanel({
  answeringAskId,
  downloadingPackage = false,
  now,
  onAnswerQuestion,
  onDownloadResponsePackage,
  onResume,
  onSendMessage,
  resuming = false,
  run,
  sendingMessage = false,
}: AgentRunPanelProps) {
  const clock = useQuestionClock(now);
  const content = completionContent[run.completion];
  const canDownload = run.status === 'succeeded'
    && (run.completion === 'complete'
      || run.completion === 'incomplete'
      || run.completion === 'unknown_terminal');
  const canResume = Boolean(run.sessionId)
    && (run.completion === 'incomplete' || run.status === 'failed_retryable');

  return (
    <div className="agent-run-panel" data-completion={run.completion}>
      <section className="agent-run-summary" aria-labelledby="agent-run-summary-title">
        <div className="agent-run-summary__icon">
          <CompletionIcon completion={run.completion} />
        </div>
        <div className="agent-run-summary__body">
          <span>{phaseLabel(run.phase)}</span>
          <h3 id="agent-run-summary-title">{content.title}</h3>
          <p>{content.description}</p>
          <strong>{run.message}</strong>
          {run.reason && run.completion === 'incomplete' ? (
            <p className="agent-run-summary__reason">未闭环原因：{run.reason}</p>
          ) : null}
          {run.errorMessage ? (
            <p className="agent-run-summary__error" role="alert">{run.errorMessage}</p>
          ) : null}
          {run.percent === null ? (
            <span className="agent-run-summary__pending-percent">进度待后端更新</span>
          ) : (
            <div className="agent-run-summary__progress-row">
              <div
                aria-label="BidVolt 成果生成进度"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={run.percent}
                aria-valuetext={`${run.percent}% · ${run.message}`}
                className="agent-run-summary__progress"
                role="progressbar"
              >
                <span style={{ width: `${run.percent}%` }} />
              </div>
              <strong>{run.percent}%</strong>
            </div>
          )}
          {canDownload && onDownloadResponsePackage ? (
            <button
              className="agent-run-summary__download"
              disabled={downloadingPackage}
              onClick={() => {
                void Promise.resolve().then(() => onDownloadResponsePackage()).catch(() => {
                  // App owns download feedback. Consume the DOM event's promise
                  // rejection without replacing that feedback with fake success.
                });
              }}
              type="button"
            >
              <Download aria-hidden="true" size={16} />
              {downloadingPackage ? '正在下载' : '下载最终响应文件包'}
            </button>
          ) : null}
          {canResume && onResume ? (
            <button
              className="agent-run-summary__resume"
              disabled={resuming}
              onClick={() => void onResume(run.taskId)}
              type="button"
            >
              {resuming ? '正在继续处理' : '继续处理未闭环事项'}
            </button>
          ) : null}
        </div>
      </section>

      {run.questions.length > 0 ? (
        <section className="agent-questions" aria-labelledby="agent-questions-title">
          <header>
            <h3 id="agent-questions-title">待确认问题</h3>
            <span>{run.questions.filter((item) => !item.answered).length} 组待回答</span>
          </header>
          <div>
            {run.questions.map((question, index) => (
              <AgentQuestionCard
                answering={answeringAskId === question.askId}
                index={index}
                key={question.askId}
                now={clock}
                onAnswer={onAnswerQuestion}
                question={question}
                total={run.questions.length}
              />
            ))}
          </div>
        </section>
      ) : null}

      {run.actionList.length > 0 ? (
        <section className="agent-actions" aria-labelledby="agent-actions-title">
          <h3 id="agent-actions-title">提交前需要人工完成</h3>
          <ul>{run.actionList.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ul>
        </section>
      ) : null}

      <AgentConversation
        onSendMessage={onSendMessage}
        run={run}
        sendingMessage={sendingMessage}
      />
    </div>
  );
}
