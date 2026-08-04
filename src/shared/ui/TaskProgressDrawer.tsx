import { useEffect, useRef } from 'react';
import { Check, Clock3, FileCheck2, LoaderCircle, X } from 'lucide-react';

export type PublicTaskEvent = {
  phase: 'queued' | 'parsing' | 'drafting' | 'checking';
  progress: number;
  publicMessage: string;
  status: 'completed' | 'running' | 'waiting';
  timestamp: string;
};

const publicEvents: PublicTaskEvent[] = [
  {
    phase: 'checking',
    progress: 72,
    publicMessage: '正在核验技术方案中的引用位置',
    status: 'running',
    timestamp: '刚刚',
  },
  {
    phase: 'drafting',
    progress: 64,
    publicMessage: '技术方案初稿已生成，可继续编辑',
    status: 'completed',
    timestamp: '14:32',
  },
  {
    phase: 'parsing',
    progress: 38,
    publicMessage: '已整理 86 条招标需求并完成来源定位',
    status: 'completed',
    timestamp: '14:27',
  },
  {
    phase: 'queued',
    progress: 8,
    publicMessage: '项目材料已进入本次工作台处理队列',
    status: 'completed',
    timestamp: '14:20',
  },
];

type TaskProgressDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

function StatusIcon({ status }: { status: PublicTaskEvent['status'] }) {
  if (status === 'completed') {
    return <Check aria-hidden="true" size={15} />;
  }

  if (status === 'running') {
    return <LoaderCircle aria-hidden="true" className="spin" size={15} />;
  }

  return <Clock3 aria-hidden="true" size={15} />;
}

export function TaskProgressDrawer({ isOpen, onClose }: TaskProgressDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

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
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
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

        <section className="active-task-card" aria-labelledby="active-task-title">
          <div className="active-task-card__heading">
            <span className="active-task-card__icon" aria-hidden="true">
              <FileCheck2 size={19} />
            </span>
            <div>
              <span>海上平台电气设备采购项目</span>
              <h3 id="active-task-title">技术方案检查</h3>
            </div>
            <strong>72%</strong>
          </div>
          <div
            className="progress-track progress-track--large"
            role="progressbar"
            aria-label="技术方案检查进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={72}
          >
            <span style={{ width: '72%' }} />
          </div>
          <p>当前只展示阶段、状态和可公开说明，处理完成后会自动保留结果版本。</p>
        </section>

        <section className="event-stream" aria-labelledby="event-stream-title" aria-live="polite">
          <div className="event-stream__heading">
            <h3 id="event-stream-title">最新动态</h3>
            <span>自动更新</span>
          </div>
          <ol>
            {publicEvents.map((event) => (
              <li key={`${event.phase}-${event.timestamp}`}>
                <span className={`event-status event-status--${event.status}`}>
                  <StatusIcon status={event.status} />
                </span>
                <div>
                  <p>{event.publicMessage}</p>
                  <small>{event.timestamp}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="task-drawer__footer">
          <p>
            <span aria-hidden="true" />
            这里只展示可公开的任务状态，详细处理信息保留在系统审计中。
          </p>
        </footer>
      </aside>
    </div>
  );
}
