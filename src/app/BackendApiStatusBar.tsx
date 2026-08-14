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

export type BackendApiStatusBarProps = {
  status: BackendApiStatus;
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
    label: '正在检测后端 API',
    message: '正在向后端发送真实请求，请稍候。',
    Icon: LoaderCircle,
  },
  connected: {
    label: '真实后端已连接',
    message: '最近一次 API 测试成功，当前页面将读取真实后端数据。',
    Icon: CheckCircle2,
  },
  degraded: {
    label: '后端部分可用',
    message: '基础 API 可以访问，但部分业务接口响应异常或缺少数据。',
    Icon: AlertTriangle,
  },
  disconnected: {
    label: '后端未连接',
    message: '无法访问后端 API，当前页面可能无法加载业务数据。',
    Icon: CircleX,
  },
  preview: {
    label: '本地只读预览',
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

function formatCheckedAt(value: Date | string | null | undefined) {
  if (!value) return '尚未检测';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return checkedAtFormatter.format(date);
}

export function BackendApiStatusBar({
  status,
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
  const normalizedLatency =
    typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs >= 0
      ? Math.round(latencyMs)
      : null;
  const rootClassName = [
    'backend-api-status',
    `backend-api-status--${status}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

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
          <dd>{normalizedLatency === null ? '—' : `${normalizedLatency} ms`}</dd>
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
    </section>
  );
}
