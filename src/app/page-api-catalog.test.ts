import { describe, expect, it } from 'vitest';

import {
  pageApiCatalog,
  pageApiOperationMatches,
} from './page-api-catalog';

describe('page API catalog', () => {
  it('uses stable unique operation ids on every supported route', () => {
    const routes = [
      { name: 'login' as const },
      { name: 'projects' as const },
      { name: 'enterprise-assets' as const },
      { name: 'history-prices' as const },
      { name: 'project-overview' as const, projectId: '7' },
      { name: 'project-materials' as const, projectId: '7' },
      { name: 'review-center' as const, projectId: '7' },
      { name: 'pricing-center' as const, projectId: '7' },
      {
        name: 'deliverable-editor' as const,
        projectId: '7',
        deliverableId: 'technical' as const,
        versionId: '6',
      },
    ];

    routes.forEach((route) => {
      const ids = pageApiCatalog(route).map((item) => item.id);
      expect(new Set(ids).size, route.name).toBe(ids.length);
    });
  });

  it('lists automatic, user-triggered, and missing backend capabilities for materials', () => {
    const catalog = pageApiCatalog({ name: 'project-materials', projectId: 'project/7' });
    const ids = catalog.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining([
      'auth-me',
      'bootstrap-enterprise-assets',
      'project-detail',
      'project-materials',
      'project-requirements',
      'project-tasks',
      'project-upload',
      'tender-notice-import',
      'tender-notice-import-status',
      'snapshot-detail',
      'task-create',
      'requirement-confirm',
      'completed-bid-purpose',
    ]));
    expect(catalog.find((item) => item.id === 'requirement-confirm')?.unavailableReason)
      .toContain('尚未提供');
    expect(catalog.find((item) => item.id === 'completed-bid-purpose')?.unavailableReason)
      .toContain('刷新后无法恢复');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('distinguishes project query parameters and dynamic child resources', () => {
    const catalog = pageApiCatalog({ name: 'project-materials', projectId: '7' });
    const materials = catalog.find((item) => item.id === 'project-materials')!;
    const snapshot = catalog.find((item) => item.id === 'snapshot-detail')!;

    expect(pageApiOperationMatches(materials, {
      method: 'GET',
      path: '/files?target=project&project_id=7&page=1&size=100',
    })).toBe(true);
    expect(pageApiOperationMatches(materials, {
      method: 'GET',
      path: '/files?target=project&project_id=8&page=1&size=100',
    })).toBe(false);
    expect(pageApiOperationMatches(snapshot, {
      method: 'GET',
      path: '/projects/7/snapshots/21',
    })).toBe(true);
    expect(pageApiOperationMatches(snapshot, {
      method: 'GET',
      path: '/projects/8/snapshots/21',
    })).toBe(false);
  });

  it('does not mistake quote history for a project quote detail call', () => {
    const detail = pageApiCatalog({ name: 'pricing-center', projectId: '7' })
      .find((item) => item.id === 'project-quote-detail')!;

    expect(pageApiOperationMatches(detail, { method: 'GET', path: '/quotes/31' })).toBe(true);
    expect(pageApiOperationMatches(detail, { method: 'GET', path: '/quotes/history' })).toBe(false);
    expect(pageApiOperationMatches(detail, { method: 'POST', path: '/quotes/31' })).toBe(false);
  });

  it('lists real editor session lifecycle endpoints', () => {
    const catalog = pageApiCatalog({
      name: 'deliverable-editor',
      projectId: '7',
      deliverableId: 'technical',
      versionId: '6',
    });
    const ids = catalog.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining([
      'deliverable-version',
      'editor-create-session',
      'editor-list-sessions',
      'editor-get-session',
      'editor-checkpoint',
      'editor-complete',
      'editor-cancel',
      'deliverable-download',
    ]));
  });

  it('marks login password recovery and enterprise revision content as unavailable', () => {
    const login = pageApiCatalog({ name: 'login' });
    const enterprise = pageApiCatalog({ name: 'enterprise-assets' });

    expect(login.find((item) => item.id === 'auth-forgot-password')?.unavailableReason)
      .toContain('尚未提供');
    expect(enterprise.find((item) => item.id === 'enterprise-revision-content')?.unavailableReason)
      .toContain('版本摘要');
  });
});
