import type { BackendApiRequestEvent } from '../shared/backend-api';
import type {
  BackendApiCheck,
  BackendApiStatus,
} from './BackendApiStatusBar';
import {
  pageApiOperationMatches,
  type PageApiOperation,
} from './page-api-catalog';

export type PageApiActivitySummary = {
  status: BackendApiStatus;
  checkedAt: string | null;
  latencyMs: number | null;
  message: string;
  checks: BackendApiCheck[];
};

const eventTime = (event: BackendApiRequestEvent) => event.finishedAt ?? event.startedAt;

function latestEvent(events: readonly BackendApiRequestEvent[]) {
  return [...events].sort((left, right) => right.sequence - left.sequence)[0];
}

function checkFromEvents(
  definition: PageApiOperation,
  events: readonly BackendApiRequestEvent[],
): BackendApiCheck {
  if (definition.unavailableReason) {
    return {
      id: definition.id,
      feature: definition.feature,
      trigger: definition.trigger,
      method: definition.method,
      path: definition.path,
      status: 'unavailable',
      callCount: 0,
      detail: definition.unavailableReason,
    };
  }

  const matching = events.filter((event) => pageApiOperationMatches(definition, event));
  const latest = latestEvent(matching);
  const hasActiveRequest = matching.some((event) => event.status === 'started');
  const status = hasActiveRequest
    ? 'checking'
    : latest?.status === 'succeeded'
      ? 'success'
      : latest?.status === 'failed'
        ? 'failed'
        : 'not-run';

  return {
    id: definition.id,
    feature: definition.feature,
    trigger: definition.trigger,
    method: definition.method,
    path: definition.path,
    actualPath: latest && latest.path !== definition.path ? latest.path : undefined,
    status,
    callCount: matching.length,
    lastCalledAt: latest ? eventTime(latest) : null,
    latencyMs: latest?.latencyMs,
  };
}

function unknownChecks(
  definitions: readonly PageApiOperation[],
  events: readonly BackendApiRequestEvent[],
) {
  const unmatched = events.filter((event) =>
    !definitions.some((definition) => pageApiOperationMatches(definition, event)));
  const groups = new Map<string, BackendApiRequestEvent[]>();
  unmatched.forEach((event) => {
    const key = `${event.method} ${event.pathname}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });

  return [...groups.entries()].map(([key, group]): BackendApiCheck => {
    const latest = latestEvent(group)!;
    const status = group.some((event) => event.status === 'started')
      ? 'checking'
      : latest.status === 'succeeded'
        ? 'success'
        : 'failed';
    return {
      id: `runtime:${key}`,
      feature: '运行时捕获：清单外接口',
      trigger: '真实请求已发生，请复核是否应归入当前页面',
      method: latest.method,
      path: latest.pathname,
      actualPath: latest.path,
      status,
      callCount: group.length,
      lastCalledAt: eventTime(latest),
      latencyMs: latest.latencyMs,
    };
  });
}

export function buildPageApiActivity(
  definitions: readonly PageApiOperation[],
  events: readonly BackendApiRequestEvent[],
  options: { preview?: boolean } = {},
): PageApiActivitySummary {
  const checks = [
    ...definitions.map((definition) => checkFromEvents(definition, events)),
    ...unknownChecks(definitions, events),
  ];
  if (options.preview) {
    return {
      status: 'preview',
      checkedAt: null,
      latencyMs: null,
      message: '当前是本地只读预览；下表仅列出页面接口需求，未执行任何真实后端 API 调用。',
      checks: checks.map((check) => check.status === 'unavailable'
        ? check
        : {
            ...check,
            actualPath: undefined,
            callCount: 0,
            lastCalledAt: null,
            latencyMs: null,
            status: 'not-run',
          }),
    };
  }

  const latest = latestEvent(events);
  const countByStatus = checks.reduce((counts, check) => {
    counts[check.status] += 1;
    return counts;
  }, {
    success: 0,
    failed: 0,
    checking: 0,
    'not-run': 0,
    unavailable: 0,
  });
  const status: BackendApiStatus = countByStatus.failed > 0 || countByStatus.unavailable > 0
    ? 'degraded'
    : countByStatus.checking > 0 || events.length === 0
      ? 'checking'
      : countByStatus.success > 0
        ? 'connected'
        : 'disconnected';
  const message = events.length === 0
    ? '已列出当前页面需要的接口，正在等待页面自动加载或用户操作触发真实请求。'
    : `已捕获 ${events.length} 次真实 API 调用：成功 ${countByStatus.success} 项、失败 ${countByStatus.failed} 项、调用中 ${countByStatus.checking} 项、未触发 ${countByStatus['not-run']} 项、后端未提供 ${countByStatus.unavailable} 项。`;

  return {
    status,
    checkedAt: latest ? eventTime(latest) : null,
    latencyMs: latest?.latencyMs ?? null,
    message,
    checks,
  };
}
