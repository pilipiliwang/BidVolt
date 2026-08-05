import { useMemo, useState } from 'react';
import { Archive, CircleAlert, Hourglass, Search } from 'lucide-react';

import { AppLink } from '../../app/router';
import { projectSummaries, type ProjectSummary } from './project-view-model';

type ProjectTableRow = ProjectSummary & {
  deadlineHint: string;
  score: string;
};

const supplementalProjects: ProjectTableRow[] = [
  {
    id: 'BV-2026-006',
    code: 'BV-2026-006',
    title: '±800kV特高压直流输电工程换流站设备采购',
    buyer: '国家电网特高压建设分公司',
    stage: '材料解析',
    progress: 18,
    deadline: '2026-08-08 10:00',
    deadlineHint: '3天后截止',
    materialCount: 18,
    riskCount: 2,
    updatedAt: '今天 09:48',
    score: '-',
  },
  {
    id: 'BV-2026-005',
    code: 'BV-2026-005',
    title: '华东电网调峰火电机组灵活性改造项目',
    buyer: '华东电力设计研究院',
    stage: '内部评审',
    progress: 81,
    deadline: '2026-08-15 09:00',
    deadlineHint: '10天后截止',
    materialCount: 36,
    riskCount: 1,
    updatedAt: '昨天 14:12',
    score: '82.5',
  },
  {
    id: 'BV-2026-003',
    code: 'BV-2026-003',
    title: '220kV变电站智能化改造工程',
    buyer: '南网数智电网建设有限公司',
    stage: '方案编制',
    progress: 64,
    deadline: '2026-08-18 14:00',
    deadlineHint: '13天后截止',
    materialCount: 22,
    riskCount: 4,
    updatedAt: '昨天 11:08',
    score: '76.8',
  },
  {
    id: 'BV-2026-001',
    code: 'BV-2026-001',
    title: '储能电站建设项目（100MW/200MWh）',
    buyer: '华中新能源投资集团',
    stage: '待提交',
    progress: 94,
    deadline: '2026-08-27 10:00',
    deadlineHint: '22天后截止',
    materialCount: 29,
    riskCount: 0,
    updatedAt: '07-31 16:05',
    score: '92.1',
  },
];

const scoreByProjectId: Record<string, string> = {
  'BV-2026-018': '-',
  'BV-2026-015': '86.2',
  'BV-2026-012': '75.6',
  'BV-2026-009': '88.3',
};

const hintByProjectId: Record<string, string> = {
  'BV-2026-018': '7天后截止',
  'BV-2026-015': '4天后截止',
  'BV-2026-012': '15天后截止',
  'BV-2026-009': '2天后截止',
};

const projectRows: ProjectTableRow[] = [
  ...projectSummaries.map((project) => ({
    ...project,
    deadlineHint: hintByProjectId[project.id] ?? '待确认',
    score: scoreByProjectId[project.id] ?? '-',
  })),
  ...supplementalProjects,
];

const accessibleProjectIds = new Set(projectSummaries.map((project) => project.id));

const summaryItems = [
  { label: '全部项目', value: 36, icon: Archive, tone: 'green' },
  { label: '临近截止', value: 5, icon: Hourglass, tone: 'orange' },
  { label: '已截止', value: 8, icon: CircleAlert, tone: 'red' },
] as const;

export function ProjectListPage() {
  const [query, setQuery] = useState('');
  const [deletedProjectIds, setDeletedProjectIds] = useState<string[]>([]);

  const visibleProjects = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return projectRows.filter((project) => {
      if (deletedProjectIds.includes(project.id)) {
        return false;
      }
      const searchableText = `${project.code} ${project.title} ${project.buyer}`.toLocaleLowerCase(
        'zh-CN',
      );
      return !normalisedQuery || searchableText.includes(normalisedQuery);
    });
  }, [deletedProjectIds, query]);

  return (
    <div className="ui0802-project-page">
      <h2 className="sr-only">把每次投标沉淀成清晰、可追溯的工作流</h2>
      <label className="ui0802-project-search sr-only">
        <Search aria-hidden="true" size={17} />
        <span>搜索项目</span>
        <input
          type="search"
          value={query}
          placeholder="搜索项目、编号或招标人"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <section className="ui0802-summary-grid" aria-label="项目概况">
        {summaryItems.map(({ label, value, icon: Icon, tone }) => (
          <article className={`ui0802-summary-card ui0802-summary-card--${tone}`} key={label}>
            <span className="ui0802-summary-card__icon" aria-hidden="true">
              <Icon size={42} strokeWidth={2.5} />
            </span>
            <div>
              <h2>{label}</h2>
              <p>
                <strong>{value}</strong>
                <span>个</span>
              </p>
            </div>
          </article>
        ))}
      </section>

      <section className="ui0802-project-table-card" aria-label="投标项目列表">
        {visibleProjects.length ? (
          <div className="ui0802-project-table-scroll">
            <table className="ui0802-project-table">
              <thead>
                <tr>
                  <th scope="col">项目名称</th>
                  <th scope="col">招标编号</th>
                  <th scope="col">截止时间</th>
                  <th scope="col">模拟得分</th>
                  <th scope="col">最近更新时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <span className="ui0802-project-title">{project.title}</span>
                      <span className="ui0802-project-buyer">{project.buyer}</span>
                    </td>
                    <td>{project.code}</td>
                    <td>
                      <time>{project.deadline}</time>
                      <span className="ui0802-deadline-hint">（{project.deadlineHint}）</span>
                    </td>
                    <td>{project.score}</td>
                    <td>{project.updatedAt}</td>
                    <td>
                      <div className="ui0802-row-actions">
                        {accessibleProjectIds.has(project.id) ? (
                          <AppLink
                            to={`/projects/${encodeURIComponent(project.id)}/overview`}
                            aria-label={`进入${project.title}工作台`}
                          >
                            进入
                          </AppLink>
                        ) : (
                          <span
                            aria-label={`${project.title}工作台暂未接入`}
                            title="演示数据尚未接入可访问的项目工作台"
                          >
                            暂未接入
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`从列表删除${project.title}`}
                          onClick={() =>
                            setDeletedProjectIds((current) => [...current, project.id])
                          }
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ui0802-project-empty" role="status">
            <Search aria-hidden="true" size={28} />
            <h2>没有找到匹配项目</h2>
            <p>请调整项目名称、编号或招标人关键词。</p>
          </div>
        )}

        <footer className="ui0802-table-footer">
          <p>
            总计 <strong>36</strong> 条
          </p>
          <div
            className="ui0802-pagination ui0802-pagination--static"
            role="status"
            aria-label="项目分页状态"
          >
            <span>当前演示页</span>
            <strong>第 1 / 1 页</strong>
            <span>展示 {visibleProjects.length} 条</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
