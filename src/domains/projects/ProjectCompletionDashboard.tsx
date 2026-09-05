import { Download, Eye, FileText } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import type { ReviewFinding } from '../review/types';
import type { ProjectOutcomeReviewViewModel } from './ProjectOutcomeReviewPanel';
import type { ProjectWorkflowTaskSummary } from './ProjectWorkflow';
import type { ProjectResultFile } from './ProjectResourceRail';
import './project-completion-dashboard.css';

export type ProjectCompletionDashboardProps = {
  findings: readonly ReviewFinding[];
  onDownloadRecordFile?: (file: ProjectResultFile) => void;
  onOpenRecordFile?: (file: ProjectResultFile) => void;
  recordFile?: ProjectResultFile;
  review: ProjectOutcomeReviewViewModel;
  status?: ReactNode;
  task: ProjectWorkflowTaskSummary;
};

export function ProjectCompletionDashboard({
  onDownloadRecordFile,
  onOpenRecordFile,
  recordFile,
  review,
  status,
  task,
}: ProjectCompletionDashboardProps) {
  const titleId = useId();
  const score = review.score;
  const metrics = [
    { emphasis: true, label: '综合评分', suffix: '分 / 100', value: score?.total },
    { label: '商务标', suffix: '分', value: score?.business },
    { label: '技术标', suffix: '分', value: score?.technical },
    { label: '价格文件', suffix: '分', value: score?.pricing },
    {
      accent: true,
      label: '可提升空间',
      prefix: '+',
      suffix: '分',
      value: score?.estimatedLift,
    },
  ];

  return (
    <section
      aria-label="成果评分与响应记录"
      className="project-completion-dashboard"
      data-layout-region="completion-summary"
      data-review-state={review.state}
      data-task-status={task.status ?? 'unknown'}
    >
      <div className={`project-completion-dashboard__top${status ? ' project-completion-dashboard__top--with-status' : ''}`}>
        {status ? <div className="project-completion-dashboard__status">{status}</div> : null}
        <section aria-labelledby={`${titleId}-scores`} className="project-completion-dashboard__scores">
          <div className="project-completion-dashboard__section-heading" title={nonEmptyText(review.description)}>
            <div>
              <h2 id={`${titleId}-scores`}>评分结果</h2>
              <p>{nonEmptyText(review.description)}</p>
            </div>
            <span className="project-completion-dashboard__review-state">{nonEmptyText(review.title)}</span>
          </div>
          <dl
            aria-label="标书成果评分"
            className="project-completion-dashboard__score-grid"
            role="group"
          >
            {metrics.map((metric) => (
              <div
                className={metric.emphasis ? 'is-emphasis' : metric.accent ? 'is-accent' : undefined}
                key={metric.label}
              >
                <dt>{metric.label}</dt>
                <dd>{formatMetric(metric.value, metric.suffix, metric.prefix)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-label="编制逻辑与评分响应记录" className="project-completion-dashboard__records">
        {recordFile ? (
          <div className="project-completion-dashboard__record-file">
            <button
              className="project-completion-dashboard__record-open"
              disabled={!onOpenRecordFile}
              onClick={() => onOpenRecordFile?.(recordFile)}
              title={recordFile.name}
              type="button"
            >
              <FileText aria-hidden="true" size={22} />
              <span className="project-completion-dashboard__record-name">
                <strong>{recordFile.name}</strong>
                <small>{[recordFile.versionLabel, recordFile.sizeLabel].filter(Boolean).join(' · ') || '内部管理文件'}</small>
              </span>
              <span className="project-completion-dashboard__record-action"><Eye aria-hidden="true" size={16} />查看</span>
            </button>
            {onDownloadRecordFile ? (
              <button
                aria-label={`下载 ${recordFile.name}`}
                className="project-completion-dashboard__record-download"
                onClick={() => onDownloadRecordFile(recordFile)}
                type="button"
              >
                <Download aria-hidden="true" size={16} />下载
              </button>
            ) : null}
          </div>
        ) : (
          <div
            aria-label="评分响应记录空状态"
            className="project-completion-dashboard__empty"
            role="status"
          >
            <FileText aria-hidden="true" size={22} />
            <strong>编制逻辑与评分响应记录</strong>
            <span>内部管理文件尚未生成</span>
          </div>
        )}
      </section>
    </section>
  );
}

function formatMetric(value: number | undefined, suffix: string, prefix = '') {
  const number = finiteNumber(value);
  if (number === undefined) return '—';
  const safePrefix = prefix && number > 0 ? prefix : '';
  return <>{safePrefix}{formatNumber(number)} <small>{suffix}</small></>;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonEmptyText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : '—';
}
