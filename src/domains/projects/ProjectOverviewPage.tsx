import {
  Activity,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  FileCheck2,
  FilePenLine,
  FileSearch,
  FileStack,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { AppLink } from '../../app/router';
import { getProjectSummary } from './project-view-model';

type ProjectOverviewPageProps = {
  onOpenTasks: () => void;
  projectId: string;
  taskSummary?: {
    message: string;
    percent: number;
    title: string;
  };
};

const workflowSteps = [
  {
    title: '项目材料',
    detail: '材料绑定当前项目事件',
    status: 'complete',
    icon: FileStack,
  },
  {
    title: '需求清单',
    detail: '需求保留原文定位',
    status: 'complete',
    icon: ListChecks,
  },
  {
    title: '成果编制',
    detail: '成果读取冻结快照',
    status: 'active',
    icon: FilePenLine,
  },
  {
    title: '模拟评审',
    detail: '等待成果版本确认',
    status: 'waiting',
    icon: FileSearch,
  },
  {
    title: '终检交付',
    detail: '等待冻结项目快照',
    status: 'waiting',
    icon: FileCheck2,
  },
] as const;

const demoAttentionItems = [
  {
    level: 'high',
    title: '技术参数存在 2 处待确认项',
    detail: '配电柜防护等级与招标正文、附件表述不一致。',
    action: '查看需求',
    target: 'materials',
  },
  {
    level: 'medium',
    title: '3 条业绩要求尚未匹配企业资料',
    detail: '需要选择可复用的企业业绩记录，项目材料不会自动沉淀。',
    action: '处理匹配',
    target: 'enterprise',
  },
  {
    level: 'low',
    title: '报价样本口径等待确认',
    detail: '历史价格只读查询已完成，需确认税率和运输范围。',
    action: '查看报价',
    target: 'pricing',
  },
] as const;

export function ProjectOverviewPage({ onOpenTasks, projectId, taskSummary }: ProjectOverviewPageProps) {
  const project = getProjectSummary(projectId);

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

  const attentionItems =
    project.id === 'BV-2026-018'
      ? demoAttentionItems
      : [
          {
            level: project.riskCount > 0 ? ('medium' as const) : ('low' as const),
            title:
              project.riskCount > 0
                ? `当前项目有 ${project.riskCount} 项待处理风险`
                : '当前项目暂无待处理风险',
            detail: '进入当前项目材料查看本项目的 Requirement、证据和处理状态。',
            action: '查看材料',
            target: 'materials' as const,
          },
        ];

  return (
    <div className="page-stack page-stack--overview">
      <nav className="breadcrumbs" aria-label="面包屑">
        <AppLink to="/projects">投标项目</AppLink>
        <ChevronRight aria-hidden="true" size={14} />
        <span aria-current="page">{project.code}</span>
      </nav>

      <section className="workbench-hero">
        <div className="workbench-hero__main">
          <div className="workbench-hero__meta">
            <span className="stage-pill">{project.stage}</span>
            <span>{project.code}</span>
          </div>
          <h2>{project.title}</h2>
          <p>{project.buyer}</p>
          <div className="workbench-hero__facts">
            <span>
              <CalendarClock aria-hidden="true" size={16} />
              截止时间 {project.deadline}
            </span>
            <span>
              <ShieldCheck aria-hidden="true" size={16} />
              当前项目快照已启用
            </span>
          </div>
          <div className="workbench-hero__actions" aria-label="项目快捷入口">
            <AppLink className="button button--primary" to={`/projects/${projectId}/materials`}>
              打开项目材料
              <ArrowRight aria-hidden="true" size={16} />
            </AppLink>
            <AppLink className="button button--light" to={`/projects/${projectId}/review`}>
              启动模拟评审
            </AppLink>
            <AppLink className="button button--light" to={`/projects/${projectId}/pricing`}>
              查看报价测算
            </AppLink>
          </div>
        </div>
        <div className="workbench-score">
          <span>工作台完成度</span>
          <strong>{project.progress}%</strong>
          <div
            className="progress-track progress-track--large"
            role="progressbar"
            aria-label="工作台完成度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={project.progress}
          >
            <span style={{ width: `${project.progress}%` }} />
          </div>
          <small>当前阶段：{project.stage}</small>
        </div>
      </section>

      <section className="workflow-panel" aria-labelledby="workflow-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">投标流程</span>
            <h2 id="workflow-title">从项目材料到最终交付</h2>
          </div>
          <span className="snapshot-chip">
            <ShieldCheck aria-hidden="true" size={15} />
            版本与证据可追溯
          </span>
        </div>
        <ol className="workflow-grid">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li className={`workflow-step workflow-step--${step.status}`} key={step.title}>
                <div className="workflow-step__topline">
                  <span className="workflow-step__icon" aria-hidden="true">
                    <Icon size={19} />
                  </span>
                  <span className="workflow-step__number">0{index + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>
                  {step.title === '项目材料'
                    ? `${project.materialCount} 份材料绑定当前项目事件`
                    : step.title === '成果编制'
                      ? `当前阶段：${project.stage}`
                      : step.detail}
                </p>
                <span className="workflow-step__state">
                  {step.status === 'complete' ? <Check aria-hidden="true" size={14} /> : null}
                  {step.status === 'active' ? <Activity aria-hidden="true" size={14} /> : null}
                  {step.status === 'waiting' ? <CircleDashed aria-hidden="true" size={14} /> : null}
                  {step.status === 'complete'
                    ? '已完成'
                    : step.status === 'active'
                      ? '进行中'
                      : '待开始'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="overview-grid">
        <section className="attention-panel" aria-labelledby="attention-title">
          <div className="section-heading section-heading--compact">
            <div>
              <span className="eyebrow">需要处理</span>
              <h2 id="attention-title">风险与待办</h2>
            </div>
            <span className="count-chip">{attentionItems.length} 项</span>
          </div>
          <div className="attention-list">
            {attentionItems.map((item) => {
              const projectPath = `/projects/${encodeURIComponent(projectId)}`;
              const actionHref =
                item.target === 'enterprise'
                  ? '/enterprise-assets'
                  : `${projectPath}/${item.target}`;

              return (
                <article className="attention-item" key={item.title}>
                  <span className={`risk-dot risk-dot--${item.level}`} aria-hidden="true" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <AppLink className="text-button" to={actionHref}>
                    {item.action}
                    <ArrowRight aria-hidden="true" size={15} />
                  </AppLink>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="task-card" aria-labelledby="task-card-title">
          <div className="task-card__visual" aria-hidden="true">
            <span className="task-card__orbit" />
            <Sparkles size={25} />
          </div>
          <span className="eyebrow">智能任务</span>
          <h2 id="task-card-title">{taskSummary?.title ?? '暂无运行中的智能任务'}</h2>
          <p>{taskSummary?.message ?? '当前项目没有可展示的公开任务进度。'}</p>
          {taskSummary ? (
            <div className="task-card__progress">
              <div>
                <span>完成进度</span>
                <strong>{taskSummary.percent}%</strong>
              </div>
              <div
                className="progress-track progress-track--large"
                role="progressbar"
                aria-label={`${taskSummary.title}进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={taskSummary.percent}
              >
                <span style={{ width: `${taskSummary.percent}%` }} />
              </div>
            </div>
          ) : null}
          <button
            className="button button--light button--full"
            type="button"
            disabled={!taskSummary}
            onClick={onOpenTasks}
          >
            {taskSummary ? '查看公开任务进度' : '当前无公开任务'}
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </aside>
      </div>

      <section className="snapshot-banner" aria-label="项目数据边界说明">
        <span className="snapshot-banner__icon" aria-hidden="true">
          <CircleAlert size={19} />
        </span>
        <div>
          <strong>本工作台仅使用当前项目的冻结快照</strong>
          <p>本次招标材料、需求与成果版本绑定在项目事件中，不会写入企业资料库。</p>
        </div>
      </section>
    </div>
  );
}
