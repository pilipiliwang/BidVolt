import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectWorkspaceTabs } from './ProjectWorkspaceTabs';

describe('ProjectWorkspaceTabs', () => {
  it('links both shared workspace pages and exposes the active tab', () => {
    render(<ProjectWorkspaceTabs activeTab="materials" projectId="project/7" />);

    const materials = screen.getByRole('tab', { name: '项目资料' });
    const overview = screen.getByRole('tab', { name: '标书成果预览' });

    expect(materials).toHaveAttribute('href', '/projects/project%2F7/materials');
    expect(materials).toHaveAttribute('aria-selected', 'true');
    expect(materials).toHaveAttribute('aria-current', 'page');
    expect(materials).toHaveClass('project-workspace-tabs__link--active');
    expect(overview).toHaveAttribute('href', '/projects/project%2F7/overview');
    expect(overview).toHaveAttribute('aria-selected', 'false');
    expect(overview).not.toHaveAttribute('aria-current');
  });
});
