import { describe, expect, it, vi } from 'vitest';

import { createEmptyTenantDomainState, createTenantGenerationGuard } from './tenant-isolation';

describe('tenant state isolation', () => {
  it('invalidates callbacks captured by the previous tenant', () => {
    const guard = createTenantGenerationGuard();
    const previousTenant = guard.capture();
    const commit = vi.fn();

    guard.invalidate();

    expect(guard.commit(previousTenant, commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(guard.commit(guard.capture(), commit)).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('creates a fresh empty state before another enterprise is authenticated', () => {
    const first = createEmptyTenantDomainState();
    const second = createEmptyTenantDomainState();

    expect(second).toEqual({
      editor: null,
      enterpriseAssets: [],
      enterpriseCategories: [],
      enterpriseIngestions: [],
      loadingProjectId: null,
      projectData: {},
      projects: [],
      projectsTotal: 0,
      reviewProviders: [],
      snapshotDetail: null,
      statusMessage: null,
      taskDrawerProjectId: null,
    });
    expect(second.projects).not.toBe(first.projects);
    expect(second.projectData).not.toBe(first.projectData);
  });
});
