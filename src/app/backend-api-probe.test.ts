import { describe, expect, it, vi } from 'vitest';

import {
  runBackendApiProbe,
  type BackendApiProbeDependencies,
} from './backend-api-probe';

function createDependencies(nowValues = [1_000, 1_125]) {
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
  it('checks auth and the current project through read-only APIs', async () => {
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

    await expect(runBackendApiProbe(dependencies, { projectId: 'project-7' })).resolves.toEqual({
      status: 'connected',
      latencyMs: 125,
      checkedAt: 'checked-1125',
      message: '真实后端 API 已连接：身份接口与当前项目接口调用成功。',
    });
    expect(calls).toEqual(['auth.me', 'projects.get:project-7']);
    expect(dependencies.projects.list).not.toHaveBeenCalled();
  });

  it('checks the project list when there is no current project id', async () => {
    const dependencies = createDependencies([10, 12]);

    const result = await runBackendApiProbe(dependencies);

    expect(result).toEqual({
      status: 'connected',
      latencyMs: 2,
      checkedAt: 'checked-12',
      message: '真实后端 API 已连接：身份接口与项目列表接口调用成功。',
    });
    expect(dependencies.projects.list).toHaveBeenCalledWith({ page: 1, size: 1 });
    expect(dependencies.projects.get).not.toHaveBeenCalled();
  });

  it('reports disconnected and skips business APIs when auth fails', async () => {
    const dependencies = createDependencies();
    dependencies.auth.me.mockRejectedValue(
      new Error('Authorization: Bearer secret-token must never be rendered'),
    );

    const result = await runBackendApiProbe(dependencies, { projectId: 7 });

    expect(result.status).toBe('disconnected');
    expect(result.message).toBe(
      '真实后端 API 校验失败：身份接口未返回成功，请检查后端服务与登录状态。',
    );
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(dependencies.projects.get).not.toHaveBeenCalled();
    expect(dependencies.projects.list).not.toHaveBeenCalled();
  });

  it('reports degraded and warns about stale page data when the business API fails', async () => {
    const dependencies = createDependencies([20, 36]);
    dependencies.projects.get.mockRejectedValue(new Error('private upstream response'));

    const result = await runBackendApiProbe(dependencies, { projectId: 7 });

    expect(result).toEqual({
      status: 'degraded',
      latencyMs: 16,
      checkedAt: 'checked-36',
      message: '身份接口调用成功，但业务数据接口调用失败；页面可能保留上次成功加载的旧数据。',
    });
    expect(JSON.stringify(result)).not.toContain('private upstream response');
  });

  it('treats a numeric zero as a provided project id and clamps a reversed clock', async () => {
    const dependencies = createDependencies([100, 90]);

    const result = await runBackendApiProbe(dependencies, { projectId: 0 });

    expect(dependencies.projects.get).toHaveBeenCalledWith(0);
    expect(dependencies.projects.list).not.toHaveBeenCalled();
    expect(result.latencyMs).toBe(0);
  });
});
