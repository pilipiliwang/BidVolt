import type { BackendId } from '../shared/backend-api';

export type BackendApiProbeStatus = 'connected' | 'degraded' | 'disconnected';

export type BackendApiProbeResult = {
  status: BackendApiProbeStatus;
  latencyMs: number;
  checkedAt: string;
  message: string;
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
  ): BackendApiProbeResult => {
    const completedAt = now();
    return {
      status,
      latencyMs: Math.max(0, Math.round(completedAt - startedAt)),
      checkedAt: formatCheckedAt(completedAt),
      message,
    };
  };

  try {
    await dependencies.auth.me();
  } catch {
    return complete(
      'disconnected',
      '真实后端 API 校验失败：身份接口未返回成功，请检查后端服务与登录状态。',
    );
  }

  try {
    if (options.projectId !== undefined) {
      await dependencies.projects.get(options.projectId);
    } else {
      await dependencies.projects.list({ page: 1, size: 1 });
    }
  } catch {
    return complete(
      'degraded',
      '身份接口调用成功，但业务数据接口调用失败；页面可能保留上次成功加载的旧数据。',
    );
  }

  return complete(
    'connected',
    options.projectId !== undefined
      ? '真实后端 API 已连接：身份接口与当前项目接口调用成功。'
      : '真实后端 API 已连接：身份接口与项目列表接口调用成功。',
  );
}
