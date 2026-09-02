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
      { name: 'bid-market-library' as const },
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

  it('lists the latest Agent, tender notice, requirement, and check contracts for materials', () => {
    const catalog = pageApiCatalog({ name: 'project-materials', projectId: 'project/7' });
    const ids = catalog.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining([
      'auth-me',
      'bootstrap-enterprise-assets',
      'image-describe-progress',
      'project-detail',
      'project-materials',
      'project-task-history',
      'project-task-detail',
      'project-task-stream',
      'project-requirements',
      'project-file-image-descriptions',
      'project-upload',
      'agent-run-start',
      'agent-run-status',
      'agent-run-stream',
      'agent-run-questions',
      'agent-run-answer',
      'agent-run-chat',
      'agent-pre-chat',
      'project-response-package',
      'agent-artifact-download',
      'tender-notice-import',
      'tender-notice-list',
      'tender-notice-detail',
      'snapshot-detail',
      'requirements-upsert',
      'requirement-confirm',
      'requirement-correct',
      'project-final-check',
      'project-final-check-detail',
    ]));
    expect(catalog.find((item) => item.id === 'requirement-confirm')).toMatchObject({
      method: 'PUT',
      path: '/projects/project%2F7/requirements/{requirementId}/confirm',
    });
    expect(catalog.find((item) => item.id === 'requirement-correct')).toMatchObject({
      method: 'PUT',
      path: '/projects/project%2F7/requirements/{requirementId}/correct',
    });
    expect(catalog.find((item) => item.id === 'tender-notice-list')).toMatchObject({
      method: 'GET',
      path: '/projects/project%2F7/tender-notices',
    });
    expect(ids).not.toEqual(expect.arrayContaining([
      'completed-bid-purpose',
      'completed-bid-summary',
      'pending-check-summary',
      'project-file-purpose',
      'task-create',
      'task-stream',
    ]));
    expect(catalog.some((item) => item.path.includes('/assembly/'))).toBe(false);
    expect(catalog.some((item) => item.path.includes('/completed-bids'))).toBe(false);
    expect(catalog.some((item) => item.path.includes('/check/latest'))).toBe(false);
    expect(catalog.some((item) => item.path.includes('document_role='))).toBe(false);
    expect(catalog.filter((item) => item.isTask).map((item) => item.id)).toEqual([
      'project-task-history',
      'project-task-detail',
      'project-task-stream',
      'agent-run-start',
      'agent-run-status',
      'agent-run-stream',
      'agent-run-questions',
      'agent-run-answer',
      'agent-run-chat',
    ]);
    for (const id of [
      'project-final-check',
      'project-final-check-detail',
      'project-export',
      'project-export-status',
      'project-delivery-package',
      'agent-artifact-download',
      'project-archive',
      'project-enterprise-ingest',
      'requirement-detail',
      'requirements-upsert',
    ]) {
      expect(catalog.find((item) => item.id === id)?.notIntegratedReason).toBeTruthy();
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches Agent status, SSE replay, questions, answers, chat, packages, and artifacts', () => {
    const catalog = pageApiCatalog({ name: 'project-overview', projectId: '7' });
    const status = catalog.find((item) => item.id === 'agent-run-status')!;
    const stream = catalog.find((item) => item.id === 'agent-run-stream')!;
    const questions = catalog.find((item) => item.id === 'agent-run-questions')!;
    const answer = catalog.find((item) => item.id === 'agent-run-answer')!;
    const chat = catalog.find((item) => item.id === 'agent-run-chat')!;
    const artifact = catalog.find((item) => item.id === 'agent-artifact-download')!;
    const taskDetail = catalog.find((item) => item.id === 'project-task-detail')!;
    const taskStream = catalog.find((item) => item.id === 'project-task-stream')!;

    expect(status).toMatchObject({ method: 'GET', path: '/projects/7/agent-run/{taskId}' });
    expect(stream).toMatchObject({ method: 'GET', path: '/projects/7/agent-run/{taskId}/stream?since={seq}' });
    expect(pageApiOperationMatches(status, { method: 'GET', path: '/projects/7/agent-run/31' })).toBe(true);
    expect(pageApiOperationMatches(stream, { method: 'GET', path: '/projects/7/agent-run/31/stream?since=98' })).toBe(true);
    expect(pageApiOperationMatches(questions, { method: 'GET', path: '/projects/7/agent-run/31/questions' })).toBe(true);
    expect(pageApiOperationMatches(answer, { method: 'POST', path: '/projects/7/agent-run/31/asks/13/answer' })).toBe(true);
    expect(pageApiOperationMatches(chat, { method: 'POST', path: '/projects/7/agent-run/31/chat' })).toBe(true);
    expect(pageApiOperationMatches(taskDetail, { method: 'GET', path: '/tasks/41' })).toBe(true);
    expect(pageApiOperationMatches(taskStream, { method: 'GET', path: '/tasks/41/stream' })).toBe(true);
    expect(pageApiOperationMatches(artifact, { method: 'GET', path: '/projects/7/agent-artifact/52/download' })).toBe(true);
    expect(artifact.notIntegratedReason).toContain('单项成果清单');
    expect(catalog.find((item) => item.id === 'project-response-package')).toMatchObject({
      method: 'GET',
      path: '/projects/7/response-package',
    });
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
      path: '/files?target=project&project_id=7&page=2&size=100',
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

  it('keeps project pricing extensions after removing the standalone history page', () => {
    const pricing = pageApiCatalog({ name: 'pricing-center', projectId: '7' });

    expect(pricing.map((item) => item.id)).toEqual(expect.arrayContaining([
      'quote-calculate',
      'quote-recalculate',
      'quote-strategy',
      'quote-ai-suggest',
      'quote-apply',
    ]));
    expect(pricing.find((item) => item.id === 'bootstrap-history-quotes')).toBeUndefined();
    for (const id of ['quote-calculate', 'quote-recalculate', 'quote-ai-suggest']) {
      expect(pricing.find((item) => item.id === id)?.notIntegratedReason).toBeUndefined();
    }
  });

  it('matches corrected tender notice list/detail and requirement mutation paths', () => {
    const catalog = pageApiCatalog({ name: 'project-materials', projectId: '7' });
    const noticeList = catalog.find((item) => item.id === 'tender-notice-list')!;
    const noticeDetail = catalog.find((item) => item.id === 'tender-notice-detail')!;
    const confirm = catalog.find((item) => item.id === 'requirement-confirm')!;
    const correct = catalog.find((item) => item.id === 'requirement-correct')!;

    expect(pageApiOperationMatches(noticeList, {
      method: 'GET',
      path: '/projects/7/tender-notices',
    })).toBe(true);
    expect(pageApiOperationMatches(noticeDetail, {
      method: 'GET',
      path: '/projects/7/tender-notices/19',
    })).toBe(true);
    expect(pageApiOperationMatches(noticeDetail, {
      method: 'GET',
      path: '/projects/7/tender-notices/imports/19',
    })).toBe(false);
    expect(pageApiOperationMatches(confirm, {
      method: 'PUT',
      path: '/projects/7/requirements/4/confirm',
    })).toBe(true);
    expect(pageApiOperationMatches(correct, {
      method: 'PUT',
      path: '/projects/7/requirements/4/correct',
    })).toBe(true);
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

  it('lists one real review call that supports a selected enabled Provider id', () => {
    const catalog = pageApiCatalog({ name: 'review-center', projectId: '7' });
    expect(catalog.find((item) => item.id === 'review-evaluate')).toMatchObject({
      feature: '运行模拟评审',
      method: 'POST',
      path: '/projects/7/evaluate',
    });
    expect(catalog.some((item) => item.id === 'review-provider-selection')).toBe(false);
    expect(catalog.map((item) => item.id)).toEqual(expect.arrayContaining([
      'project-review-items',
      'review-update-suggestion',
      'review-confirm-item',
      'review-confirm-items',
      'review-re-evaluate',
    ]));
    expect(catalog.find((item) => item.id === 'review-confirm-item')).toMatchObject({
      method: 'PUT',
      path: '/projects/7/scores/{scoreId}/items/{findingId}/confirm',
    });
    expect(catalog.find((item) => item.id === 'review-confirm-items')).toMatchObject({
      method: 'POST',
      path: '/projects/7/scores/{scoreId}/items/confirm',
    });
    expect(catalog.find((item) => item.id === 'review-re-evaluate')).toMatchObject({
      method: 'POST',
      path: '/projects/7/re-evaluate',
    });
  });

  it('marks unavailable enterprise capabilities without inventing observable API calls', () => {
    const login = pageApiCatalog({ name: 'login' });
    const enterprise = pageApiCatalog({ name: 'enterprise-assets' });

    expect(login.find((item) => item.id === 'auth-forgot-password')?.unavailableReason)
      .toContain('尚未提供');
    expect(enterprise.find((item) => item.id === 'enterprise-file-preview-download')).toMatchObject({
      method: 'GET',
      path: '/files/{fileId}/download',
    });
    expect(enterprise.find((item) => item.id === 'enterprise-file-preview-blocks')).toMatchObject({
      method: 'GET',
      path: '/files/{fileId}/blocks',
    });
    expect(enterprise.find((item) => item.id === 'enterprise-rename-asset')).toMatchObject({
      method: 'PATCH',
      path: '/enterprise/assets/{assetId}',
      unavailableReason: expect.stringContaining('尚未提供'),
    });
    const rar7z = enterprise.find((item) => item.id === 'enterprise-rar-7z-extract')!;
    expect(rar7z).toMatchObject({
      feature: '解包 RAR/7Z 压缩包',
      method: 'POST',
      path: '/files/upload',
      trackRuntime: false,
      unavailableReason: expect.stringContaining('后端会拒绝 RAR/7Z'),
    });
    expect(pageApiOperationMatches(rar7z, {
      method: 'POST',
      path: '/files/upload',
    })).toBe(false);

    const historyBid = enterprise.find((item) => item.id === 'enterprise-history-bid-extract')!;
    expect(historyBid).toMatchObject({
      feature: '历史标书成果智能提取企业资料',
      method: 'POST',
      path: '后端未定义',
      isTask: true,
      trackRuntime: false,
      unavailableReason: expect.stringContaining('尚未提供'),
    });
  });

  it('lists unavailable bid market content contracts without treating placeholders as requests', () => {
    const catalog = pageApiCatalog({ name: 'bid-market-library' });
    const contentOperations = catalog.filter((item) => item.id.startsWith('bid-market-content-'));

    expect(contentOperations.map((item) => item.id)).toEqual([
      'bid-market-content-list-search',
      'bid-market-content-categories',
      'bid-market-content-detail',
      'bid-market-content-preview',
      'bid-market-content-upload',
    ]);
    expect(contentOperations).toHaveLength(5);
    contentOperations.forEach((item) => {
      expect(item).toMatchObject({
        path: '后端未定义',
        trackRuntime: false,
        unavailableReason: expect.any(String),
      });
      expect(pageApiOperationMatches(item, {
        method: item.method,
        path: '/hypothetical-bid-market-content-endpoint',
      })).toBe(false);
    });
  });
});
