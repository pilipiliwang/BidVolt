import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Braces,
  CheckCircle2,
  CircleHelp,
  CircleX,
  CloudCog,
  FileCheck2,
  Play,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';

import styles from './ReviewCenter.module.css';
import type { ReviewFindingOutcome, ReviewProvider, ReviewProviderType, ReviewRunView } from './types';

const providerIcons: Record<ReviewProviderType, typeof CloudCog> = {
  api: CloudCog,
  sandbox_code: Braces,
  rule_engine: ShieldCheck,
  document_rule: ScrollText,
};

const providerLabels: Record<ReviewProviderType, string> = {
  api: '远程 API',
  sandbox_code: '沙箱代码',
  rule_engine: '规则引擎',
  document_rule: '文档规则',
};

const outcomeMeta: Record<
  ReviewFindingOutcome,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  fail: { label: '未通过', icon: CircleX, className: styles.fail },
  risk: { label: '风险', icon: AlertTriangle, className: styles.risk },
  pass: { label: '通过', icon: CheckCircle2, className: styles.pass },
  unknown: { label: '待确认', icon: CircleHelp, className: styles.unknown },
  abstain: { label: '未给出结论', icon: Ban, className: styles.abstain },
};

type ReviewCenterProps = {
  providers: ReviewProvider[];
  run: ReviewRunView;
  onRun?: (providerId: string) => void;
  runAllowed?: boolean;
  runBlockReason?: string;
};

export function ReviewCenter({
  providers,
  run,
  onRun,
  runAllowed = true,
  runBlockReason,
}: ReviewCenterProps) {
  const firstAvailable = providers.find((provider) => provider.available)?.id ?? '';
  const [selectedProviderId, setSelectedProviderId] = useState(firstAvailable);
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const actualProvider = providers.find((provider) => provider.id === run.providerId);

  const counts = useMemo(
    () =>
      run.findings.reduce(
        (summary, finding) => ({ ...summary, [finding.outcome]: summary[finding.outcome] + 1 }),
        { fail: 0, risk: 0, pass: 0, unknown: 0, abstain: 0 },
      ),
    [run.findings],
  );

  return (
    <section className={styles.page} aria-labelledby="review-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>ReviewProvider</span>
          <h2 id="review-title">外部评审中心</h2>
          <p>统一接入 API、受限代码与规则引擎。所有结果都绑定冻结快照和证据。</p>
        </div>
        <div className={styles.snapshot}>
          <FileCheck2 aria-hidden="true" size={19} />
          <span>冻结快照</span>
          <strong>{run.projectSnapshotId}</strong>
        </div>
      </header>

      <div className={styles.notice} role="note">
        <ShieldCheck aria-hidden="true" size={19} />
        <div>
          <strong>评审结果不会直接修改成果</strong>
          <span>建议需要人工确认或进入受控整改流程，外部 Provider 不接触浏览器凭据。</span>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.providerPanel} aria-label="评审机制">
          <div className={styles.panelHeading}>
            <div>
              <span>本次评审机制</span>
              <strong>选择 Provider</strong>
            </div>
            <span className={styles.count}>{providers.length}</span>
          </div>

          <div className={styles.providerList}>
            {providers.map((provider) => {
              const Icon = providerIcons[provider.type];
              const active = selectedProviderId === provider.id;
              return (
                <button
                  aria-pressed={active}
                  className={`${styles.providerCard} ${active ? styles.providerActive : ''}`}
                  disabled={!provider.available}
                  key={provider.id}
                  onClick={() => setSelectedProviderId(provider.id)}
                  type="button"
                >
                  <span className={styles.providerIcon}>
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span className={styles.providerCopy}>
                    <strong>{provider.name}</strong>
                    <small>
                      {providerLabels[provider.type]} · {provider.version}
                    </small>
                    <span>{provider.description}</span>
                  </span>
                  <span className={provider.available ? styles.available : styles.offline}>
                    {provider.available ? '可用' : '停用'}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            className={styles.runButton}
            disabled={!selectedProvider || !runAllowed || run.status === 'running'}
            onClick={() => selectedProvider && onRun?.(selectedProvider.id)}
            type="button"
          >
            <Play aria-hidden="true" size={17} />
            {run.status === 'running' ? '评审执行中' : '基于冻结快照运行评审'}
          </button>
          {!runAllowed && runBlockReason ? (
            <p className={styles.runBlocked}>{runBlockReason}</p>
          ) : null}
        </aside>

        <div className={styles.results}>
          <div className={styles.resultHeader}>
            <div>
              <span>最近一次运行</span>
              <strong>{run.id}</strong>
            </div>
            <span className={`${styles.status} ${styles[run.status]}`}>{statusLabel(run.status)}</span>
          </div>

          <div className={styles.runContext} aria-label="实际评审执行信息">
            <span>
              实际 Provider
              <strong>{actualProvider?.name ?? '尚未运行'}</strong>
            </span>
            <span>
              Provider 版本
              <strong>{run.providerVersion ?? actualProvider?.version ?? '—'}</strong>
            </span>
          </div>

          <div className={styles.metrics} aria-label="评审结果汇总">
            <Metric label="未通过" tone="fail" value={counts.fail} />
            <Metric label="风险" tone="risk" value={counts.risk} />
            <Metric label="通过" tone="pass" value={counts.pass} />
            <Metric label="待确认" tone="unknown" value={counts.unknown} />
            <Metric label="未给出结论" tone="abstain" value={counts.abstain} />
            <div className={styles.versionMetric}>
              <span>成果版本</span>
              <strong>{run.deliverableVersions.join(' · ')}</strong>
            </div>
          </div>

          <div className={styles.findings}>
            {run.findings.map((finding) => {
              const meta = outcomeMeta[finding.outcome];
              const OutcomeIcon = meta.icon;
              const evidenceVerification = finding.evidence.verification;
              return (
                <article className={styles.finding} key={finding.id}>
                  <div className={`${styles.outcomeIcon} ${meta.className}`}>
                    <OutcomeIcon aria-hidden="true" size={18} />
                  </div>
                  <div className={styles.findingBody}>
                    <div className={styles.findingTitle}>
                      <h2>{finding.title}</h2>
                      <span className={meta.className}>{meta.label}</span>
                    </div>
                    <p>{finding.suggestion}</p>
                    <div className={styles.evidence}>
                      <span>{finding.evidence.sourceLabel}</span>
                      <strong>{finding.evidence.locator}</strong>
                      {evidenceVerification === 'verified' && finding.evidence.exactQuote ? (
                        <q>{finding.evidence.exactQuote}</q>
                      ) : null}
                      {evidenceVerification === 'hidden_unverified' ? (
                        <em className={styles.evidenceNotice}>未验证，引用内容已隐藏</em>
                      ) : null}
                      {evidenceVerification === 'missing' ? (
                        <em className={styles.evidenceNotice}>未提供可核验的证据</em>
                      ) : null}
                    </div>
                    <div className={styles.findingMeta}>
                      <span>规则 {finding.ruleVersion}</span>
                      <span>
                        置信度 {finding.confidence == null ? '未知' : `${Math.round(finding.confidence * 100)}%`}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
            {run.findings.length === 0 ? (
              <div className={styles.emptyFindings} role="status">
                {run.status === 'running'
                  ? 'Provider 正在处理冻结快照，旧评审结果已从当前视图移除。'
                  : '当前项目还没有可展示的评审结果。'}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className={`${styles.metric} ${styles[tone]}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function statusLabel(status: ReviewRunView['status']) {
  const labels: Record<ReviewRunView['status'], string> = {
    idle: '未运行',
    queued: '排队中',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
    invalid_response: '响应无效',
    timed_out: '已超时',
  };
  return labels[status];
}
