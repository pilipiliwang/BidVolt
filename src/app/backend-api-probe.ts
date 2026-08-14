import type { BackendId } from '../shared/backend-api';

export type BackendApiProbeStatus = 'connected' | 'degraded' | 'disconnected';

export type BackendApiProbeCheckId = 'auth-me' | 'project-get' | 'projects-list';

export type BackendApiProbeCheckStatus = 'success' | 'failed' | 'not-run';

export type BackendApiProbeCheck = {
  id: BackendApiProbeCheckId;
  label: string;
  method: 'GET';
  path: string;
  status: BackendApiProbeCheckStatus;
  latencyMs: number | null;
};

export type BackendApiProbeResult = {
  status: BackendApiProbeStatus;
  latencyMs: number;
  checkedAt: string;
  message: string;
  checks: BackendApiProbeCheck[];
};

export type BackendApiProbeDependencies = {
  auth: {
    me: () => Promise<unknown>;
  };
  projects: {
    get: (projectId: BackendId) => Promise<unknown>;
    list: (params: { page: number; size: number }) => Promise<unknown>;
  };
  now?: () => number;
  toCheckedAt?: (epochMs: number) => string;
};

export type BackendApiProbeOptions = {
  projectId?: BackendId;
};

const toIsoString = (epochMs: number) => new Date(epochMs).toISOString();
const elapsedMilliseconds = (startedAt: number, completedAt: number) =>
  Math.max(0, Math.round(completedAt - startedAt));

const authCheck = (
  status: BackendApiProbeCheckStatus,
  latencyMs: number | null,
): BackendApiProbeCheck => ({
  id: 'auth-me',
  label: '登录身份校验',
  method: 'GET',
  path: '/auth/me',
  status,
  latencyMs,
});

const businessCheck = (
  projectId: BackendId | undefined,
  status: BackendApiProbeCheckStatus,
  latencyMs: number | null,
): BackendApiProbeCheck => projectId !== undefined
  ? {
      id: 'project-get',
      label: '当前项目读取',
      method: 'GET',
      path: `/projects/${encodeURIComponent(String(projectId))}`,
      status,
      latencyMs,
    }
  : {
      id: 'projects-list',
      label: '项目列表读取',
      method: 'GET',
      path: '/projects?page=1&size=1',
      status,
      latencyMs,
    };

/**
 * Checks the authenticated, read-only backend path used by the current page.
 *
 * The returned state intentionally contains no response payload, token, URL, or
 * raw error details, so it is safe to surface directly in the application UI.
 */
export async function runBackendApiProbe(
  dependencies: BackendApiProbeDependencies,
  options: BackendApiProbeOptions = {},
): Promise<BackendApiProbeResult> {
  const now = dependencies.now ?? Date.now;
  const formatCheckedAt = dependencies.toCheckedAt ?? toIsoString;
  const startedAt = now();

  const complete = (
    status: BackendApiProbeStatus,
    message: string,
    completedAt: number,
    checks: BackendApiProbeCheck[],
  ): BackendApiProbeResult => {
    return {
      status,
      latencyMs: elapsedMilliseconds(startedAt, completedAt),
      checkedAt: formatCheckedAt(completedAt),
      message,
      checks,
    };
  };

  let authCompletedAt: number;
  try {
    await dependencies.auth.me();
  } catch {
    authCompletedAt = now();
    return complete(
      'disconnected',
      '真实后端 API 校验失败：身份接口未返回成功，请检查后端服务与登录状态。',
      authCompletedAt,
      [
        authCheck('failed', elapsedMilliseconds(startedAt, authCompletedAt)),
        businessCheck(options.projectId, 'not-run', null),
      ],
    );
  }
  authCompletedAt = now();
  const successfulAuthCheck = authCheck(
    'success',
    elapsedMilliseconds(startedAt, authCompletedAt),
  );

  let businessCompletedAt: number;
  try {
    if (options.projectId !== undefined) {
      await dependencies.projects.get(options.projectId);
    } else {
      await dependencies.projects.list({ page: 1, size: 1 });
    }
  } catch {
    businessCompletedAt = now();
    return complete(
      'degraded',
      '身份接口调用成功，但业务数据接口调用失败；页面可能保留上次成功加载的旧数据。',
      businessCompletedAt,
      [
        successfulAuthCheck,
        businessCheck(
          options.projectId,
          'failed',
          elapsedMilliseconds(authCompletedAt, businessCompletedAt),
        ),
      ],
    );
  }
  businessCompletedAt = now();

  return complete(
    'connected',
    options.projectId !== undefined
      ? '真实后端 API 已连接：身份接口与当前项目接口调用成功。'
      : '真实后端 API 已连接：身份接口与项目列表接口调用成功。',
    businessCompletedAt,
    [
      successfulAuthCheck,
      businessCheck(
        options.projectId,
        'success',
        elapsedMilliseconds(authCompletedAt, businessCompletedAt),
      ),
    ],
  );
}
