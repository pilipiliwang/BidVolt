import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, CalendarDays, CircleAlert, Hourglass, Plus, Search, X } from 'lucide-react';

import { AppLink } from '../../app/router';
import { projectSummaries, type ProjectSummary } from './project-view-model';
import './ProjectListPage.css';

type ProjectTableRow = ProjectSummary & {
  deadlineHint: string;
  score: string;
};

type ProjectListPageProps = {
  onCreateProject: (project: ProjectSummary) => void;
  projects: ProjectSummary[];
};

type NewProjectDraft = {
  buyer: string;
  code: string;
  deadline: string;
  title: string;
};

const emptyDraft: NewProjectDraft = {
  buyer: '',
  code: '',
  deadline: '',
  title: '',
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

function toDateTimeLocalValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function getMinimumDeadline() {
  const minimum = new Date(Date.now() + 5 * 60_000);
  minimum.setSeconds(0, 0);
  return toDateTimeLocalValue(minimum);
}

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

export function ProjectListPage({ onCreateProject, projects }: ProjectListPageProps) {
  const [query, setQuery] = useState('');
  const [deletedProjectIds, setDeletedProjectIds] = useState<string[]>([]);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<NewProjectDraft>(emptyDraft);
  const [formError, setFormError] = useState('');
  const [minimumDeadline, setMinimumDeadline] = useState(getMinimumDeadline);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const deadlineInputRef = useRef<HTMLInputElement>(null);
  const deadlineInputId = useId();
  const deadlineHelpId = useId();

  const projectRows = useMemo<ProjectTableRow[]>(
    () => [
      ...projects.map((project) => ({
        ...project,
        deadlineHint: hintByProjectId[project.id] ?? '新建项目',
        score: scoreByProjectId[project.id] ?? '-',
      })),
      ...supplementalProjects,
    ],
    [projects],
  );
  const accessibleProjectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  const projectTotal = 36 + Math.max(0, projects.length - projectSummaries.length);

  const visibleProjects = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return projectRows.filter((project) => {
      if (deletedProjectIds.includes(project.id)) return false;
      const searchableText = `${project.code} ${project.title} ${project.buyer}`.toLocaleLowerCase(
        'zh-CN',
      );
      return !normalisedQuery || searchableText.includes(normalisedQuery);
    });
  }, [deletedProjectIds, projectRows, query]);

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setDraft(emptyDraft);
    setFormError('');
  };

  const updateDraft = (field: keyof NewProjectDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFormError('');
  };

  const openDeadlinePicker = () => {
    const input = deadlineInputRef.current;
    if (!input) return;

    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Some embedded browsers expose showPicker but reject it. The focused,
      // keyboard-editable input remains a complete fallback.
    }
  };

  useEffect(() => {
    if (!isCreateOpen) return undefined;
    firstInputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCreateDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = getFocusableElements(dialogRef.current);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      createButtonRef.current?.focus();
    };
  }, [isCreateOpen]);

  const submitProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = {
      buyer: draft.buyer.trim(),
      code: draft.code.trim(),
      deadline: draft.deadline.trim(),
      title: draft.title.trim(),
    };
    if (!normalized.title || !normalized.code || !normalized.buyer || !normalized.deadline) {
      setFormError('请完整填写项目名称、招标编号、招标人和截止时间。');
      return;
    }
    if (
      projects.some(
        (project) => project.code.toLocaleLowerCase() === normalized.code.toLocaleLowerCase(),
      )
    ) {
      setFormError('该招标编号已存在，请检查后重新填写。');
      return;
    }
    const deadline = new Date(normalized.deadline);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      setFormError('截止时间必须是晚于当前时间的有效日期。');
      return;
    }

    onCreateProject({
      id: normalized.code,
      code: normalized.code,
      title: normalized.title,
      buyer: normalized.buyer,
      stage: '材料解析',
      progress: 0,
      deadline: normalized.deadline.replace('T', ' '),
      materialCount: 0,
      riskCount: 0,
      updatedAt: '刚刚',
    });
    closeCreateDialog();
  };

  const summaryItems = [
    { label: '全部项目', value: projectTotal, icon: Archive, tone: 'green' },
    { label: '临近截止', value: 5, icon: Hourglass, tone: 'orange' },
    { label: '已截止', value: 8, icon: CircleAlert, tone: 'red' },
  ] as const;

  return (
    <div className="ui0802-project-page">
      <h2 className="sr-only">把每次投标沉淀成清晰、可追溯的工作流</h2>
      <div className="ui0802-project-toolbar">
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
        <button
          ref={createButtonRef}
          className="ui0802-create-project"
          type="button"
          onClick={() => {
            setMinimumDeadline(getMinimumDeadline());
            setCreateOpen(true);
          }}
        >
          <Plus aria-hidden="true" size={18} />
          新增项目
        </button>
      </div>

      <section className="ui0802-summary-grid" aria-label="项目概况">
        {summaryItems.map(({ label, value, icon: Icon, tone }) => (
          <article className={`ui0802-summary-card ui0802-summary-card--${tone}`} key={label}>
            <span className="ui0802-summary-card__icon" aria-hidden="true">
              <Icon size={42} strokeWidth={2.5} />
            </span>
            <div>
              <h2>{label}</h2>
              <p><strong>{value}</strong><span>个</span></p>
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
                          onClick={() => setDeletedProjectIds((current) => [...current, project.id])}
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
          <p>总计 <strong>{projectTotal}</strong> 条</p>
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

      {isCreateOpen ? (
        <div className="ui0802-modal-layer">
          <button
            className="ui0802-modal-backdrop"
            type="button"
            aria-label="关闭新增项目窗口"
            onClick={closeCreateDialog}
          />
          <div
            ref={dialogRef}
            className="ui0802-project-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
          >
            <header>
              <div>
                <span>投标工作台</span>
                <h2 id="create-project-title">新增项目</h2>
                <p>创建独立项目域，随后进入材料页上传本次招标文件。</p>
              </div>
              <button type="button" aria-label="关闭新增项目窗口" onClick={closeCreateDialog}>
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <form onSubmit={submitProject} noValidate>
              <label>
                项目名称
                <input
                  ref={firstInputRef}
                  name="title"
                  value={draft.title}
                  placeholder="例如：新能源升压站设备采购"
                  onChange={(event) => updateDraft('title', event.target.value)}
                />
              </label>
              <label>
                招标编号
                <input
                  name="code"
                  value={draft.code}
                  placeholder="例如：BV-2026-021"
                  onChange={(event) => updateDraft('code', event.target.value)}
                />
              </label>
              <label>
                招标人
                <input
                  name="buyer"
                  value={draft.buyer}
                  placeholder="请输入招标单位名称"
                  onChange={(event) => updateDraft('buyer', event.target.value)}
                />
              </label>
              <div className="ui0802-deadline-control">
                <label htmlFor={deadlineInputId}>截止时间</label>
                <div className="ui0802-deadline-field">
                  <input
                    ref={deadlineInputRef}
                    id={deadlineInputId}
                    name="deadline"
                    type="datetime-local"
                    min={minimumDeadline}
                    value={draft.deadline}
                    aria-describedby={deadlineHelpId}
                    onChange={(event) => updateDraft('deadline', event.target.value)}
                  />
                  <button
                    className="ui0802-deadline-picker"
                    type="button"
                    aria-label="选择截止日期与时间"
                    onClick={openDeadlinePicker}
                  >
                    <CalendarDays aria-hidden="true" size={18} />
                    <span>选择</span>
                  </button>
                </div>
                <small id={deadlineHelpId} className="ui0802-deadline-help">
                  请选择晚于当前时间的日期和时间，也可使用键盘直接输入。
                </small>
              </div>
              {formError ? <p className="ui0802-project-form-error" role="alert">{formError}</p> : null}
              <footer>
                <button type="button" onClick={closeCreateDialog}>取消</button>
                <button className="is-primary" type="submit">创建并进入材料页</button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
