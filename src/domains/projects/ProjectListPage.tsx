import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, CalendarDays, CircleAlert, Hourglass, Plus, Search, X } from 'lucide-react';

import { AppLink } from '../../app/router';
import type { ProjectSummary } from './project-view-model';
import './ProjectListPage.css';

type ProjectTableRow = ProjectSummary & {
  deadlineHint: string;
  score: string;
};

type ProjectListPageProps = {
  error?: string;
  /** Kept for call-site compatibility; this page now always renders supplied backend records only. */
  isLive?: boolean;
  onArchiveProject?: (projectId: string) => void | Promise<void>;
  onCreateProject: (project: ProjectSummary) => void | Promise<void>;
  onSearchProjects?: (query: string) => void | Promise<void>;
  projects: ProjectSummary[];
  scores?: Record<string, number | string>;
  total?: number;
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

function deadlineState(deadlineValue: string, now = Date.now()) {
  const deadline = new Date(deadlineValue.replace(' ', 'T')).getTime();
  if (!Number.isFinite(deadline)) return { hint: '截止时间待确认', state: 'unknown' as const };
  const difference = deadline - now;
  if (difference <= 0) return { hint: '已截止', state: 'expired' as const };
  const days = Math.ceil(difference / 86_400_000);
  return {
    hint: days === 1 ? '1天内截止' : `${days}天后截止`,
    state: days <= 7 ? 'imminent' as const : 'active' as const,
  };
}

export function ProjectListPage({
  error,
  onArchiveProject,
  onCreateProject,
  onSearchProjects,
  projects,
  scores = {},
  total,
}: ProjectListPageProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [archivingProjectIds, setArchivingProjectIds] = useState<string[]>([]);
  const [archiveErrors, setArchiveErrors] = useState<Record<string, string>>({});
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<NewProjectDraft>(emptyDraft);
  const [formError, setFormError] = useState('');
  const [minimumDeadline, setMinimumDeadline] = useState(getMinimumDeadline);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const deadlineInputRef = useRef<HTMLInputElement>(null);
  const searchTouchedRef = useRef(false);
  const deadlineInputId = useId();
  const deadlineHelpId = useId();

  const projectRows = useMemo<ProjectTableRow[]>(
    () => projects.map((project) => ({
        ...project,
        deadlineHint: deadlineState(project.deadline).hint,
        score: scores[project.id] === undefined ? '-' : String(scores[project.id]),
      })),
    [projects, scores],
  );
  const projectTotal = total ?? projects.length;
  const deadlineSummary = useMemo(
    () => projects.reduce(
      (summary, project) => {
        const state = deadlineState(project.deadline).state;
        if (state === 'imminent') summary.imminent += 1;
        if (state === 'expired') summary.expired += 1;
        return summary;
      },
      { expired: 0, imminent: 0 },
    ),
    [projects],
  );

  const visibleProjects = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return projectRows.filter((project) => {
      const searchableText = `${project.code} ${project.title} ${project.buyer}`.toLocaleLowerCase(
        'zh-CN',
      );
      return !normalisedQuery || searchableText.includes(normalisedQuery);
    });
  }, [projectRows, query]);

  useEffect(() => {
    if (!onSearchProjects || !searchTouchedRef.current) return undefined;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      setSearchError('');
      Promise.resolve(onSearchProjects(query.trim()))
        .catch((searchFailure: unknown) => {
          if (!cancelled) {
            setSearchError(searchFailure instanceof Error
              ? searchFailure.message
              : '项目搜索失败，请稍后重试。');
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [onSearchProjects, query]);

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

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;
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

    try {
      setIsCreating(true);
      await onCreateProject({
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
    } catch (creationError) {
      setFormError(
        creationError instanceof Error ? creationError.message : '项目创建失败，请稍后重试。',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const archiveProject = async (project: ProjectSummary) => {
    if (archivingProjectIds.includes(project.id)) return;
    setArchiveErrors((current) => {
      const next = { ...current };
      delete next[project.id];
      return next;
    });
    if (!onArchiveProject) {
      setArchiveErrors((current) => ({
        ...current,
        [project.id]: '当前环境未配置项目归档能力。',
      }));
      return;
    }

    setArchivingProjectIds((current) => [...current, project.id]);
    try {
      await onArchiveProject(project.id);
    } catch (archiveError) {
      setArchiveErrors((current) => ({
        ...current,
        [project.id]: archiveError instanceof Error
          ? archiveError.message
          : '项目归档失败，请稍后重试。',
      }));
    } finally {
      setArchivingProjectIds((current) => current.filter((id) => id !== project.id));
    }
  };

  const summaryItems = [
    { label: '全部项目', value: projectTotal, icon: Archive, tone: 'green' },
    { label: '临近截止', value: deadlineSummary.imminent, icon: Hourglass, tone: 'orange' },
    { label: '已截止', value: deadlineSummary.expired, icon: CircleAlert, tone: 'red' },
  ] as const;

  return (
    <div className="ui0802-project-page">
      <h2 className="sr-only">把每次投标沉淀成清晰、可追溯的工作流</h2>
      <div className="ui0802-project-toolbar">
        <label className="ui0802-project-search">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">搜索项目</span>
          <input
            type="search"
            value={query}
            placeholder="搜索项目、编号或招标人"
            aria-busy={isSearching}
            onChange={(event) => {
              searchTouchedRef.current = true;
              setQuery(event.target.value);
            }}
          />
          {isSearching ? <small role="status">正在查询后端全部项目…</small> : null}
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
      {searchError ? <p className="ui0802-project-form-error" role="alert">{searchError}</p> : null}

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
        {error ? <p className="ui0802-project-form-error" role="alert">{error}</p> : null}
        {visibleProjects.length ? (
          <div className="ui0802-project-table-scroll">
            <table className="ui0802-project-table">
              <thead>
                <tr>
                  <th scope="col">项目名称</th>
                  <th scope="col">招标编号</th>
                  <th scope="col">截止时间</th>
                  <th scope="col">评审得分</th>
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
                        <AppLink
                          to={`/projects/${encodeURIComponent(project.id)}/overview`}
                          aria-label={`进入${project.title}工作台`}
                        >
                          进入
                        </AppLink>
                        <button
                          disabled={!onArchiveProject || archivingProjectIds.includes(project.id)}
                          title={onArchiveProject ? '归档项目' : '当前环境未配置项目归档能力'}
                          type="button"
                          aria-label={`从列表删除${project.title}`}
                          onClick={() => void archiveProject(project)}
                        >
                          {archivingProjectIds.includes(project.id) ? '删除中…' : '删除'}
                        </button>
                        {archiveErrors[project.id] ? (
                          <span className="ui0802-row-action-error" role="alert">
                            {archiveErrors[project.id]}
                          </span>
                        ) : null}
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
            <span>后端数据</span>
            <strong>第 1 / 1 页</strong>
            <span>展示 {visibleProjects.length} 条</span>
          </div>
        </footer>
      </section>

      {isCreateOpen ? (
        <div className="ui0802-modal-layer">
          <button
            className="ui0802-modal-backdrop"
            disabled={isCreating}
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
              <button disabled={isCreating} type="button" aria-label="关闭新增项目窗口" onClick={closeCreateDialog}>
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
                <button disabled={isCreating} type="button" onClick={closeCreateDialog}>取消</button>
                <button className="is-primary" disabled={isCreating} type="submit">
                  {isCreating ? '创建中…' : '创建并进入材料页'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
