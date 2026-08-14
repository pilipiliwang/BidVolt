import { FileCheck2, FolderOpen } from 'lucide-react';

import { AppLink } from '../../app/router';
import './project-workspace-tabs.css';

export type ProjectWorkspaceTab = 'materials' | 'overview';

type ProjectWorkspaceTabsProps = {
  activeTab: ProjectWorkspaceTab;
  projectId: string;
};

const tabDefinitions = [
  { id: 'materials' as const, label: '项目资料', Icon: FolderOpen },
  { id: 'overview' as const, label: '标书成果预览', Icon: FileCheck2 },
];

export function ProjectWorkspaceTabs({ activeTab, projectId }: ProjectWorkspaceTabsProps) {
  const encodedProjectId = encodeURIComponent(projectId);

  return (
    <nav aria-label="项目工作区页面" className="project-workspace-tabs">
      <div className="project-workspace-tabs__list">
        {tabDefinitions.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          const to = id === 'materials'
            ? `/projects/${encodedProjectId}/materials`
            : `/projects/${encodedProjectId}/overview`;

          return (
            <AppLink
              aria-current={active ? 'page' : undefined}
              className={`project-workspace-tabs__link${active ? ' project-workspace-tabs__link--active' : ''}`}
              key={id}
              to={to}
            >
              <Icon aria-hidden="true" size={17} />
              {label}
            </AppLink>
          );
        })}
      </div>
    </nav>
  );
}
