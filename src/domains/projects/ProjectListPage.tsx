import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  FileStack,
  FolderKanban,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { AppLink } from '../../app/router';
import { projectSummaries, type ProjectStage } from './project-view-model';

type FilterName = '全部' | '进行中' | '待评审' | '待提交';

const filters: FilterName[] = ['全部', '进行中', '待评审', '待提交'];

function matchesFilter(stage: ProjectStage, filter: FilterName) {
  if (filter === '待评审') {
    return stage === '内部评审';
  }
  if (filter === '待提交') {
    return stage === '待提交';
  }
  if (filter === '进行中') {
    return stage !== '待提交';
  }
  return true;
}

export function ProjectListPage() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterName>('全部');

  const visibleProjects = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return projectSummaries.filter((project) => {
      const searchableText = `${project.code} ${project.title} ${project.buyer}`.toLocaleLowerCase(
        'zh-CN',
      );
      return (
        matchesFilter(project.stage, activeFilter) &&
        (!normalisedQuery || searchableText.includes(normalisedQuery))
      );
    });
  }, [activeFilter, query]);

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="eyebrow">Web 工作空间</span>
          <h2>把每次投标沉淀成清晰、可追溯的工作流</h2>
          <p>项目材料只在当前工作台内处理；企业长期资料通过独立资料库复用。</p>
        </div>
        <div className="boundary-note">
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <strong>项目资料隔离中</strong>
            <span>当前列表不会写入企业资料库</span>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="项目概况">
        <article className="summary-card summary-card--brand">
          <span className="summary-card__icon" aria-hidden="true">
            <FolderKanban size={19} />
          </span>
          <div>
            <small>全部项目</small>
            <strong>18</strong>
            <span>本月新增 4 个</span>
          </div>
        </article>
        <article className="summary-card">
          <span className="summary-card__icon summary-card__icon--blue" aria-hidden="true">
            <Clock3 size={19} />
          </span>
          <div>
            <small>进行中</small>
            <strong>7</strong>
            <span>2 个本周截止</span>
          </div>
        </article>
        <article className="summary-card">
          <span className="summary-card__icon summary-card__icon--amber" aria-hidden="true">
            <CircleAlert size={19} />
          </span>
          <div>
            <small>待处理风险</small>
            <strong>9</strong>
            <span>覆盖 3 个项目</span>
          </div>
        </article>
        <article className="summary-card">
          <span className="summary-card__icon summary-card__icon--green" aria-hidden="true">
            <FileStack size={19} />
          </span>
          <div>
            <small>本月已提交</small>
            <strong>6</strong>
            <span>全部保留交付快照</span>
          </div>
        </article>
      </section>

      <section className="project-panel" aria-labelledby="project-panel-title">
        <header className="project-panel__header">
          <div>
            <h2 id="project-panel-title">最近项目</h2>
            <p>按最新处理时间排序</p>
          </div>
          <label className="search-field">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">搜索项目</span>
            <input
              type="search"
              value={query}
              placeholder="搜索项目、编号或招标人"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>

        <div className="filter-tabs" role="group" aria-label="筛选项目">
          {filters.map((filter) => (
            <button
              className={activeFilter === filter ? 'filter-tab filter-tab--active' : 'filter-tab'}
              type="button"
              key={filter}
              aria-pressed={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>

        {visibleProjects.length ? (
          <div className="project-list">
            {visibleProjects.map((project) => (
              <article className="project-row" key={project.id}>
                <div className="project-row__main">
                  <div className="project-row__title-line">
                    <span className="stage-pill">{project.stage}</span>
                    <span className="project-code">{project.code}</span>
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.buyer}</p>
                </div>

                <div className="project-row__facts">
                  <span>
                    <CalendarDays aria-hidden="true" size={15} />
                    截止 {project.deadline}
                  </span>
                  <span>
                    <FileStack aria-hidden="true" size={15} />
                    {project.materialCount} 份项目材料
                  </span>
                  <span className={project.riskCount ? 'fact--warning' : ''}>
                    <CircleAlert aria-hidden="true" size={15} />
                    {project.riskCount ? `${project.riskCount} 项待处理风险` : '暂无待处理风险'}
                  </span>
                </div>

                <div className="project-row__progress">
                  <div>
                    <span>工作台进度</span>
                    <strong>{project.progress}%</strong>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`${project.title}工作台进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={project.progress}
                  >
                    <span style={{ width: `${project.progress}%` }} />
                  </div>
                  <small>更新于 {project.updatedAt}</small>
                </div>

                <AppLink
                  className="project-row__action"
                  to={`/projects/${encodeURIComponent(project.id)}/overview`}
                  aria-label={`进入${project.title}工作台`}
                >
                  <span>进入工作台</span>
                  <ArrowRight aria-hidden="true" size={18} />
                </AppLink>
              </article>
            ))}
          </div>
        ) : (
          <div className="project-empty" role="status">
            <Search aria-hidden="true" size={24} />
            <h3>没有找到匹配项目</h3>
            <p>试试调整关键词或项目状态。</p>
          </div>
        )}
      </section>
    </div>
  );
}
