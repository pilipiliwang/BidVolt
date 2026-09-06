import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, CircleAlert, Hourglass, Plus, Search, X } from 'lucide-react';

import { AppLink } from '../../app/router';
import type { ProjectSummary } from './project-view-model';
import { hasRememberedGenerateWorkflow } from './project-workflow-mode';
import './ProjectListPage.css';

type ProjectTableRow = ProjectSummary & {
  deadlineHint: string;
  executionStatus: '上传企业资料' | '上传材料' | '标书制作/审核' | '成果生成';
  score: string;
};

type ProjectListPageProps = {
  error?: string;
  enterpriseReady?: boolean;
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
  authorName: string;
  title: string;
};

const emptyDraft: NewProjectDraft = {
  authorName: '',
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

export function formatDateOnly(value: string) {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? value;
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
  enterpriseReady = true,
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
  const creationPendingRef = useRef(false);
  const [draft, setDraft] = useState<NewProjectDraft>(emptyDraft);
  const [formError, setFormError] = useState('');
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const searchTouchedRef = useRef(false);

  const projectRows = useMemo<ProjectTableRow[]>(
    () => projects.map((project) => ({
        ...project,
        deadline: formatDateOnly(project.deadline) || '待解析',
        deadlineHint: deadlineState(project.deadline).hint,
        executionStatus: !enterpriseReady
          ? '上传企业资料'
          : project.stage === '待提交'
            ? '成果生成'
            : project.stage === '方案编制' || project.stage === '内部评审'
              ? '标书制作/审核'
              : '上传材料',
        score: scores[project.id] === undefined ? '-' : String(scores[project.id]),
        updatedAt: formatDateOnly(project.updatedAt),
      })),
    [enterpriseReady, projects, scores],
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

  useEffect(() => {
    if (!isCreateOpen) return undefined;
    firstInputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!creationPendingRef.current) closeCreateDialog();
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
    if (creationPendingRef.current) return;
    const normalized = {
      authorName: draft.authorName.trim(),
      title: draft.title.trim(),
    };
    if (!normalized.title || !normalized.authorName) {
      setFormError('请填写项目名称和编写负责人。');
      return;
    }

    try {
      creationPendingRef.current = true;
      setIsCreating(true);
      await onCreateProject({
        // The create API supplies the persisted identity; tender numbers are not IDs.
        id: '',
        code: '',
        authorName: normalized.authorName,
        packageNo: '',
        title: normalized.title,
        buyer: '',
        stage: '材料解析',
        progress: 0,
        deadline: '',
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
      creationPendingRef.current = false;
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
          <div className="ui0802-project-table-scroll" role="region" aria-label="项目列表滚动区域" tabIndex={0}>
            <table className="ui0802-project-table" aria-label="投标项目">
              <thead>
                <tr>
                  <th scope="col">项目名称</th>
                  <th scope="col">招标编号</th>
                  <th scope="col">截止时间</th>
                  <th scope="col">执行状态</th>
                  <th scope="col">评审得分</th>
                  <th scope="col">最近更新时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project) => (
                  <tr key={project.id}>
                    <td data-label="项目名称">
                      <div className="ui0802-project-cell-value">
                        <span className="ui0802-project-title" title={project.title}>{project.title}</span>
                        <span className="ui0802-project-buyer" title={project.buyer}>{project.buyer}</span>
                      </div>
                    </td>
                    <td data-label="招标编号"><div className="ui0802-project-cell-value ui0802-project-code">{project.code || '待解析'}</div></td>
                    <td data-label="截止时间">
                      <div className="ui0802-project-cell-value">
                        <time>{project.deadline}</time>
                        <span className="ui0802-deadline-hint">（{project.deadlineHint}）</span>
                      </div>
                    </td>
                    <td data-label="执行状态"><div className="ui0802-project-cell-value"><span className="ui0802-execution-status">{project.executionStatus}</span></div></td>
                    <td data-label="评审得分"><div className="ui0802-project-cell-value">{project.score}</div></td>
                    <td data-label="最近更新时间"><div className="ui0802-project-cell-value">{project.updatedAt}</div></td>
                    <td data-label="操作">
                      <div className="ui0802-project-cell-value ui0802-row-actions">
                        <AppLink
                          to={hasRememberedGenerateWorkflow(project.id)
                            ? `/projects/${encodeURIComponent(project.id)}/materials?workflow=generate`
                            : `/projects/${encodeURIComponent(project.id)}/overview`}
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
                <p>填写名称和负责人，其余项目信息在上传招标材料后由系统解析补全。</p>
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
                  disabled={isCreating}
                  required
                  maxLength={200}
                  value={draft.title}
                  placeholder="例如：新能源升压站设备采购"
                  onChange={(event) => updateDraft('title', event.target.value)}
                />
              </label>
              <label>
                编写负责人
                <input
                  name="authorName"
                  disabled={isCreating}
                  required
                  maxLength={100}
                  value={draft.authorName}
                  placeholder="请输入编写负责人姓名"
                  onChange={(event) => updateDraft('authorName', event.target.value)}
                />
              </label>
              {[
                ['code', '招标编号'],
                ['buyer', '招标人'],
                ['packageNo', '包号'],
                ['deadline', '截止时间'],
              ].map(([name, label]) => (
                <label className="ui0802-project-auto-field" key={name}>
                  {label}
                  <input
                    disabled
                    name={name}
                    placeholder="系统解析后填写"
                    value=""
                    readOnly
                  />
                </label>
              ))}
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
