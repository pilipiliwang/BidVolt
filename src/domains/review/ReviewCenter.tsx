import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Braces,
  CheckCircle2,
  CircleHelp,
  CircleX,
  CloudCog,
  FileCheck2,
  Lightbulb,
  PencilLine,
  Play,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { AppLink } from '../../app/router';
import {
  ProjectWorkbench,
  ScoreRing,
  type WorkspaceMaterial,
} from '../projects/ProjectWorkbench';
import styles from './ReviewCenter.module.css';
import type {
  ReviewFinding,
  ReviewFindingOutcome,
  ReviewProvider,
  ReviewProviderType,
  ReviewRunView,
} from './types';

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
  { label: string; icon: typeof CheckCircle2; tone: string; lift: string }
> = {
  fail: { label: '必须处理', icon: CircleX, tone: styles.fail, lift: '+5.0 分' },
  risk: { label: '需额外资料', icon: AlertTriangle, tone: styles.risk, lift: '+3.0 分' },
  pass: { label: '已通过', icon: CheckCircle2, tone: styles.pass, lift: '+0.0 分' },
  unknown: { label: '可优化内容', icon: CircleHelp, tone: styles.unknown, lift: '+2.0 分' },
  abstain: { label: '可以策略加分', icon: Ban, tone: styles.abstain, lift: '+1.0 分' },
};

type ReviewCenterProps = {
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles: (files: File[]) => void;
  projectId?: string;
  providers: ReviewProvider[];
  run: ReviewRunView;
  onRun?: (providerId: string) => void;
  runAllowed?: boolean;
  runBlockReason?: string;
};

type SuggestionEditState = {
  draft: string;
  error?: string;
  findingId: string;
  runId: string;
};

export function ReviewCenter({
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  projectId,
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
  const [suggestionOverrides, setSuggestionOverrides] = useState<Record<string, string>>({});
  const [suggestionEdit, setSuggestionEdit] = useState<SuggestionEditState | null>(null);
  const hasCompletedFindings = run.status === 'succeeded' && run.findings.length > 0;
  const visibleFindings = hasCompletedFindings ? run.findings : [];
  const validatedSummary = hasCompletedFindings ? run.validatedSummary : undefined;
  const totalFindingCount = validatedSummary?.totalFindingCount ?? run.findings.length;
  const actionableCount = useMemo(
    () => run.findings.filter((finding) => finding.outcome !== 'pass').length,
    [run.findings],
  );
  const activeSuggestionEdit = suggestionEdit?.runId === run.id ? suggestionEdit : null;

  const beginSuggestionEdit = (finding: ReviewFinding) => {
    const currentSuggestion =
      suggestionOverrides[suggestionOverrideKey(run.id, finding.id)] ?? finding.suggestion;
    setSuggestionEdit({
      draft: currentSuggestion,
      error: currentSuggestion.trim() ? undefined : '建议内容不能为空',
      findingId: finding.id,
      runId: run.id,
    });
  };

  const updateSuggestionDraft = (draft: string) => {
    setSuggestionEdit((current) =>
      current && current.runId === run.id
        ? { ...current, draft, error: draft.trim() ? undefined : '建议内容不能为空' }
        : current,
    );
  };

  const saveSuggestion = (finding: ReviewFinding) => {
    if (!activeSuggestionEdit || activeSuggestionEdit.findingId !== finding.id) return;
    const nextSuggestion = activeSuggestionEdit.draft.trim();
    if (!nextSuggestion) {
      setSuggestionEdit({ ...activeSuggestionEdit, error: '建议内容不能为空' });
      return;
    }

    setSuggestionOverrides((current) => ({
      ...current,
      [suggestionOverrideKey(run.id, finding.id)]: nextSuggestion,
    }));
    setSuggestionEdit(null);
  };

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      footerHint="请输入您的问题，如“解释第 2 条提升建议的评审依据”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
      rightRail={
        <ReviewImpact
          actualProvider={actualProvider}
          providers={providers}
          run={run}
          runAllowed={runAllowed}
          runBlockReason={runBlockReason}
          hasValidatedSummary={Boolean(validatedSummary)}
          selectedProviderId={selectedProviderId}
          onRun={() => selectedProvider && onRun?.(selectedProvider.id)}
          onSelect={setSelectedProviderId}
          onAddFiles={onAddFiles}
        />
      }
    >
      <section className={styles.suggestions} aria-labelledby="review-title">
        {projectId ? (
          <AppLink className="bv-visually-hidden" to={`/projects/${projectId}/pricing`}>
            报价分析
          </AppLink>
        ) : null}
        <header className={styles.suggestionHeader}>
          <div>
            <h1 id="review-title">
              提升建议{' '}
              <small>
                {hasCompletedFindings
                  ? `（共识别 ${totalFindingCount} 项可提升点）`
                  : run.status === 'running'
                    ? '（评审执行中）'
                    : '（暂无可用结论）'}
              </small>
            </h1>
            <p>评审结果不会直接修改成果，所有建议均需人工确认后进入受控整改。</p>
          </div>
          <div className={styles.snapshot}>
            <FileCheck2 aria-hidden="true" size={17} />
            <span>冻结快照</span>
            <strong>{run.projectSnapshotId}</strong>
          </div>
        </header>

        {hasCompletedFindings ? (
          <>
            <div className={styles.filters} aria-label="建议筛选">
              <button className={styles.filterActive} type="button">全部 <span>{totalFindingCount}</span></button>
              <button type="button">必须处理 <span>{run.findings.filter((item) => item.outcome === 'fail').length}</span></button>
              {validatedSummary?.categoryCounts.map((category) => (
                <button key={category.key} type="button">{category.label} <span>{category.count}</span></button>
              ))}
              <button type="button">可以优化内容 <span>{actionableCount}</span></button>
            </div>

            <div className={styles.tableHead} aria-hidden="true">
              <span>类型</span><span>建议内容</span><span>当前得分</span><span>预期提升</span><span>关联标/修订</span><span>风险等级</span><span>操作</span>
            </div>
          </>
        ) : null}

        <div className={styles.findings}>
          {visibleFindings.map((finding, index) => {
            const meta = outcomeMeta[finding.outcome];
            const OutcomeIcon = meta.icon;
            const isEditing = activeSuggestionEdit?.findingId === finding.id;
            const suggestion =
              suggestionOverrides[suggestionOverrideKey(run.id, finding.id)] ?? finding.suggestion;
            const errorId = `review-suggestion-error-${finding.id}`;
            return (
              <article className={styles.finding} key={finding.id}>
                <div className={`${styles.typeBadge} ${meta.tone}`}>
                  <OutcomeIcon aria-hidden="true" size={14} />
                  <span>{meta.label}</span>
                </div>
                <div className={styles.findingBody}>
                  <strong>{finding.title}</strong>
                  {isEditing && activeSuggestionEdit ? (
                    <div className={styles.suggestionEditor}>
                      <textarea
                        autoFocus
                        aria-describedby={activeSuggestionEdit.error ? errorId : undefined}
                        aria-invalid={Boolean(activeSuggestionEdit.error)}
                        aria-label={`编辑“${finding.title}”的建议内容`}
                        value={activeSuggestionEdit.draft}
                        onChange={(event) => updateSuggestionDraft(event.currentTarget.value)}
                      />
                      {activeSuggestionEdit.error ? (
                        <p id={errorId} role="alert">{activeSuggestionEdit.error}</p>
                      ) : null}
                      <div className={styles.suggestionEditorActions}>
                        <button
                          aria-label={`保存建议：${finding.title}`}
                          disabled={!activeSuggestionEdit.draft.trim()}
                          type="button"
                          onClick={() => saveSuggestion(finding)}
                        >
                          保存
                        </button>
                        <button
                          aria-label={`取消编辑：${finding.title}`}
                          type="button"
                          onClick={() => setSuggestionEdit(null)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className={styles.suggestionText}>{suggestion}</span>
                  )}
                  <small>
                    {finding.evidence.sourceLabel} · <b>{finding.evidence.locator}</b>
                    {finding.evidence.verification === 'verified' && finding.evidence.exactQuote
                      ? ` · “${finding.evidence.exactQuote}”`
                      : null}
                    {finding.evidence.verification === 'hidden_unverified' ? ' · 未验证，引用内容已隐藏' : null}
                    {finding.evidence.verification === 'missing' ? ' · 未提供可核验的证据' : null}
                  </small>
                </div>
                <strong className={styles.currentScore}>{finding.outcome === 'pass' ? '5.0 / 5' : `${index + 1}.0 / 5`}</strong>
                <strong className={styles.lift}>{meta.lift}</strong>
                <span className={styles.reference}>规则 {finding.ruleVersion}<small>置信度 {finding.confidence == null ? '未知' : `${Math.round(finding.confidence * 100)}%`}</small></span>
                <span className={`${styles.riskLevel} ${meta.tone}`}>{finding.outcome === 'fail' || finding.outcome === 'risk' ? '高' : finding.outcome === 'pass' ? '低' : '中'}</span>
                <button
                  aria-label={`编辑建议：${finding.title}`}
                  className={styles.modifyButton}
                  disabled={isEditing}
                  type="button"
                  onClick={() => beginSuggestionEdit(finding)}
                >
                  <PencilLine aria-hidden="true" size={13} />
                  编辑建议
                </button>
              </article>
            );
          })}
          {!hasCompletedFindings ? (
            <div className={styles.emptyFindings} role="status">
              {emptyResultsLabel(run.status)}
            </div>
          ) : null}
        </div>

        <div className={styles.controlledNotice} role="note">
          <ShieldCheck aria-hidden="true" size={16} />
          <strong>评审结果不会直接修改成果</strong>
          <span>外部 Provider 通过服务端适配器交换冻结快照与结构化结果，不接触浏览器凭据。</span>
        </div>
      </section>
    </ProjectWorkbench>
  );
}

function suggestionOverrideKey(runId: string, findingId: string) {
  return `${runId}:${findingId}`;
}

type ReviewImpactProps = {
  actualProvider?: ReviewProvider;
  providers: ReviewProvider[];
  run: ReviewRunView;
  runAllowed: boolean;
  runBlockReason?: string;
  hasValidatedSummary: boolean;
  selectedProviderId: string;
  onRun: () => void;
  onSelect: (id: string) => void;
  onAddFiles: (files: File[]) => void;
};

function ReviewImpact({
  actualProvider,
  providers,
  run,
  runAllowed,
  runBlockReason,
  hasValidatedSummary,
  selectedProviderId,
  onRun,
  onSelect,
  onAddFiles,
}: ReviewImpactProps) {
  const supplementInputRef = useRef<HTMLInputElement>(null);
  const [staleSnapshotId, setStaleSnapshotId] = useState<string | null>(null);
  const needsNewSnapshot = staleSnapshotId === run.projectSnapshotId;

  return (
    <section className={styles.impact} aria-label="提升效果预估">
      <h2>提升效果预估</h2>
      {hasValidatedSummary && run.validatedSummary ? (
        <>
          <div className={styles.scoreCompare}>
            <div><span>当前综合得分</span><strong>{run.validatedSummary.currentScore.toFixed(1)}</strong><small>/100</small></div>
            <ArrowRight aria-hidden="true" size={28} />
            <ScoreRing label="执行建议后预估" score={run.validatedSummary.predictedScore} />
          </div>
          <strong className={styles.totalLift}>+{run.validatedSummary.totalLift.toFixed(1)} 分</strong>

          <div className={styles.impactCards}>
            <article><span><FileCheck2 size={18} /> 商务标可提升</span><strong>+{run.validatedSummary.sectionLifts.business.toFixed(1)} 分</strong><p>资信文件完整性优化、格式规范修正等</p></article>
            <article><span><Lightbulb size={18} /> 技术标可提升</span><strong>+{run.validatedSummary.sectionLifts.technical.toFixed(1)} 分</strong><p>方案匹配度提升、安全措施完善等</p></article>
            <article><span><Sparkles size={18} /> 报价单可提升</span><strong>+{run.validatedSummary.sectionLifts.pricing.toFixed(1)} 分</strong><p>金额一致性修正、细节规范优化等</p></article>
          </div>
        </>
      ) : (
        <div className={styles.impactPending} role="status">
          <CircleHelp aria-hidden="true" size={28} />
          <strong>{impactStatusTitle(run.status)}</strong>
          <p>{impactStatusDescription(run.status)}</p>
          <span>{statusLabel(run.status)}</span>
        </div>
      )}

      <div className={styles.providerBox} aria-label="评审机制">
        <div className={styles.providerHeading}>
          <span>评审机制</span>
          <small>实际运行：{actualProvider?.name ?? '尚未运行'} · {statusLabel(run.status)}</small>
        </div>
        <div className={styles.providerList}>
          {providers.map((provider) => {
            const Icon = providerIcons[provider.type];
            return (
              <button
                aria-pressed={selectedProviderId === provider.id}
                disabled={!provider.available}
                key={provider.id}
                type="button"
                onClick={() => onSelect(provider.id)}
              >
                <Icon aria-hidden="true" size={15} />
                <span>{provider.name}<small>{providerLabels[provider.type]} · {provider.version}</small></span>
              </button>
            );
          })}
        </div>
        <button
          className={styles.runButton}
          disabled={!runAllowed || run.status === 'running' || needsNewSnapshot}
          onClick={onRun}
          type="button"
        >
          <Play aria-hidden="true" size={16} />
          {run.status === 'running'
            ? '评审执行中'
            : needsNewSnapshot
              ? '请先冻结新快照'
              : '基于冻结快照运行评审'}
        </button>
        {!runAllowed && runBlockReason ? <p className={styles.runBlocked}>{runBlockReason}</p> : null}
      </div>

      <button
        className={styles.improveButton}
        onClick={() => supplementInputRef.current?.click()}
        type="button"
      >
        <UploadCloud aria-hidden="true" size={20} />
        上传项目补充资料
      </button>
      <input
        ref={supplementInputRef}
        aria-label="上传当前项目补充资料"
        className="bv-visually-hidden"
        multiple
        type="file"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) {
            onAddFiles(files);
            setStaleSnapshotId(run.projectSnapshotId);
          }
          event.currentTarget.value = '';
        }}
      />
      {needsNewSnapshot ? (
        <p className={styles.runBlocked} role="status">
          补充资料已加入当前项目；请冻结新快照后重新运行评审。
        </p>
      ) : null}
    </section>
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

function emptyResultsLabel(status: ReviewRunView['status']) {
  const labels: Record<ReviewRunView['status'], string> = {
    idle: '当前项目还没有可展示的评审结果。',
    queued: 'Provider 已进入队列，完成前不会展示评审结论。',
    running: 'Provider 正在处理冻结快照，旧评审结果已从当前视图移除。',
    succeeded: '评审已完成，但 Provider 未返回可展示的评审结论。',
    failed: '本次评审执行失败，没有可展示的评审结论。',
    invalid_response: 'Provider 响应无效，没有可展示的评审结论。',
    timed_out: '本次评审已超时，没有可展示的评审结论。',
  };
  return labels[status];
}

function impactStatusTitle(status: ReviewRunView['status']) {
  if (status === 'queued' || status === 'running') return '提升效果正在计算';
  if (status === 'succeeded') return '暂无可用提升效果';
  if (status === 'idle') return '尚未运行评审';
  return '提升效果暂不可用';
}

function impactStatusDescription(status: ReviewRunView['status']) {
  if (status === 'queued' || status === 'running') {
    return '等待 Provider 返回经校验的结构化结果后，才会展示得分与预计提升。';
  }
  if (status === 'succeeded') {
    return 'Provider 未返回经过校验的评分摘要，因此不展示得分或提升幅度。';
  }
  if (status === 'idle') {
    return '基于冻结快照完成评审后，系统才会展示可核验的提升效果。';
  }
  return '本次运行没有形成可信结论，请检查运行状态后重试。';
}
