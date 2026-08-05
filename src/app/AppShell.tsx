import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Bell,
  BookOpenText,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  Menu,
  UserRound,
  X,
} from 'lucide-react';

import { BrandLogo } from '../shared/ui/BrandLogo';
import { getProjectSummary } from '../domains/projects/project-view-model';
import '../styles/ui0802-shell.css';
import { AppLink, type AppRoute } from './router';

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

type AppShellProps = {
  children: ReactNode;
  currentRoute: AppRoute['name'];
  currentProjectId?: string;
  eyebrow: string;
  enterpriseName: string;
  onOpenTasks: () => void;
  taskCount: number;
  title: string;
  user: {
    displayName: string;
    role: string;
  };
};

function getNavigationItems(projectId?: string) {
  const encodedProjectId = projectId ? encodeURIComponent(projectId) : undefined;
  return [
    {
      label: '投标工作台',
      ariaLabel: '投标项目',
      caption: '项目材料、成果与交付',
      icon: FolderKanban,
      href: '/projects',
      activeFor: [
        'projects',
        'project-overview',
        'project-materials',
      ] satisfies AppRoute['name'][],
    },
    {
      label: '企业资料库',
      ariaLabel: undefined,
      caption: '跨项目长期复用',
      icon: Building2,
      href: '/enterprise-assets',
      activeFor: ['enterprise-assets'] satisfies AppRoute['name'][],
    },
    {
      label: '评审中心',
      ariaLabel: undefined,
      caption: projectId ? '规则与外部评审' : '请先进入一个项目',
      icon: ClipboardCheck,
      href: encodedProjectId ? `/projects/${encodedProjectId}/review` : undefined,
      activeFor: ['review-center'] satisfies AppRoute['name'][],
      visuallyHidden: true,
    },
    {
      label: '历史报价',
      ariaLabel: undefined,
      caption: '外部历史样本只读查询',
      icon: CircleDollarSign,
      href: '/history-prices',
      activeFor: ['history-prices'] satisfies AppRoute['name'][],
    },
  ];
}

function Brand() {
  return (
    <AppLink className="brand" to="/projects" aria-label="AI电投助手首页">
      <BrandLogo className="brand__mark" />
      <strong>AI电投助手</strong>
    </AppLink>
  );
}

function SidebarPowerScenery() {
  return (
    <svg className="ui0802-sidebar-scenery" viewBox="0 0 264 470" aria-hidden="true">
      <g className="ui0802-sidebar-tower ui0802-sidebar-tower--small">
        <path d="M65 194 28 414M65 194l39 220M37 350h57M42 307h47M49 263h33M55 222h21M65 194v220M30 413h71M37 349l64 64M93 349l-63 64M42 307l51 42M89 307l-52 42M49 263l40 44M82 263l-40 44" />
      </g>
      <g className="ui0802-sidebar-tower ui0802-sidebar-tower--large">
        <path d="M169 99 113 414M169 99l62 315M127 332h87M135 270h68M146 208h46M156 147h27M169 99v315M117 412h109M127 331l96 81M211 331l-94 81M135 269l76 62M203 269l-76 62M146 207l57 62M192 207l-57 62M156 146l36 61M183 146l-37 61M148 163h43" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1" opacity=".46">
        <path d="M-25 386c72-36 122-6 180 8 50 13 82 3 134-29" />
        <path d="M-25 398c72-36 122-6 180 8 50 13 82 3 134-29" />
        <path d="M-25 411c72-36 122-6 180 8 50 13 82 3 134-29" />
      </g>
    </svg>
  );
}

function PrimaryNavigation({
  currentRoute,
  currentProjectId,
  onNavigate,
}: {
  currentRoute: AppRoute['name'];
  currentProjectId?: string;
  onNavigate?: () => void;
}) {
  const navigationItems = getNavigationItems(currentProjectId);

  return (
    <nav className="primary-nav" aria-label="主导航">
      <p className="primary-nav__label">工作空间</p>
      <ul>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.activeFor?.some((routeName) => routeName === currentRoute) ?? false;

          return (
            <li key={item.label}>
              {item.href ? (
                <AppLink
                  className={`nav-item${isActive ? ' nav-item--active' : ''}${'visuallyHidden' in item && item.visuallyHidden ? ' nav-item--visually-hidden' : ''}`}
                  to={item.href}
                  aria-label={item.ariaLabel}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <Icon aria-hidden="true" size={19} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.caption}</small>
                  </span>
                </AppLink>
              ) : (
                <span
                  className={`nav-item nav-item--disabled${'visuallyHidden' in item && item.visuallyHidden ? ' nav-item--visually-hidden' : ''}`}
                  aria-disabled="true"
                >
                  <Icon aria-hidden="true" size={19} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.caption}</small>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WorkspaceCard({ enterpriseName }: { enterpriseName: string }) {
  return (
    <div className="workspace-card">
      <span className="workspace-card__icon" aria-hidden="true">
        <BookOpenText size={18} />
      </span>
      <div>
        <small>当前企业</small>
        <strong>{enterpriseName}</strong>
      </div>
      <ChevronDown aria-hidden="true" size={16} />
    </div>
  );
}

export function AppShell({
  children,
  currentRoute,
  currentProjectId,
  eyebrow,
  enterpriseName,
  onOpenTasks,
  taskCount,
  title,
  user,
}: AppShellProps) {
  const isProjectMode =
    currentProjectId !== undefined &&
    ['project-overview', 'project-materials', 'review-center', 'pricing-center'].includes(
      currentRoute,
    );
  const projectSummary = currentProjectId ? getProjectSummary(currentProjectId) : undefined;
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavId = useId();
  const mobileNavRef = useRef<HTMLElement>(null);
  const mobileNavCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);

  const openMobileNavigation = () => {
    // Avoid leaving focus inside content that becomes inert/aria-hidden during the same update.
    mobileNavTriggerRef.current?.blur();
    setMobileNavOpen(true);
  };

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined;
    }

    mobileNavCloseButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !mobileNavRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(mobileNavRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        mobileNavRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1)!;
      const activeElement = document.activeElement;
      const focusIsOutsideNavigation = !mobileNavRef.current.contains(activeElement);

      if (event.shiftKey && (activeElement === firstElement || focusIsOutsideNavigation)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || focusIsOutsideNavigation)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (mobileNavTriggerRef.current?.isConnected) {
        mobileNavTriggerRef.current.focus();
      }
    };
  }, [isMobileNavOpen]);

  return (
    <div className={`app-shell ui0802-shell${isProjectMode ? ' ui0802-shell--project' : ''}`}>
      <a
        className="skip-link"
        href="#main-content"
        aria-hidden={isMobileNavOpen || undefined}
        inert={isMobileNavOpen || undefined}
      >
        跳到主要内容
      </a>

      <aside
        className="desktop-sidebar"
        aria-hidden={isMobileNavOpen || undefined}
        inert={isMobileNavOpen || undefined}
      >
        <Brand />
        <PrimaryNavigation currentProjectId={currentProjectId} currentRoute={currentRoute} />
        <SidebarPowerScenery />
        <div className="ui0802-sidebar-footer">
          <div className="sidebar-footnote" title={`当前企业：${enterpriseName}`}>
            <span aria-hidden="true" />
            <p>
              <strong>数据边界已启用</strong>
              <small>企业资料与项目材料独立</small>
            </p>
          </div>
          <button className="ui0802-sidebar-user" type="button" disabled aria-label={`${user.displayName}，${user.role}`}>
            <UserRound aria-hidden="true" size={27} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      <div
        className="app-shell__body"
        aria-hidden={isMobileNavOpen || undefined}
        inert={isMobileNavOpen || undefined}
      >
        <header className={`topbar${isProjectMode ? ' ui0802-project-topbar' : ''}`}>
          {isProjectMode ? (
            <>
              <div className="ui0802-project-topbar__brand">
                <Brand />
              </div>
              <AppLink className="ui0802-back-to-workbench" to="/projects">
                <ChevronLeft aria-hidden="true" size={23} />
                <span>返回投标工作台</span>
              </AppLink>
              <div className="ui0802-project-context" aria-label="当前项目信息">
                <p>
                  <span>项目名称：</span>
                  <strong>{projectSummary?.title ?? currentProjectId}</strong>
                </p>
                <i aria-hidden="true" />
                <p>
                  <span>截止日期：</span>
                  <time>{projectSummary?.deadline.split(' ')[0] ?? '待确认'}</time>
                  <CalendarDays aria-hidden="true" size={21} />
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mobile-topbar">
                <button
                  ref={mobileNavTriggerRef}
                  className="icon-button"
                  type="button"
                  aria-label="打开导航"
                  aria-controls={mobileNavId}
                  aria-expanded={isMobileNavOpen}
                  onClick={openMobileNavigation}
                >
                  <Menu aria-hidden="true" size={21} />
                </button>
                <Brand />
              </div>

              <div className="topbar__heading">
                <span>{eyebrow}</span>
                <h1>{currentRoute === 'projects' ? '投标工作台' : title}</h1>
              </div>
            </>
          )}

          <div className={`topbar__actions${currentRoute === 'projects' || isProjectMode ? ' topbar__actions--quiet' : ''}`}>
            <button
              className="task-status-button"
              type="button"
              disabled={taskCount === 0}
              onClick={() => taskCount > 0 && onOpenTasks()}
              aria-label={
                taskCount > 0
                  ? `查看任务进度，当前有 ${taskCount} 个任务运行中`
                  : '当前页面没有项目任务'
              }
            >
              <Activity aria-hidden="true" size={17} />
              <span>任务进度</span>
              <em>{taskCount}</em>
            </button>
            <button
              className="icon-button icon-button--quiet"
              type="button"
              aria-label="通知（MVP 暂未开放）"
              disabled
            >
              <Bell aria-hidden="true" size={19} />
              <span className="notification-dot" aria-hidden="true" />
            </button>
            <button
              className="profile-button"
              type="button"
              aria-label="账户菜单（MVP 暂未开放）"
              disabled
            >
              <span aria-hidden="true">{user.displayName.slice(0, 1)}</span>
              <div>
                <strong>{user.displayName}</strong>
                <small>{user.role}</small>
              </div>
              <ChevronDown aria-hidden="true" size={15} />
            </button>
          </div>
        </header>

        <main className="page-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {isMobileNavOpen ? (
        <div className="mobile-nav-layer">
          <button
            className="mobile-nav-backdrop"
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            ref={mobileNavRef}
            className="mobile-nav"
            id={mobileNavId}
            role="dialog"
            aria-modal="true"
            aria-label="移动端导航"
            tabIndex={-1}
          >
            <div className="mobile-nav__header">
              <Brand />
              <button
                ref={mobileNavCloseButtonRef}
                className="icon-button"
                type="button"
                aria-label="关闭导航"
                onClick={() => setMobileNavOpen(false)}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <WorkspaceCard enterpriseName={enterpriseName} />
            <PrimaryNavigation
              currentProjectId={currentProjectId}
              currentRoute={currentRoute}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
