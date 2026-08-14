import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  Gauge,
  Lightbulb,
} from 'lucide-react';

import { AppLink, deliverableEditorPath } from '../../app/router';
import type { ProjectSummary } from './project-view-model';
import {
  ProjectWorkbench,
  ResultCover,
  ScoreRing,
  type WorkspaceMaterial,
} from './ProjectWorkbench';
import { ProjectWorkspaceTabs } from './ProjectWorkspaceTabs';
import './project-overview-0802.css';

type ProjectOverviewPageProps = {
  deliverables?: ProjectDeliverableView[];
  deliverablesRequest?: DeliverablesRequestView;
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onAssistantSend?: (value: string) => void | Promise<void>;
  onOpenTasks: () => void;
  onSelectVersion?: (option: ProjectOverviewVersionOption) => void;
  overview?: ProjectOverviewView;
  project?: ProjectSummary;
  projectId: string;
  taskSummary?: {
    message: string;
    percent: number;
    status?: ProjectTaskStatus;
    title: string;
  };
  versionOptions?: ProjectOverviewVersionOption[];
  downloadHrefFor?: (deliverable: ProjectDeliverableView) => string;
  onDownloadDeliverable?: (deliverable: ProjectDeliverableView) => void | Promise<void>;
};

export type DeliverablesRequestView = {
  endpoint: string;
  errorMessage?: string;
  method?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
};

export type ProjectTaskStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'waiting_user'
  | 'succeeded'
  | 'failed';

export type ProjectDeliverableView = {
  id: 'business' | 'technical' | 'quote';
  lift: string;
  missing?: number;
  pages?: number;
  score: string;
  title: string;
  tone: 'business' | 'technical' | 'quote';
  versionId?: string;
  words: string;
};

export type ProjectOverviewVersionOption = {
  deliverableId: ProjectDeliverableView['id'];
  isCurrent?: boolean;
  title: string;
  versionId: string;
};

export type ProjectOverviewView = {
  deliverables: ProjectDeliverableView[];
  score: {
    business?: number;
    estimatedLift?: number;
    missingMaterials: number;
    pricing?: number;
    rejectionRisks?: number;
    technical?: number;
    total: number;
  };
};

export function ProjectOverviewPage({
  deliverables,
  deliverablesRequest,
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantSend,
  onOpenTasks,
  onSelectVersion,
  overview,
  project: projectOverride,
  projectId,
  taskSummary,
  versionOptions,
  downloadHrefFor,
  onDownloadDeliverable,
}: ProjectOverviewPageProps) {
  const project = projectOverride;
  const visibleDeliverables = deliverables ?? overview?.deliverables;

  if (!project) {
    return (
      <section className="empty-page" aria-labelledby="missing-project-title">
        <span className="empty-page__code">未找到</span>
        <h2 id="missing-project-title">这个项目不存在或已被移出当前企业</h2>
        <p>返回项目列表选择一个可访问的工作台。</p>
        <AppLink className="button button--primary" to="/projects">
          返回项目列表
        </AppLink>
      </section>
    );
  }

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      heightMode="content"
      footerHint="请输入您的问题，如“请分析招标文件的评分细则”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
      onAssistantSend={onAssistantSend}
      workspaceNavigation={<ProjectWorkspaceTabs activeTab="overview" projectId={projectId} />}
      rightRail={
        <section className="bv-review-summary" aria-labelledby="overview-score-title">
          <header>
            <span>
              <Gauge aria-hidden="true" size={22} />
              <h2 id="overview-score-title">模拟评标</h2>
            </span>
            <ChevronDown aria-hidden="true" size={20} />
          </header>
          {overview ? (
            <>
              <ScoreRing score={overview.score.total} />
              <dl className="bv-score-breakdown">
                <div><dt>商务分</dt><dd><strong>{overview.score.business ?? '—'}</strong> / 30</dd></div>
                <div><dt>技术分</dt><dd><strong>{overview.score.technical ?? '—'}</strong> / 50</dd></div>
                <div><dt>报价分</dt><dd><strong>{overview.score.pricing ?? '—'}</strong> / 20</dd></div>
                <div><dt>否决风险数</dt><dd><strong>{overview.score.rejectionRisks ?? '—'}</strong> 项</dd></div>
                <div className="bv-score-breakdown__warning"><dt>缺失材料数</dt><dd><strong>{overview.score.missingMaterials}</strong> 项</dd></div>
                <div><dt>预计可提升分值</dt><dd><strong>{overview.score.estimatedLift ?? '—'}</strong> 分</dd></div>
              </dl>
              <AppLink className="bv-review-summary__button" to={`/projects/${projectId}/review`}>
                <Lightbulb aria-hidden="true" size={21} />
                查看提升建议
              </AppLink>
            </>
          ) : (
            <div className="bv-review-summary__empty" role="status">
              <Gauge aria-hidden="true" size={34} />
              <strong>暂无模拟得分</strong>
              <p>完成当前项目的材料解析并生成成果后，才会展示项目评分。</p>
            </div>
          )}
          {taskSummary ? (
            <button className="bv-task-progress" type="button" onClick={onOpenTasks}>
              <span>{taskSummary.title}</span>
              <strong>{taskSummary.percent}%</strong>
              <small>{taskSummary.message}</small>
            </button>
          ) : null}
        </section>
      }
    >
      <section className="bv-deliverables" aria-labelledby="deliverables-title">
        <h2 className="bv-visually-hidden">{project.title}</h2>
        <header className="bv-deliverables__header">
          <div>
            <span className="bv-deliverables__title-icon"><FileCheck2 aria-hidden="true" size={24} /></span>
            <div>
              <h1 id="deliverables-title">标书成果预览</h1>
              <p><span>从项目材料到最终交付</span> · 所有成果读取当前项目冻结快照</p>
            </div>
          </div>
          <div className="bv-version-filters">
            <DeliverableVersionSelect
              onSelectVersion={onSelectVersion}
              options={versionOptions}
            />
          </div>
        </header>

        {visibleDeliverables && visibleDeliverables.length > 0 ? (
          <div className="bv-deliverable-grid">
          {visibleDeliverables.map((item) => (
            <article className="bv-deliverable-card" key={item.id}>
              <span className="bv-deliverable-card__status">{item.versionId ? `V${item.versionId}` : '尚无版本'}</span>
              <ResultCover title={item.title} tone={item.tone} />
              <h2>{item.title}</h2>
              <dl>
                <div><dt>总页数</dt><dd>{item.pages === undefined ? '—' : `${item.pages} 页`}</dd></div>
                <div><dt>总字数</dt><dd>{item.words}字</dd></div>
                <div><dt>总评分</dt><dd>{item.score}</dd></div>
                <div><dt>可提升分数</dt><dd>{item.lift}</dd></div>
                <div className={item.missing !== undefined && item.missing > 0 ? 'is-warning' : ''}><dt>缺资料份数</dt><dd>{item.missing === undefined ? '—' : `${item.missing} 份`}</dd></div>
              </dl>
              <div className="bv-deliverable-card__actions">
                {item.versionId ? (
                  <AppLink
                    aria-label={`预览${item.title}`}
                    to={deliverableEditorPath(projectId, item.id, item.versionId)}
                  >
                    预览文件 <Eye aria-hidden="true" size={17} />
                  </AppLink>
                ) : (
                  <button aria-label={`${item.title}尚无可预览版本`} disabled type="button">
                    尚无版本 <Eye aria-hidden="true" size={17} />
                  </button>
                )}
                {!item.versionId ? (
                  <button aria-label={`${item.title}尚无可下载版本`} disabled type="button">
                    <Download aria-hidden="true" size={18} />
                  </button>
                ) : onDownloadDeliverable ? (
                  <button
                    aria-label={`下载${item.title}`}
                    type="button"
                    onClick={() => void onDownloadDeliverable(item)}
                  >
                    <Download aria-hidden="true" size={18} />
                  </button>
                ) : downloadHrefFor ? (
                  <a aria-label={`下载${item.title}`} download href={downloadHrefFor(item)}>
                    <Download aria-hidden="true" size={18} />
                  </a>
                ) : (
                  <button aria-label={`下载${item.title}`} disabled type="button">
                    <Download aria-hidden="true" size={18} />
                  </button>
                )}
              </div>
            </article>
          ))}
          </div>
        ) : (
          <DeliverablesEmptyState
            onOpenTasks={onOpenTasks}
            request={deliverablesRequest}
            taskSummary={taskSummary}
          />
        )}
      </section>
    </ProjectWorkbench>
  );
}

type DeliverablesEmptyStateProps = {
  onOpenTasks: () => void;
  request?: DeliverablesRequestView;
  taskSummary?: ProjectOverviewPageProps['taskSummary'];
};

function DeliverablesEmptyState({
  onOpenTasks,
  request,
  taskSummary,
}: DeliverablesEmptyStateProps) {
  if (!request || request.status === 'idle') {
    return (
      <div className="bv-overview-empty" role="status">
        <FileCheck2 aria-hidden="true" size={38} />
        <strong>项目成果尚未生成</strong>
        <p>当前项目没有可展示的成果版本。请先上传本次招标材料并完成解析。</p>
      </div>
    );
  }

  const isSuccess = request.status === 'success';
  const title = isSuccess
    ? '成果接口调用成功，返回 0 项'
    : request.status === 'loading'
      ? '正在调用成果接口'
      : '成果接口调用失败';
  const description = isSuccess
    ? '后端已成功返回空列表，因此页面不会生成虚拟成果卡片。'
    : request.status === 'loading'
      ? '请求尚未完成，页面会等待后端返回后再展示真实成果。'
      : request.errorMessage ?? '后端未能返回成果列表，请重新测试接口或稍后重试。';
  const taskState = taskSummary?.status ? taskStatusContent[taskSummary.status] : undefined;

  return (
    <div
      aria-label={title}
      className={`bv-overview-empty bv-overview-empty--api bv-overview-empty--${request.status}`}
      data-request-status={request.status}
      role="status"
    >
      {isSuccess
        ? <CheckCircle2 aria-hidden="true" size={38} />
        : <FileCheck2 aria-hidden="true" size={38} />}
      <strong>{title}</strong>
      <p>{description}</p>

      <dl className="bv-overview-empty__request">
        <div>
          <dt>成果接口</dt>
          <dd><code>{(request.method ?? 'GET').toUpperCase()} {request.endpoint}</code></dd>
        </div>
        <div>
          <dt>真实返回</dt>
          <dd>{isSuccess ? '调用成功 · 0 项成果' : request.status === 'loading' ? '请求进行中' : '调用失败'}</dd>
        </div>
      </dl>

      {taskState && taskSummary ? (
        <div className={`bv-overview-empty__task bv-overview-empty__task--${taskSummary.status}`} role="note">
          <Clock3 aria-hidden="true" size={19} />
          <span>
            <strong>生成任务：{taskSummary.status} · {taskState}</strong>
            <small>{taskSummary.message}</small>
          </span>
          <button onClick={onOpenTasks} type="button">查看任务进度</button>
        </div>
      ) : null}

    </div>
  );
}

function DeliverableVersionSelect({
  onSelectVersion,
  options = [],
}: {
  onSelectVersion?: (option: ProjectOverviewVersionOption) => void;
  options?: ProjectOverviewVersionOption[];
}) {
  const currentOption = options.find((option) => option.isCurrent) ?? options[0];
  const currentKey = currentOption ? versionOptionKey(currentOption) : '';
  const resetKey = `${currentKey}:${options.map(versionOptionKey).join('|')}`;

  return (
    <label className="bv-version-select">
      <span>成果版本</span>
      <select
        defaultValue={currentKey}
        disabled={options.length === 0}
        key={resetKey}
        onChange={(event) => {
          const option = options.find((candidate) => versionOptionKey(candidate) === event.target.value);
          if (option) onSelectVersion?.(option);
        }}
      >
        {options.length === 0 ? <option value="">暂无成果版本</option> : null}
        {options.map((option) => (
          <option key={versionOptionKey(option)} value={versionOptionKey(option)}>
            {option.title} · {formatVersionNumber(option.versionId)}{option.isCurrent ? ' · 当前' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function versionOptionKey(option: ProjectOverviewVersionOption) {
  return `${option.deliverableId}:${option.versionId}`;
}

function formatVersionNumber(versionId: string) {
  const normalized = versionId.trim();
  const suffixMatch = normalized.match(/(?:^|[-_])v(\d+(?:\.\d+)*)$/i);
  if (suffixMatch) return `V${suffixMatch[1]}`;
  if (/^v/i.test(normalized)) return `V${normalized.slice(1)}`;
  return `V${normalized}`;
}

const taskStatusContent: Record<ProjectTaskStatus, string> = {
  queued: '等待执行器',
  running: '执行中',
  retrying: '等待重试',
  waiting_user: '等待用户操作',
  succeeded: '已完成但暂无成果',
  failed: '执行失败',
};
