import { describe, expect, it, vi } from 'vitest';

import {
  runBackendApiProbe,
  type BackendApiProbeDependencies,
} from './backend-api-probe';

function createDependencies(nowValues = [1_000, 1_050, 1_125]) {
  const now = vi.fn<() => number>();
  for (const value of nowValues) now.mockReturnValueOnce(value);

  return {
    auth: { me: vi.fn().mockResolvedValue({ id: 1 }) },
    projects: {
      get: vi.fn().mockResolvedValue({ id: 7 }),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    },
    now,
    toCheckedAt: (epochMs: number) => `checked-${epochMs}`,
  } satisfies BackendApiProbeDependencies;
}

describe('backend API probe', () => {
  it('reports the auth and current-project calls as successful read-only checks', async () => {
    const dependencies = createDependencies();
    const calls: string[] = [];
    dependencies.auth.me.mockImplementation(async () => {
      calls.push('auth.me');
      return { id: 1 };
    });
    dependencies.projects.get.mockImplementation(async (projectId) => {
      calls.push(`projects.get:${projectId}`);
      return { id: projectId };
    });

    const result = await runBackendApiProbe(dependencies, { projectId: 'project-7' });

    expect(result).toEqual({
      status: 'connected',
      latencyMs: 125,
      checkedAt: 'checked-1125',
      message: '真实后端 API 已连接：身份接口与当前项目接口调用成功。',
      checks: [
        {
          id: 'auth-me',
          label: '登录身份校验',
          method: 'GET',
          path: '/auth/me',
          status: 'success',
          latencyMs: 50,
        },
        {
          id: 'project-get',
          label: '当前项目读取',
          method: 'GET',
          path: '/projects/project-7',
          status: 'success',
          latencyMs: 75,
        },
      ],
    });
    expect(calls).toEqual(['auth.me', 'projects.get:project-7']);
    expect(dependencies.projects.list).not.toHaveBeenCalled();
  });

  it('reports the project-list call when there is no current project id', async () => {
    const dependencies = createDependencies([10, 11, 12]);

    const result = await runBackendApiProbe(dependencies);

    expect(result.status).toBe('connected');
    expect(result.latencyMs).toBe(2);
    expect(result.checkedAt).toBe('checked-12');
    expect(result.checks).toEqual([
      expect.objectContaining({
        id: 'auth-me', status: 'success', path: '/auth/me', latencyMs: 1,
      }),
      {
        id: 'projects-list',
        label: '项目列表读取',
        method: 'GET',
        path: '/projects?page=1&size=1',
        status: 'success',
        latencyMs: 1,
      },
    ]);
    expect(dependencies.projects.list).toHaveBeenCalledWith({ page: 1, size: 1 });
    expect(dependencies.projects.get).not.toHaveBeenCalled();
  });

  it('marks auth failed and the business check not-run when auth fails', async () => {
    const dependencies = createDependencies([1_000, 1_040]);
    dependencies.auth.me.mockRejectedValue(
      new Error('Authorization: Bearer secret-token must never be rendered'),
    );

    const result = await runBackendApiProbe(dependencies, { projectId: 7 });

    expect(result.status).toBe('disconnected');
    expect(result.checks).toEqual([
      {
        id: 'auth-me',
        label: '登录身份校验',
        method: 'GET',
        path: '/auth/me',
        status: 'failed',
        latencyMs: 40,
      },
      {
        id: 'project-get',
        label: '当前项目读取',
        method: 'GET',
        path: '/projects/7',
        status: 'not-run',
        latencyMs: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(dependencies.projects.get).not.toHaveBeenCalled();
    expect(dependencies.projects.list).not.toHaveBeenCalled();
  });

  it('reports auth success and business failure while warning about stale data', async () => {
    const dependencies = createDependencies([20, 25, 36]);
    dependencies.projects.get.mockRejectedValue(new Error('private upstream response'));

    const result = await runBackendApiProbe(dependencies, { projectId: 7 });

    expect(result.status).toBe('degraded');
    expect(result.message).toContain('页面可能保留上次成功加载的旧数据');
    expect(result.checks.map(({ status, latencyMs }) => ({ status, latencyMs }))).toEqual([
      { status: 'success', latencyMs: 5 },
      { status: 'failed', latencyMs: 11 },
    ]);
    expect(JSON.stringify(result)).not.toContain('private upstream response');
  });

  it('URL-encodes the displayed project path without changing the API argument', async () => {
    const dependencies = createDependencies();
    const projectId = 'project/7 #section';

    const result = await runBackendApiProbe(dependencies, { projectId });

    expect(dependencies.projects.get).toHaveBeenCalledWith(projectId);
    expect(result.checks[1]).toMatchObject({
      id: 'project-get',
      path: '/projects/project%2F7%20%23section',
      status: 'success',
    });
  });

  it('treats numeric zero as a project id and clamps reversed clock values', async () => {
    const dependencies = createDependencies([100, 95, 90]);

    const result = await runBackendApiProbe(dependencies, { projectId: 0 });

    expect(dependencies.projects.get).toHaveBeenCalledWith(0);
    expect(dependencies.projects.list).not.toHaveBeenCalled();
    expect(result.latencyMs).toBe(0);
    expect(result.checks.map((check) => check.latencyMs)).toEqual([0, 0]);
  });
});
