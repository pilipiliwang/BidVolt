import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  FlaskConical,
  LoaderCircle,
  RotateCw,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import './BackendApiStatusBar.css';

export type BackendApiStatus =
  | 'checking'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'preview';

export type BackendApiCheckStatus =
  | 'success'
  | 'failed'
  | 'checking'
  | 'not-run'
  | 'not-integrated'
  | 'unavailable';

export type BackendApiCheck = {
  id: string;
  feature?: string;
  trigger?: string;
  method: string;
  path: string;
  actualPath?: string;
  isTask?: boolean;
  status: BackendApiCheckStatus;
  callCount?: number;
  lastCalledAt?: Date | string | null;
  latencyMs?: number | null;
  detail?: string;
};

type CheckFilter = 'all' | BackendApiCheckStatus | 'tasks';

export type BackendApiStatusBarProps = {
  status: BackendApiStatus;
  checks?: readonly BackendApiCheck[];
  checkedAt?: Date | string | null;
  latencyMs?: number | null;
  message?: string;
  onRetest?: () => void;
  isRetesting?: boolean;
  endpointLabel?: string;
  className?: string;
};

const statusContent = {
  checking: {
    label: 'API 调用检测中',
    message: '正在向后端发送真实请求，请稍候。',
    Icon: LoaderCircle,
  },
  connected: {
    label: 'API 调用成功',
    message: '测试请求已由真实后端成功响应，当前页面将读取真实后端数据。',
    Icon: CheckCircle2,
  },
  degraded: {
    label: '真实 API 已连接，仍有待接项',
    message: '已捕获真实 API 调用；请在明细中区分调用失败、前端未接入与后端未提供。',
    Icon: AlertTriangle,
  },
  disconnected: {
    label: 'API 调用失败',
    message: '无法访问后端 API，当前页面可能无法加载业务数据。',
    Icon: CircleX,
  },
  preview: {
    label: 'API 未执行（本地预览）',
    message: '当前显示本地预览数据，不代表真实后端接口已经连通。',
    Icon: FlaskConical,
  },
} satisfies Record<BackendApiStatus, {
  label: string;
  message: string;
  Icon: typeof CheckCircle2;
}>;

const checkedAtFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatDateTime(
  value: Date | string | null | undefined,
  emptyLabel: string,
) {
  if (!value) return emptyLabel;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return checkedAtFormatter.format(date);
}

function formatCheckedAt(value: Date | string | null | undefined) {
  return formatDateTime(value, '尚未检测');
}

function toDateTimeAttribute(value: Date | string | null | undefined) {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

const checkStatusContent = {
  success: { label: '调用成功', Icon: CheckCircle2 },
  failed: { label: '调用失败', Icon: CircleX },
  checking: { label: '调用中', Icon: LoaderCircle },
  'not-run': { label: '未触发', Icon: FlaskConical },
  'not-integrated': { label: '前端未接入', Icon: CircleX },
  unavailable: { label: '后端未提供', Icon: AlertTriangle },
} satisfies Record<BackendApiCheckStatus, {
  label: string;
  Icon: typeof CheckCircle2;
}>;

function formatLatency(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${Math.round(value)} ms`
    : '—';
}

function formatCallCount(check: BackendApiCheck) {
  if (check.status === 'not-integrated' || check.status === 'unavailable') {
    return 0;
  }

  if (
    typeof check.callCount === 'number'
    && Number.isFinite(check.callCount)
    && check.callCount >= 0
  ) {
    return Math.floor(check.callCount);
  }

  return check.status === 'not-run' ? 0 : 1;
}

function formatLastCalledAt(check: BackendApiCheck) {
  if (check.status === 'not-integrated') return '尚未接入';
  if (check.status === 'unavailable') return '无可用接口';
  return formatDateTime(
    check.lastCalledAt,
    check.status === 'not-run' ? '未调用' : '未记录',
  );
}

function isTaskCheck(check: BackendApiCheck) {
  if (check.isTask !== undefined) return check.isTask;

  const searchable = [
    check.feature,
    check.trigger,
    check.path,
    check.actualPath,
  ]
    .filter(Boolean)
    .join(' ');

  return searchable.includes('任务')
    || /(^|[/_.-])tasks?([/_.?{-]|$)/i.test(searchable);
}

export function BackendApiStatusBar({
  status,
  checks = [],
  checkedAt,
  latencyMs,
  message,
  onRetest,
  isRetesting = false,
  endpointLabel,
  className,
}: BackendApiStatusBarProps) {
  const [activeFilter, setActiveFilter] = useState<CheckFilter>('all');
  const [keyword, setKeyword] = useState('');
  const content = statusContent[status];
  const Icon = content.Icon;
  const isChecking = status === 'checking' || isRetesting;
  const rootClassName = [
    'backend-api-status',
    `backend-api-status--${status}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const checkSummary = checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    {
      success: 0,
      failed: 0,
      checking: 0,
      'not-run': 0,
      'not-integrated': 0,
      unavailable: 0,
    } satisfies Record<BackendApiCheckStatus, number>,
  );
  const taskCheckCount = checks.filter(isTaskCheck).length;
  const filteredChecks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();

    return checks.filter((check) => {
      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'tasks' ? isTaskCheck(check) : check.status === activeFilter);
      if (!matchesFilter) return false;
      if (!normalizedKeyword) return true;

      return [
        check.feature,
        check.trigger,
        check.method,
        check.path,
        check.actualPath,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedKeyword));
    });
  }, [activeFilter, checks, keyword]);

  const filters: Array<{ id: CheckFilter; label: string; count: number }> = [
    { id: 'all', label: '全部', count: checks.length },
    { id: 'success', label: '成功', count: checkSummary.success },
    { id: 'failed', label: '失败', count: checkSummary.failed },
    { id: 'checking', label: '调用中', count: checkSummary.checking },
    { id: 'not-run', label: '未触发', count: checkSummary['not-run'] },
    { id: 'not-integrated', label: '前端未接入', count: checkSummary['not-integrated'] },
    { id: 'unavailable', label: '后端未提供', count: checkSummary.unavailable },
    { id: 'tasks', label: '任务接口', count: taskCheckCount },
  ];

  return (
    <section
      aria-atomic="true"
      aria-label="后端 API 调用测试状态"
      aria-live="polite"
      className={rootClassName}
      data-status={status}
      role="status"
    >
      <span className="backend-api-status__icon" aria-hidden="true">
        <Icon className={isChecking ? 'backend-api-status__icon-svg--spinning' : undefined} size={18} />
      </span>

      <div className="backend-api-status__content">
        <div className="backend-api-status__summary">
          <span className="backend-api-status__panel-title">API 调用测试</span>
          <strong>{content.label}</strong>
          <span className="backend-api-status__truth-badge">
            {status === 'preview' ? '预览数据' : status === 'connected' ? '真实 API' : 'API 检测'}
          </span>
        </div>
        <p>{message ?? content.message}</p>
      </div>

      <dl className="backend-api-status__metrics">
        {endpointLabel ? (
          <div>
            <dt>检测目标</dt>
            <dd title={endpointLabel}>{endpointLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt>最近检测</dt>
          <dd>{formatCheckedAt(checkedAt)}</dd>
        </div>
        <div>
          <dt>响应耗时</dt>
          <dd>{formatLatency(latencyMs)}</dd>
        </div>
      </dl>

      {onRetest ? (
        <button
          className="backend-api-status__retest"
          disabled={isChecking}
          onClick={onRetest}
          type="button"
        >
          <RotateCw
            aria-hidden="true"
            className={isChecking ? 'backend-api-status__icon-svg--spinning' : undefined}
            size={15}
          />
          {isChecking ? '检测中…' : '重新测试'}
        </button>
      ) : null}

      {checks.length > 0 ? (
        <div className="backend-api-status__monitor">
          <div className="backend-api-status__check-summary" aria-label="接口调用状态汇总" role="group">
            <strong>页面接口监控</strong>
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--success">
              成功 {checkSummary.success}
            </span>
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--failed">
              失败 {checkSummary.failed}
            </span>
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--checking">
              调用中 {checkSummary.checking}
            </span>
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--not-run">
              未触发 {checkSummary['not-run']}
            </span>
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--not-integrated">
              前端未接入 {checkSummary['not-integrated']}
            </span>
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--unavailable">
              后端未提供 {checkSummary.unavailable}
            </span>
          </div>
          <div className="backend-api-status__filters">
            <div className="backend-api-status__filter-tabs" aria-label="按状态筛选接口" role="group">
              {filters.map((filter) => (
                <button
                  aria-pressed={activeFilter === filter.id}
                  className="backend-api-status__filter-button"
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  type="button"
                >
                  {filter.label} <span>{filter.count}</span>
                </button>
              ))}
            </div>
            <label className="backend-api-status__search">
              <span className="backend-api-status__sr-only">按功能、方法或接口路径搜索</span>
              <Search aria-hidden="true" size={14} />
              <input
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索功能、方法或路径"
                type="search"
                value={keyword}
              />
            </label>
            <span className="backend-api-status__filter-result" aria-live="polite">
              显示 {filteredChecks.length} / {checks.length} 个接口
            </span>
          </div>
          <div className="backend-api-status__checks" aria-label="API 接口调用明细" role="table">
            <div className="backend-api-status__check-row backend-api-status__check-row--heading" role="row">
              <span role="columnheader">功能 / 触发方式</span>
              <span role="columnheader">方法</span>
              <span role="columnheader">接口路径</span>
              <span role="columnheader">操作状态</span>
              <span role="columnheader">调用次数</span>
              <span role="columnheader">最近调用时间</span>
              <span role="columnheader">最近耗时</span>
            </div>
            {filteredChecks.map((check) => {
              const checkContent = checkStatusContent[check.status];
              const CheckIcon = checkContent.Icon;

              return (
                <div
                  className={`backend-api-status__check-row backend-api-status__check-row--${check.status}`}
                  key={check.id}
                  role="row"
                  title={check.detail}
                >
                  <span className="backend-api-status__feature" data-label="功能 / 触发方式" role="cell">
                    <strong>{check.feature ?? '接口调用'}</strong>
                    <small>{check.trigger ?? '触发方式未标注'}</small>
                    {check.detail ? <em>{check.detail}</em> : null}
                  </span>
                  <span className="backend-api-status__method" data-label="方法" role="cell">
                    {check.method.toUpperCase()}
                  </span>
                  <code className="backend-api-status__check-path" data-label="接口路径" role="cell">
                    <span>{check.actualPath ?? check.path}</span>
                    {check.actualPath ? <small title={check.path}>模板：{check.path}</small> : null}
                  </code>
                  <span className="backend-api-status__check-state" data-label="操作状态" role="cell">
                    <CheckIcon
                      aria-hidden="true"
                      className={check.status === 'checking' ? 'backend-api-status__icon-svg--spinning' : undefined}
                      size={14}
                    />
                    {checkContent.label}
                  </span>
                  <span className="backend-api-status__check-count" data-label="调用次数" role="cell">
                    {formatCallCount(check)} 次
                  </span>
                  <time
                    className="backend-api-status__check-time"
                    data-label="最近调用时间"
                    dateTime={toDateTimeAttribute(check.lastCalledAt)}
                    role="cell"
                  >
                    {formatLastCalledAt(check)}
                  </time>
                  <span className="backend-api-status__check-latency" data-label="最近耗时" role="cell">
                    {formatLatency(
                      check.status === 'not-integrated' || check.status === 'unavailable'
                        ? null
                        : check.latencyMs,
                    )}
                  </span>
                </div>
              );
            })}
            {filteredChecks.length === 0 ? (
              <div className="backend-api-status__empty-row" role="row">
                <span role="cell">未找到符合当前筛选条件的接口</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
