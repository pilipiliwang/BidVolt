import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Bell,
  BookOpenText,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  Menu,
  X,
  Zap,
} from 'lucide-react';

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
      label: '投标项目',
      caption: '材料、成果与交付',
      icon: FolderKanban,
      href: '/projects',
      activeFor: [
        'projects',
        'project-overview',
        'project-materials',
      ] satisfies AppRoute['name'][],
    },
    {
      label: '企业资料',
      caption: '跨项目长期复用',
      icon: Building2,
      href: '/enterprise-assets',
      activeFor: ['enterprise-assets'] satisfies AppRoute['name'][],
    },
    {
      label: '评审中心',
      caption: projectId ? '规则与外部评审' : '请先进入一个项目',
      icon: ClipboardCheck,
      href: encodedProjectId ? `/projects/${encodedProjectId}/review` : undefined,
      activeFor: ['review-center'] satisfies AppRoute['name'][],
    },
    {
      label: '报价分析',
      caption: projectId ? '历史样本只读测算' : '请先进入一个项目',
      icon: CircleDollarSign,
      href: encodedProjectId ? `/projects/${encodedProjectId}/pricing` : undefined,
      activeFor: ['pricing-center'] satisfies AppRoute['name'][],
    },
  ];
}

function Brand() {
  return (
    <AppLink className="brand" to="/projects" aria-label="BidVolt 项目首页">
      <span className="brand__mark" aria-hidden="true">
        <Zap size={21} strokeWidth={2.5} />
      </span>
      <span>
        <strong>BidVolt</strong>
        <small>智能投标工作台</small>
      </span>
    </AppLink>
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
                  className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                  to={item.href}
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
                <span className="nav-item nav-item--disabled" aria-disabled="true">
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
    <div className="app-shell">
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
        <WorkspaceCard enterpriseName={enterpriseName} />
        <PrimaryNavigation currentProjectId={currentProjectId} currentRoute={currentRoute} />
        <div className="sidebar-footnote">
          <span aria-hidden="true" />
          <p>
            <strong>数据边界已启用</strong>
            <small>企业资料与项目材料独立</small>
          </p>
        </div>
      </aside>

      <div
        className="app-shell__body"
        aria-hidden={isMobileNavOpen || undefined}
        inert={isMobileNavOpen || undefined}
      >
        <header className="topbar">
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
            <h1>{title}</h1>
          </div>

          <div className="topbar__actions">
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
