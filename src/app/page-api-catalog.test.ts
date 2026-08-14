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
      'task-status',
      'task-stream',
      'project-upload',
      'tender-notice-import',
      'tender-notice-import-status',
      'snapshot-detail',
      'task-create',
      'requirement-confirm',
      'completed-bid-purpose',
      'completed-bid-summary',
      'pending-check-summary',
    ]));
    expect(catalog.find((item) => item.id === 'requirement-confirm')?.unavailableReason)
      .toContain('尚未提供');
    expect(catalog.find((item) => item.id === 'completed-bid-purpose')?.unavailableReason)
      .toContain('刷新后无法恢复');
    expect(catalog.find((item) => item.id === 'completed-bid-summary')).toMatchObject({
      method: 'GET',
      path: '/projects/project%2F7/completed-bids/summary',
    });
    expect(catalog.find((item) => item.id === 'completed-bid-summary')?.unavailableReason)
      .toContain('document_role');
    expect(catalog.find((item) => item.id === 'pending-check-summary')).toMatchObject({
      method: 'GET',
      path: '/projects/project%2F7/check/latest',
    });
    expect(catalog.find((item) => item.id === 'pending-check-summary')?.unavailableReason)
      .toContain('不会为读取数量触发 POST check');
    expect(catalog.find((item) => item.id === 'task-status')?.notIntegratedReason)
      .toBeUndefined();
    expect(catalog.find((item) => item.id === 'task-stream')?.notIntegratedReason)
      .toBeUndefined();
    expect(catalog.find((item) => item.id === 'task-create')?.feature)
      .toBe('提交任务（仅入队）');
    expect(catalog.filter((item) => item.isTask).map((item) => item.id)).toEqual([
      'project-tasks',
      'task-status',
      'task-stream',
      'task-create',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('documents and matches integrated task polling and authenticated SSE streaming', () => {
    const catalog = pageApiCatalog({ name: 'project-overview', projectId: '7' });
    const status = catalog.find((item) => item.id === 'task-status')!;
    const stream = catalog.find((item) => item.id === 'task-stream')!;

    expect(status).toMatchObject({ method: 'GET', path: '/tasks/{taskId}' });
    expect(stream).toMatchObject({ method: 'GET', path: '/tasks/{taskId}/stream' });
    expect(stream.notIntegratedReason).toBeUndefined();
    expect(pageApiOperationMatches(status, { method: 'GET', path: '/tasks/31' })).toBe(true);
    expect(pageApiOperationMatches(stream, { method: 'GET', path: '/tasks/31/stream' })).toBe(true);
  });

  it('documents and matches dynamic deliverable version-list requests on the overview', () => {
    const catalog = pageApiCatalog({ name: 'project-overview', projectId: '7' });
    const versions = catalog.find((item) => item.id === 'project-deliverable-versions')!;

    expect(versions).toMatchObject({
      method: 'GET',
      path: '/deliverables/{deliverableId}/versions',
    });
    expect(pageApiOperationMatches(versions, {
      method: 'GET',
      path: '/deliverables/31/versions',
    })).toBe(true);
    expect(pageApiOperationMatches(versions, {
      method: 'GET',
      path: '/deliverables/31/versions/6',
    })).toBe(false);
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
