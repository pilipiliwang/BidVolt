import { useEffect, useRef } from 'react';
import { Check, CircleHelp, Clock3, LoaderCircle, X } from 'lucide-react';

import type { PublicTaskEvent } from '../task-events';
import type { AgentRunViewModel } from '../task-events';
import {
  AgentRunPanel,
  type AgentAnswerResult,
  type AgentChatMode,
  type AgentChatResult,
} from './AgentRunPanel';

type TaskProgressDrawerProps = {
  agentRun?: AgentRunViewModel;
  answeringAskId?: string | null;
  downloadingPackage?: boolean;
  isOpen: boolean;
  onAnswerQuestion?: (
    askId: string,
    answers: string[],
  ) => AgentAnswerResult | Promise<AgentAnswerResult | void> | void;
  onClose: () => void;
  onDownloadResponsePackage?: () => Promise<void> | void;
  onResumeAgentRun?: (taskId: string) => Promise<void> | void;
  onSendAgentMessage?: (
    message: string,
    mode: AgentChatMode,
  ) => AgentChatResult | Promise<AgentChatResult | void> | void;
  events: PublicTaskEvent[];
  resumingAgentRun?: boolean;
  sendingAgentMessage?: boolean;
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  );
}

function StatusIcon({ status }: { status: PublicTaskEvent['status'] }) {
  if (status === 'succeeded') {
    return <Check aria-hidden="true" size={15} />;
  }

  if (status === 'running' || status === 'retrying' || status === 'cancel_requested') {
    return <LoaderCircle aria-hidden="true" className="spin" size={15} />;
  }

  if (status === 'unknown') {
    return <CircleHelp aria-hidden="true" size={15} />;
  }

  return <Clock3 aria-hidden="true" size={15} />;
}

function statusClass(status: PublicTaskEvent['status']) {
  if (status === 'succeeded') return 'completed';
  if (status === 'running' || status === 'retrying' || status === 'cancel_requested') {
    return 'running';
  }
  if (status === 'unknown') return 'unknown';
  return 'waiting';
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    bid_generate: '成果生成',
    bid_review: '成果校核',
    agent_pipeline: 'Agent 成果生成',
    tender_parse: '招标材料解析',
  };
  return labels[phase] ?? phase;
}

export function TaskProgressDrawer({
  agentRun,
  answeringAskId,
  downloadingPackage,
  isOpen,
  onAnswerQuestion,
  onClose,
  onDownloadResponsePackage,
  onResumeAgentRun,
  onSendAgentMessage,
  events,
  resumingAgentRun,
  sendingAgentMessage,
}: TaskProgressDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1)!;
      const activeElement = document.activeElement;
      const focusIsOutsideDialog = !dialogRef.current.contains(activeElement);

      if (event.shiftKey && (activeElement === firstElement || focusIsOutsideDialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || focusIsOutsideDialog)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        type="button"
        aria-label="关闭任务进度"
        onClick={onClose}
      />
      <aside
        ref={dialogRef}
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
        tabIndex={-1}
      >
        <header className="task-drawer__header">
          <div>
            <span className="eyebrow">公开进度</span>
            <h2 id="task-drawer-title">任务进度</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label="关闭任务进度"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {agentRun ? (
          <AgentRunPanel
            answeringAskId={answeringAskId}
            downloadingPackage={downloadingPackage}
            onAnswerQuestion={onAnswerQuestion}
            onDownloadResponsePackage={onDownloadResponsePackage}
            onResume={onResumeAgentRun}
            onSendMessage={onSendAgentMessage}
            resuming={resumingAgentRun}
            run={agentRun}
            sendingMessage={sendingAgentMessage}
          />
        ) : (
          <section className="event-stream" aria-labelledby="event-stream-title" aria-live="polite">
          <div className="event-stream__heading">
            <h3 id="event-stream-title">任务当前状态</h3>
            <span>自动更新</span>
          </div>
          {events.length === 0 ? (
            <p role="status">暂无公开进度，任务开始后将在这里显示。</p>
          ) : (
            <ol>
              {events.map((event) => (
                <li key={event.event_id}>
                  <span className={`event-status event-status--${statusClass(event.status)}`}>
                    <StatusIcon status={event.status} />
                  </span>
                  <div>
                    <strong>{phaseLabel(event.phase)}</strong>
                    <p>{event.public_message}</p>
                    <small>
                      {event.percent === null ? '进度待更新' : `${event.percent}%`}
                      {' · '}
                      {event.occurred_at === '时间未提供'
                        ? <span>时间未提供</span>
                        : <time dateTime={event.occurred_at}>{event.occurred_at}</time>}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          )}
          </section>
        )}

        <footer className="task-drawer__footer">
          <p>
            <span aria-hidden="true" />
            {agentRun
              ? '实时会话展示主会话公开消息；完整记录将随最终响应文件包交付。'
              : '每一行代表一个独立任务的最新状态，不是同一任务的多段执行日志。'}
          </p>
        </footer>
      </aside>
    </div>
  );
}
