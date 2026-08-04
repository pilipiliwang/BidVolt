import { useMemo, useState } from 'react';

import { ProjectListPage } from '../domains/projects/ProjectListPage';
import { ProjectOverviewPage } from '../domains/projects/ProjectOverviewPage';
import { TaskProgressDrawer } from '../shared/ui/TaskProgressDrawer';
import { AppShell } from './AppShell';
import { AppLink, useUrlRoute } from './router';

export function App() {
  const route = useUrlRoute();
  const [isTaskDrawerOpen, setTaskDrawerOpen] = useState(false);

  const pageMeta = useMemo(() => {
    if (route.name === 'project-overview') {
      return {
        eyebrow: '项目工作台',
        title: '项目概览',
      };
    }

    if (route.name === 'not-found') {
      return {
        eyebrow: 'BidVolt Web',
        title: '页面未找到',
      };
    }

    return {
      eyebrow: '投标协同中心',
      title: '项目列表',
    };
  }, [route]);

  return (
    <AppShell
      eyebrow={pageMeta.eyebrow}
      title={pageMeta.title}
      currentRoute={route.name}
      onOpenTasks={() => setTaskDrawerOpen(true)}
    >
      {route.name === 'projects' ? <ProjectListPage /> : null}
      {route.name === 'project-overview' ? (
        <ProjectOverviewPage
          projectId={route.projectId}
          onOpenTasks={() => setTaskDrawerOpen(true)}
        />
      ) : null}
      {route.name === 'not-found' ? (
        <section className="empty-page" aria-labelledby="not-found-title">
          <span className="empty-page__code">404</span>
          <h1 id="not-found-title">这个页面还没有接入</h1>
          <p>请返回项目列表继续当前投标工作。</p>
          <AppLink className="button button--primary" to="/projects">
            返回项目列表
          </AppLink>
        </section>
      ) : null}

      <TaskProgressDrawer
        isOpen={isTaskDrawerOpen}
        onClose={() => setTaskDrawerOpen(false)}
      />
    </AppShell>
  );
}
