import { describe, expect, it } from 'vitest';

import type { BackendApiRequestEvent } from '../shared/backend-api';
import { buildPageApiActivity } from './page-api-activity';
import { pageApiCatalog } from './page-api-catalog';

function requestEvent(overrides: Partial<BackendApiRequestEvent> = {}): BackendApiRequestEvent {
  return {
    requestId: 'request-1',
    sequence: 1,
    method: 'GET',
    path: '/auth/me',
    pathname: '/auth/me',
    startedAt: '2026-08-14T03:00:00.000Z',
    finishedAt: '2026-08-14T03:00:00.040Z',
    latencyMs: 40,
    status: 'succeeded',
    ...overrides,
  };
}

describe('page API activity', () => {
  it('keeps expected operations visible before they are triggered', () => {
    const definitions = pageApiCatalog({ name: 'projects' });
    const result = buildPageApiActivity(definitions, []);

    expect(result.status).toBe('checking');
    expect(result.checks.find((check) => check.id === 'projects-create')).toMatchObject({
      callCount: 0,
      status: 'not-run',
      feature: '新增投标项目',
    });
  });

  it('aggregates real request calls and uses the most recent lifecycle state', () => {
    const definitions = pageApiCatalog({ name: 'projects' });
    const result = buildPageApiActivity(definitions, [
      requestEvent(),
      requestEvent({
        requestId: 'request-2',
        sequence: 2,
        path: '/auth/me',
        pathname: '/auth/me',
        startedAt: '2026-08-14T03:01:00.000Z',
        finishedAt: null,
        latencyMs: null,
        status: 'started',
      }),
    ]);
    const identity = result.checks.find((check) => check.id === 'auth-me');

    expect(identity).toMatchObject({
      callCount: 2,
      status: 'checking',
      lastCalledAt: '2026-08-14T03:01:00.000Z',
    });
    expect(identity?.actualPath).toBeUndefined();
  });

  it('reports failures and missing backend capabilities separately', () => {
    const definitions = pageApiCatalog({ name: 'enterprise-assets' });
    const result = buildPageApiActivity(definitions, [
      requestEvent({
        requestId: 'request-2',
        sequence: 2,
        method: 'PUT',
        path: '/enterprise/facts/9',
        pathname: '/enterprise/facts/9',
        status: 'failed',
      }),
    ]);

    expect(result.status).toBe('degraded');
    expect(result.checks.find((check) => check.id === 'enterprise-update-fact'))
      .toMatchObject({ status: 'failed', callCount: 1 });
    expect(result.checks.find((check) => check.id === 'enterprise-revision-content'))
      .toMatchObject({ status: 'unavailable', callCount: 0 });
  });

  it('shows Agent streaming as untriggered, then captures the real SSE request including since', () => {
    const definitions = pageApiCatalog({ name: 'project-overview', projectId: '7' });
    const withoutStream = buildPageApiActivity(definitions, [
      requestEvent(),
      requestEvent({
        requestId: 'request-task',
        sequence: 2,
        path: '/projects/7/agent-run/31',
        pathname: '/projects/7/agent-run/31',
      }),
    ]);

    expect(withoutStream.checks.find((check) => check.id === 'agent-run-status')).toMatchObject({
      status: 'success',
      callCount: 1,
      isTask: true,
      method: 'GET',
      path: '/projects/7/agent-run/{taskId}',
    });
    expect(withoutStream.checks.find((check) => check.id === 'agent-run-stream')).toMatchObject({
      status: 'not-run',
      callCount: 0,
      method: 'GET',
      path: '/projects/7/agent-run/{taskId}/stream?since={seq}',
    });

    const withStream = buildPageApiActivity(definitions, [
      requestEvent({
        requestId: 'request-stream',
        sequence: 3,
        path: '/projects/7/agent-run/31/stream?since=22',
        pathname: '/projects/7/agent-run/31/stream',
      }),
    ]);
    expect(withStream.checks.find((check) => check.id === 'agent-run-stream')).toMatchObject({
      actualPath: '/projects/7/agent-run/31/stream?since=22',
      status: 'success',
      callCount: 1,
    });
  });

  it('shows unexpected runtime requests instead of silently dropping them', () => {
    const result = buildPageApiActivity(pageApiCatalog({ name: 'projects' }), [
      requestEvent({
        method: 'DELETE',
        path: '/unexpected/27?project_id=7',
        pathname: '/unexpected/27',
      }),
    ]);
    const runtime = result.checks.find((check) => check.id.startsWith('runtime:'));

    expect(runtime).toMatchObject({
      actualPath: '/unexpected/27?project_id=7',
      feature: '运行时捕获：清单外接口',
      status: 'success',
    });
  });

  it('never presents preview catalog entries as real calls', () => {
    const result = buildPageApiActivity(pageApiCatalog({ name: 'project-materials', projectId: '7' }), [
      requestEvent(),
    ], { preview: true });

    expect(result.status).toBe('preview');
    expect(result.checks.find((check) => check.id === 'auth-me')).toMatchObject({
      status: 'not-run',
      callCount: 0,
    });
    expect(result.checks.find((check) => check.id === 'requirement-confirm')?.status)
      .toBe('not-run');
    expect(result.checks.find((check) => check.id === 'agent-run-stream')?.status)
      .toBe('not-run');
    expect(result.checks.find((check) => check.id === 'agent-run-status')?.status)
      .toBe('not-run');
  });

  it('reports the latest-score 404 empty contract as success with a clear explanation', () => {
    const definitions = pageApiCatalog({ name: 'project-overview', projectId: '7' })
      .filter((definition) => definition.id === 'project-latest-score');
    const result = buildPageApiActivity(definitions, [
      requestEvent({
        path: '/projects/7/scores',
        pathname: '/projects/7/scores',
        status: 'expected-empty',
      }),
    ]);

    expect(result.status).toBe('connected');
    expect(result.message).toContain('成功 1 项、失败 0 项');
    expect(result.checks[0]).toMatchObject({
      status: 'success',
      detail: '正常空态：后端确认该项目尚未评标。',
    });
  });

  it('does not present a caller-cancelled request as an API failure', () => {
    const definitions = pageApiCatalog({ name: 'projects' });
    const result = buildPageApiActivity(definitions, [
      requestEvent({ status: 'cancelled' }),
    ]);

    expect(result.checks.find((check) => check.id === 'auth-me')).toMatchObject({
      callCount: 0,
      status: 'not-run',
    });
    expect(result.status).toBe('checking');
    expect(result.message).toContain('正在等待');
  });
});
