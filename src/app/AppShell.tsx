import { useEffect, useId, useState, type ReactNode } from 'react';
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

type AppShellProps = {
  children: ReactNode;
  currentRoute: AppRoute['name'];
  eyebrow: string;
  onOpenTasks: () => void;
  title: string;
};

const navigationItems = [
  {
    label: '投标项目',
    caption: '材料、成果与交付',
    icon: FolderKanban,
    href: '/projects',
    activeFor: ['projects', 'project-overview'] satisfies AppRoute['name'][],
  },
  {
    label: '企业资料',
    caption: '跨项目长期复用',
    icon: Building2,
    disabled: true,
  },
  {
    label: '评审中心',
    caption: '规则与外部评审',
    icon: ClipboardCheck,
    disabled: true,
  },
  {
    label: '报价分析',
    caption: '历史样本只读测算',
    icon: CircleDollarSign,
    disabled: true,
  },
];

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
  onNavigate,
}: {
  currentRoute: AppRoute['name'];
  onNavigate?: () => void;
}) {
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
                  <em>即将接入</em>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WorkspaceCard() {
  return (
    <div className="workspace-card">
      <span className="workspace-card__icon" aria-hidden="true">
        <BookOpenText size={18} />
      </span>
      <div>
        <small>当前企业</small>
        <strong>华东智造科技</strong>
      </div>
      <ChevronDown aria-hidden="true" size={16} />
    </div>
  );
}

export function AppShell({
  children,
  currentRoute,
  eyebrow,
  onOpenTasks,
  title,
}: AppShellProps) {
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavId = useId();

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileNavOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <aside className="desktop-sidebar">
        <Brand />
        <WorkspaceCard />
        <PrimaryNavigation currentRoute={currentRoute} />
        <div className="sidebar-footnote">
          <span aria-hidden="true" />
          <p>
            <strong>数据边界已启用</strong>
            <small>企业资料与项目材料独立</small>
          </p>
        </div>
      </aside>

      <div className="app-shell__body">
        <header className="topbar">
          <div className="mobile-topbar">
            <button
              className="icon-button"
              type="button"
              aria-label="打开导航"
              aria-controls={mobileNavId}
              aria-expanded={isMobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
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
              onClick={onOpenTasks}
              aria-label="查看任务进度，当前有一个任务运行中"
            >
              <Activity aria-hidden="true" size={17} />
              <span>任务进度</span>
              <em>1</em>
            </button>
            <button className="icon-button icon-button--quiet" type="button" aria-label="通知">
              <Bell aria-hidden="true" size={19} />
              <span className="notification-dot" aria-hidden="true" />
            </button>
            <button className="profile-button" type="button" aria-label="打开账户菜单">
              <span aria-hidden="true">林</span>
              <div>
                <strong>林若川</strong>
                <small>投标负责人</small>
              </div>
              <ChevronDown aria-hidden="true" size={15} />
            </button>
          </div>
        </header>

        <main className="page-content" id="main-content">
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
          <aside className="mobile-nav" id={mobileNavId} aria-label="移动端导航">
            <div className="mobile-nav__header">
              <Brand />
              <button
                className="icon-button"
                type="button"
                aria-label="关闭导航"
                onClick={() => setMobileNavOpen(false)}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <WorkspaceCard />
            <PrimaryNavigation
              currentRoute={currentRoute}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
