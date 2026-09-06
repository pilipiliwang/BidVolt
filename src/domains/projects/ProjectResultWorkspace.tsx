import {
  AlertTriangle,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  Clock3,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import type { AgentRunViewModel } from '../../shared/task-events';
import type { ProjectWorkflowTaskSummary } from './ProjectWorkflow';
import './project-result-workspace.css';

export type ProjectResultWorkspaceProps = {
  activity: ReactNode;
  composer: ReactNode;
  fileCount?: number;
  fileWorkspace?: ReactNode;
  rail: ReactNode;
  resultsReady?: boolean;
  summary?: ReactNode | ((status: ReactNode) => ReactNode);
  run?: AgentRunViewModel;
  task?: ProjectWorkflowTaskSummary;
};

type ResultWorkspaceState = 'complete' | 'failed' | 'finalizing' | 'running' | 'sync-error' | 'waiting';

const COLLAPSED_PANEL_WIDTH = 36;
const DOCUMENT_MIN_WIDTH = 560;
const PANEL_GUTTER_WIDTH = 24;
const RAIL_MIN_WIDTH = 250;
const RAIL_MAX_WIDTH = 640;
const CONTEXT_MIN_WIDTH = 440;
const CONTEXT_MAX_WIDTH = 900;

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function displayPhase(value: string | null | undefined) {
  const phase = value?.trim();
  if (!phase) return '标书制作/审核';
  return ({
    agent_pipeline: 'BidVolt 成果生成',
    bid_generate: '成果编制',
    bid_review: '成果校核',
    tender_parse: '材料解析',
  } as Record<string, string>)[phase] ?? phase;
}

function resolveWorkspaceState(
  run: AgentRunViewModel | undefined,
  task: ProjectWorkflowTaskSummary | undefined,
  resultsReady: boolean,
): ResultWorkspaceState {
  if (run?.questions.some((interaction) => !interaction.answered) || task?.status === 'waiting_user') {
    return 'waiting';
  }
  if (task?.status === 'sync_error') return 'sync-error';
  if (run?.completion === 'complete') return resultsReady ? 'complete' : 'finalizing';
  if (run?.completion === 'failed' || run?.completion === 'cancelled'
    || run?.completion === 'incomplete' || task?.status === 'failed') return 'failed';
  if (task?.status === 'succeeded') return resultsReady ? 'complete' : 'finalizing';
  if (run?.completion === 'unknown_terminal') return 'finalizing';
  return 'running';
}

const stateContent: Record<ResultWorkspaceState, { description: string; label: string; title: string }> = {
  complete: {
    description: '标书成果已经生成，可预览成果文件并继续与 BidVolt 协作优化。',
    label: '已完成',
    title: '成果生成已完成',
  },
  failed: {
    description: '本次任务没有完整生成成果，请根据公开任务信息处理后重试。',
    label: '未完成',
    title: '成果生成未完成',
  },
  finalizing: {
    description: '生成任务已经结束，正在等待后端同步可预览的成果文件。',
    label: '同步成果',
    title: '正在整理标书成果',
  },
  running: {
    description: '系统正在根据当前项目材料推进成果编制，进度与当前工作由后端实时返回。',
    label: '执行中',
    title: '成果生成正在执行',
  },
  'sync-error': {
    description: '生成任务已结束，但后端尚未返回可预览的成果版本。',
    label: '同步异常',
    title: '成果版本同步异常',
  },
  waiting: {
    description: 'BidVolt 有内容需要您处理；回复后将继续执行，已有任务动态不会丢失。',
    label: '需要处理',
    title: '成果生成需要您的处理',
  },
};

function StatusIcon({ state }: { state: ResultWorkspaceState }) {
  if (state === 'complete') return <CheckCircle2 aria-hidden="true" size={30} />;
  if (state === 'failed' || state === 'sync-error') return <AlertTriangle aria-hidden="true" size={30} />;
  if (state === 'waiting') return <Clock3 aria-hidden="true" size={30} />;
  return <LoaderCircle aria-hidden="true" size={30} />;
}

export function ProjectResultWorkspace({
  activity,
  composer,
  fileCount = 0,
  fileWorkspace,
  rail,
  resultsReady = false,
  summary,
  run,
  task,
}: ProjectResultWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [railWidth, setRailWidth] = useState(280);
  const [contextWidth, setContextWidth] = useState(480);
  const previewOpen = Boolean(fileWorkspace);
  const state = resolveWorkspaceState(run, task, resultsReady);
  const content = stateContent[state];
  const percent = normalizePercent(run?.percent ?? task?.percent);
  const currentWork = run?.message?.trim() || task?.message?.trim() || content.description;
  const phase = displayPhase(run?.phase || task?.title);
  const openInteractionCount = run?.questions.filter((interaction) => !interaction.answered).length ?? 0;
  const integratedSummary = typeof summary === 'function';
  const layoutClass = [
    'project-result-workspace',
    previewOpen ? 'project-result-workspace--preview' : '',
    railCollapsed ? 'project-result-workspace--rail-collapsed' : '',
    previewOpen && contextCollapsed ? 'project-result-workspace--context-collapsed' : '',
    summaryCollapsed ? 'project-result-workspace--summary-collapsed' : '',
    integratedSummary ? 'project-result-workspace--integrated-summary' : '',
  ].filter(Boolean).join(' ');
  const layoutStyle = {
    '--result-context-width': `${contextWidth}px`,
    '--result-rail-width': `${railWidth}px`,
  } as CSSProperties;
  const statusDescription = useMemo(
    () => currentWork === content.description ? currentWork : `${content.description} ${currentWork}`,
    [content.description, currentWork],
  );

  useEffect(() => {
    if (!previewOpen) setContextCollapsed(false);
  }, [previewOpen]);

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    side: 'context' | 'rail',
  ) => {
    if (!previewOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'rail' ? railWidth : contextWidth;
    const owner = event.currentTarget;
    owner.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const workspaceWidth = workspaceRef.current?.clientWidth ?? window.innerWidth;
      const delta = moveEvent.clientX - startX;
      const requested = side === 'rail' ? startWidth + delta : startWidth - delta;
      const otherPanelWidth = side === 'rail'
        ? (contextCollapsed ? COLLAPSED_PANEL_WIDTH : contextWidth)
        : (railCollapsed ? COLLAPSED_PANEL_WIDTH : railWidth);
      const availableWidth = workspaceWidth
        - otherPanelWidth
        - DOCUMENT_MIN_WIDTH
        - PANEL_GUTTER_WIDTH;
      const minimum = side === 'rail' ? RAIL_MIN_WIDTH : CONTEXT_MIN_WIDTH;
      const maximum = side === 'rail' ? RAIL_MAX_WIDTH : CONTEXT_MAX_WIDTH;
      const upperBound = Math.min(maximum, Math.max(minimum, availableWidth));
      const next = Math.round(Math.max(minimum, Math.min(upperBound, requested)));
      if (side === 'rail') setRailWidth(next);
      else setContextWidth(next);
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      document.body.classList.remove('project-result-workspace-is-resizing');
    };
    document.body.classList.add('project-result-workspace-is-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const statusHeader = (
    <header className="project-result-workspace__status" role="status">
      <span className="project-result-workspace__status-icon"><StatusIcon state={state} /></span>
      <div className="project-result-workspace__status-copy" title={statusDescription}>
        <h1>{content.title}</h1>
        <p title={statusDescription}>{statusDescription}</p>
      </div>
      <strong className="project-result-workspace__percent">
        {percent === null ? '进度待更新' : `${percent}%`}
      </strong>
      {percent !== null ? (
        <div
          aria-label="成果生成进度"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="project-result-workspace__progress"
          role="progressbar"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <dl className="project-result-workspace__facts">
        <div><dt>当前阶段</dt><dd>{phase}</dd></div>
        <div><dt>执行状态</dt><dd>{content.label}</dd></div>
        <div><dt>成果文件</dt><dd>{fileCount > 0 ? `${fileCount} 份` : '待同步'}</dd></div>
      </dl>
    </header>
  );

  return (
    <div
      className={layoutClass}
      data-result-state={state}
      ref={workspaceRef}
      style={layoutStyle}
    >
      <div className="project-result-workspace__rail">
        <div className="project-result-workspace__rail-content">{rail}</div>
        <button
          aria-expanded={!railCollapsed}
          aria-label={railCollapsed ? '展开资料目录' : '收起资料目录'}
          className="project-result-workspace__panel-toggle project-result-workspace__panel-toggle--rail"
          onClick={() => setRailCollapsed((value) => !value)}
          title={railCollapsed ? '展开资料目录' : '收起资料目录'}
          type="button"
        >
          {railCollapsed
            ? <PanelLeftOpen aria-hidden="true" size={19} />
            : <PanelLeftClose aria-hidden="true" size={18} />}
        </button>
      </div>

      {previewOpen && !railCollapsed ? (
        <div
          aria-label="调整资料目录宽度"
          className="project-result-workspace__resizer project-result-workspace__resizer--rail"
          onPointerDown={(event) => beginResize(event, 'rail')}
          role="separator"
        />
      ) : null}

      {previewOpen ? (
        <main className="project-result-workspace__document">{fileWorkspace}</main>
      ) : null}

      {previewOpen && !contextCollapsed ? (
        <div
          aria-label="调整 BidVolt 区域宽度"
          className="project-result-workspace__resizer project-result-workspace__resizer--context"
          onPointerDown={(event) => beginResize(event, 'context')}
          role="separator"
        />
      ) : null}

      <aside className="project-result-workspace__agent" aria-label="BidVolt 区域">
        {previewOpen ? (
          <button
            aria-expanded={!contextCollapsed}
            aria-label={contextCollapsed ? '展开 BidVolt 上下文' : '收起 BidVolt 上下文'}
            className="project-result-workspace__panel-toggle project-result-workspace__panel-toggle--agent"
            onClick={() => setContextCollapsed((value) => !value)}
            title={contextCollapsed ? '展开 BidVolt 上下文' : '收起 BidVolt 上下文'}
            type="button"
          >
            {contextCollapsed
              ? <PanelRightOpen aria-hidden="true" size={19} />
              : <PanelRightClose aria-hidden="true" size={18} />}
            {contextCollapsed && openInteractionCount > 0 ? <span>{openInteractionCount}</span> : null}
          </button>
        ) : null}

        {integratedSummary ? null : statusHeader}

        <section
          aria-label="BidVolt 任务上下文"
          className="project-result-workspace__context"
          data-collapsed={previewOpen && contextCollapsed ? 'true' : 'false'}
          data-layout={state === 'complete' ? 'completion-summary' : 'activity'}
          data-summary-collapsed={summaryCollapsed ? 'true' : 'false'}
        >
          <div className="project-result-workspace__summary" hidden={summaryCollapsed || !summary}>
            {typeof summary === 'function' ? summary(statusHeader) : summary}
          </div>
          <div className="project-result-workspace__context-divider">
            <button
              aria-expanded={!summaryCollapsed}
              aria-label={summaryCollapsed ? '恢复 BidVolt 状态与成果摘要' : '将上下文记录上拉到顶部'}
              className="project-result-workspace__summary-toggle"
              onClick={() => setSummaryCollapsed((value) => !value)}
              title={summaryCollapsed ? '恢复 BidVolt 状态与成果摘要' : '将上下文记录上拉到顶部'}
              type="button"
            >
              {summaryCollapsed
                ? <ChevronsDown aria-hidden="true" size={20} strokeWidth={2.5} />
                : <ChevronsUp aria-hidden="true" size={20} strokeWidth={2.5} />}
            </button>
          </div>
          <div className="project-result-workspace__activity">{activity}</div>
          <div className="project-result-workspace__composer">{composer}</div>
        </section>
      </aside>
    </div>
  );
}
