import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  FlaskConical,
  LoaderCircle,
  RotateCw,
} from 'lucide-react';

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
  | 'unavailable';

export type BackendApiCheck = {
  id: string;
  feature?: string;
  trigger?: string;
  method: string;
  path: string;
  actualPath?: string;
  status: BackendApiCheckStatus;
  callCount?: number;
  lastCalledAt?: Date | string | null;
  latencyMs?: number | null;
  detail?: string;
};

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
    label: '部分 API 调用异常',
    message: '基础 API 可以访问，但部分业务接口响应异常或缺少数据。',
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
  if (
    typeof check.callCount === 'number'
    && Number.isFinite(check.callCount)
    && check.callCount >= 0
  ) {
    return Math.floor(check.callCount);
  }

  return check.status === 'not-run' || check.status === 'unavailable' ? 0 : 1;
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
      unavailable: 0,
    } satisfies Record<BackendApiCheckStatus, number>,
  );

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
            <span className="backend-api-status__summary-chip backend-api-status__summary-chip--unavailable">
              后端未提供 {checkSummary.unavailable}
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
            {checks.map((check) => {
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
                    {formatDateTime(
                      check.lastCalledAt,
                      check.status === 'not-run'
                        ? '未调用'
                        : check.status === 'unavailable'
                          ? '无可用接口'
                          : '未记录',
                    )}
                  </time>
                  <span className="backend-api-status__check-latency" data-label="最近耗时" role="cell">
                    {formatLatency(check.latencyMs)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
