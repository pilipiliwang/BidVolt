import {
  ChevronDown,
  Download,
  Eye,
  FileCheck2,
  FolderOpen,
  Gauge,
  Lightbulb,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import { AppLink, deliverableEditorPath } from '../../app/router';
import { getProjectSummary, type ProjectSummary } from './project-view-model';
import {
  ProjectWorkbench,
  ResultCover,
  ScoreRing,
  type WorkspaceMaterial,
} from './ProjectWorkbench';
import './project-overview-0802.css';

type ProjectOverviewPageProps = {
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  onOpenTasks: () => void;
  overview?: ProjectOverviewView;
  project?: ProjectSummary;
  projectId: string;
  taskSummary?: {
    message: string;
    percent: number;
    title: string;
  };
};

export type ProjectDeliverableView = {
  id: 'business' | 'technical' | 'quote';
  lift: string;
  missing: number;
  pages: number;
  score: string;
  title: string;
  tone: 'business' | 'technical' | 'quote';
  versionId?: string;
  words: string;
};

export type ProjectOverviewView = {
  deliverables: ProjectDeliverableView[];
  score: {
    business: number;
    estimatedLift: number;
    missingMaterials: number;
    pricing: number;
    rejectionRisks: number;
    technical: number;
    total: number;
  };
};

const mockDownloadHref: Record<ProjectDeliverableView['id'], string> = {
  business: '/mock-files/商务标文件-Mock.docx',
  technical: '/mock-files/技术标文件-Mock.docx',
  quote: '/mock-files/报价单-Mock.xlsx',
};

export function ProjectOverviewPage({
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onOpenTasks,
  overview,
  project: projectOverride,
  projectId,
  taskSummary,
}: ProjectOverviewPageProps) {
  const project = projectOverride ?? getProjectSummary(projectId);

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
      footerHint="请输入您的问题，如“请分析招标文件的评分细则”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
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
                <div><dt>商务分</dt><dd><strong>{overview.score.business}</strong> / 30</dd></div>
                <div><dt>技术分</dt><dd><strong>{overview.score.technical}</strong> / 50</dd></div>
                <div><dt>报价分</dt><dd><strong>{overview.score.pricing}</strong> / 20</dd></div>
                <div><dt>否决风险数</dt><dd><strong>{overview.score.rejectionRisks}</strong> 项</dd></div>
                <div className="bv-score-breakdown__warning"><dt>缺失材料数</dt><dd><strong>{overview.score.missingMaterials}</strong> 项</dd></div>
                <div><dt>预计可提升分值</dt><dd><strong>{overview.score.estimatedLift}</strong> 分</dd></div>
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
              <AppLink to={`/projects/${projectId}/materials`}>前往项目材料</AppLink>
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
            <AppLink className="bv-materials-entry" to={`/projects/${projectId}/materials`}>
              <FolderOpen aria-hidden="true" size={18} />
              打开项目材料
            </AppLink>
            <AppLink className="bv-materials-entry" to={`/projects/${projectId}/pricing`}>
              <TrendingUp aria-hidden="true" size={18} />
              报价分析
            </AppLink>
            <label>版本号 <select aria-label="成果版本"><option>V3.2</option></select></label>
            <label><ShieldCheck aria-hidden="true" size={18} /><select aria-label="版本时间"><option>最新版本</option></select></label>
          </div>
        </header>

        {overview ? (
          <div className="bv-deliverable-grid">
          {overview.deliverables.map((item) => (
            <article className="bv-deliverable-card" key={item.id}>
              <span className="bv-deliverable-card__status">已生成</span>
              <ResultCover title={item.title} tone={item.tone} />
              <h2>{item.title}</h2>
              <dl>
                <div><dt>总页数</dt><dd>{item.pages} 页</dd></div>
                <div><dt>总字数</dt><dd>{item.words}字</dd></div>
                <div><dt>总评分</dt><dd>{item.score}</dd></div>
                <div><dt>可提升分数</dt><dd>{item.lift}</dd></div>
                <div className={item.missing > 0 ? 'is-warning' : ''}><dt>缺资料份数</dt><dd>{item.missing} 份</dd></div>
              </dl>
              <div className="bv-deliverable-card__actions">
                <AppLink
                  aria-label={`预览${item.title}`}
                  to={deliverableEditorPath(projectId, item.id, item.versionId ?? 'latest')}
                >
                  预览文件 <Eye aria-hidden="true" size={17} />
                </AppLink>
                <a aria-label={`下载${item.title}`} download href={mockDownloadHref[item.id]}>
                  <Download aria-hidden="true" size={18} />
                </a>
              </div>
            </article>
          ))}
          </div>
        ) : (
          <div className="bv-overview-empty" role="status">
            <FileCheck2 aria-hidden="true" size={38} />
            <strong>项目成果尚未生成</strong>
            <p>当前项目没有可展示的成果版本。请先上传本次招标材料并完成解析。</p>
            <AppLink to={`/projects/${projectId}/materials`}>前往项目材料</AppLink>
          </div>
        )}

        <div className="bv-deliverables__boundary" role="note">
          <ShieldCheck aria-hidden="true" size={18} />
          <span><strong>当前任务数据已隔离</strong> 本次招标材料、需求及成果只保存在项目事件中，不写入企业资料库。</span>
          <TrendingUp aria-hidden="true" size={18} />
        </div>
      </section>
    </ProjectWorkbench>
  );
}
