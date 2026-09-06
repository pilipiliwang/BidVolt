import { Eye, FileText } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import type { ReviewFinding } from '../review/types';
import type { ProjectOutcomeReviewViewModel } from './ProjectOutcomeReviewPanel';
import type { ProjectWorkflowTaskSummary } from './ProjectWorkflow';
import type { ProjectResultFile } from './ProjectResourceRail';
import { FileDownloadButton } from '../../shared/ui/FileDownloadButton';
import './project-completion-dashboard.css';

export type ProjectCompletionDashboardProps = {
  findings: readonly ReviewFinding[];
  onDownloadRecordFile?: (file: ProjectResultFile) => void | Promise<void>;
  /** Opens the existing review workflow; it never silently starts a scoring job. */
  onOpenReview?: () => void;
  onOpenRecordFile?: (file: ProjectResultFile) => void;
  recordFile?: ProjectResultFile;
  review: ProjectOutcomeReviewViewModel;
  status?: ReactNode;
  task: ProjectWorkflowTaskSummary;
};

export function ProjectCompletionDashboard({
  onDownloadRecordFile,
  onOpenReview,
  onOpenRecordFile,
  recordFile,
  review,
  status,
  task,
}: ProjectCompletionDashboardProps) {
  const titleId = useId();
  const score = review.score;
  const hasScore = finiteNumber(score?.total) !== undefined;
  const fullMarks = finiteNumber(score?.fullMarks);
  const isStale = review.state === 'stale';
  const scoreIsStartable = review.state === 'empty' || review.state === 'failed' || review.state === 'error';
  const emptyScoreMessage = review.state === 'empty'
    ? '尚未发起模拟评标，评分完成后将在这里展示。'
    : nonEmptyText(review.description);
  const scaleLabel = score?.scale === 'score_rules'
    ? '招标评分细则'
    : score?.scale === 'builtin' ? '完整性参考评分' : undefined;
  const metrics = [
    { emphasis: true, label: '综合评分', suffix: fullMarks !== undefined && fullMarks > 0 ? `分 / ${formatNumber(fullMarks)}` : '分', value: score?.total },
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
      data-score-state={isStale ? 'stale' : hasScore ? 'available' : 'empty'}
      data-task-status={task.status ?? 'unknown'}
    >
      <div className={`project-completion-dashboard__top${status ? ' project-completion-dashboard__top--with-status' : ''}`}>
        {status ? <div className="project-completion-dashboard__status">{status}</div> : null}
        <section aria-labelledby={`${titleId}-scores`} className="project-completion-dashboard__scores">
          <div className="project-completion-dashboard__section-heading" title={nonEmptyText(review.description)}>
            <div>
              <h2 id={`${titleId}-scores`}>评分结果</h2>
              {hasScore ? <p>{nonEmptyText(review.description)}</p> : null}
            </div>
            <span className="project-completion-dashboard__review-state">
              {isStale ? '评分已过期' : review.state === 'empty' ? '尚无评分' : nonEmptyText(review.title)}
            </span>
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
          {!hasScore ? (
            <div className="project-completion-dashboard__score-empty" role="status">
              <span>{emptyScoreMessage}</span>
              {onOpenReview && scoreIsStartable ? <button onClick={onOpenReview} type="button">
                {review.state === 'empty' ? '发起模拟评标' : '查看模拟评标'}
              </button> : null}
            </div>
          ) : null}
          {hasScore && (scaleLabel || score?.versionLabel || isStale || score?.formalFileVersionUnverified || finiteNumber(score?.missingMaterials) !== undefined) ? (
            <p className="project-completion-dashboard__score-basis">
              {scaleLabel ? <span>{scaleLabel}</span> : null}
              {score?.versionLabel ? <span>评分版本：{score.versionLabel}</span> : null}
              {finiteNumber(score?.missingMaterials) !== undefined ? <span>缺失材料：{score?.missingMaterials} 项</span> : null}
              {isStale ? <strong>成果已更新，当前分数仅供参考。</strong> : null}
              {score?.formalFileVersionUnverified ? <span>评分尚未关联正式文件版本，仅供参考。</span> : null}
            </p>
          ) : null}
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
              <FileDownloadButton
                label="下载"
                ariaLabel={`下载 ${recordFile.name}`}
                title={`下载 ${recordFile.name}`}
                className="project-completion-dashboard__record-download"
                onDownload={() => onDownloadRecordFile(recordFile)}
              />
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
