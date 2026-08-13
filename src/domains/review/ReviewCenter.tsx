import { useEffect, useMemo, useRef, useState } from 'react';
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
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  fail: { label: '必须处理', icon: CircleX, tone: styles.fail },
  risk: { label: '需额外资料', icon: AlertTriangle, tone: styles.risk },
  pass: { label: '已通过', icon: CheckCircle2, tone: styles.pass },
  unknown: { label: '可优化内容', icon: CircleHelp, tone: styles.unknown },
  abstain: { label: '可以策略加分', icon: Ban, tone: styles.abstain },
};

const formatScore = (value: number | undefined) => value === undefined ? '—' : value.toFixed(1);
const riskLabel = (finding: ReviewFinding) => {
  if (finding.riskLevel === 'high') return '高';
  if (finding.riskLevel === 'medium') return '中';
  if (finding.riskLevel === 'low') return '低';
  return '未知';
};

type ReviewCenterProps = {
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void | Promise<void>;
  onAddFiles: (files: File[]) => void | Promise<void>;
  onAssistantSend?: (value: string) => void | Promise<void>;
  projectId?: string;
  providers: ReviewProvider[];
  run: ReviewRunView;
  onRun?: (providerId: string) => void | Promise<void>;
  onSaveSuggestion?: (runId: string, findingId: string, suggestion: string) => void | Promise<void>;
  runAllowed?: boolean;
  runBlockReason?: string;
};

type SuggestionEditState = {
  draft: string;
  error?: string;
  findingId: string;
  runId: string;
};

type FindingFilter = 'all' | 'fail' | 'actionable' | `category:${string}`;

export function ReviewCenter({
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantSend,
  projectId,
  providers,
  run,
  onRun,
  onSaveSuggestion,
  runAllowed = true,
  runBlockReason,
}: ReviewCenterProps) {
  const firstAvailable = providers.find((provider) => provider.available)?.id ?? '';
  const [selectedProviderId, setSelectedProviderId] = useState(firstAvailable);
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const actualProvider = providers.find((provider) => provider.id === run.providerId);
  const [suggestionOverrides, setSuggestionOverrides] = useState<Record<string, string>>({});
  const [suggestionEdit, setSuggestionEdit] = useState<SuggestionEditState | null>(null);
  const [findingFilter, setFindingFilter] = useState<FindingFilter>('all');
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const hasCompletedFindings = run.status === 'succeeded' && run.findings.length > 0;
  const validatedSummary = hasCompletedFindings ? run.validatedSummary : undefined;
  const totalFindingCount = validatedSummary?.totalFindingCount ?? run.findings.length;
  const actionableCount = useMemo(
    () => run.findings.filter((finding) => finding.outcome !== 'pass').length,
    [run.findings],
  );
  const categoryFilters = useMemo(() => {
    const categories = new Map<string, { key: string; label: string; count: number }>();
    for (const category of validatedSummary?.categoryCounts ?? []) {
      categories.set(category.key, category);
    }
    for (const finding of run.findings) {
      if (!finding.category) continue;
      const existing = categories.get(finding.category);
      if (existing) continue;
      categories.set(finding.category, {
        key: finding.category,
        label: finding.category,
        count: run.findings.filter((item) => item.category === finding.category).length,
      });
    }
    return [...categories.values()];
  }, [run.findings, validatedSummary?.categoryCounts]);
  const visibleFindings = useMemo(() => {
    if (!hasCompletedFindings || findingFilter === 'all') return hasCompletedFindings ? run.findings : [];
    if (findingFilter === 'fail') return run.findings.filter((finding) => finding.outcome === 'fail');
    if (findingFilter === 'actionable') {
      return run.findings.filter((finding) => finding.outcome !== 'pass');
    }
    const category = findingFilter.slice('category:'.length);
    return run.findings.filter((finding) => finding.category === category);
  }, [findingFilter, hasCompletedFindings, run.findings]);
  const activeSuggestionEdit = suggestionEdit?.runId === run.id ? suggestionEdit : null;

  useEffect(() => {
    if (providers.some((provider) => provider.id === selectedProviderId && provider.available)) return;
    setSelectedProviderId(firstAvailable);
  }, [firstAvailable, providers, selectedProviderId]);

  useEffect(() => {
    setFindingFilter('all');
    setRunError(null);
    setIsSubmittingRun(false);
  }, [run.id]);

  const selectFindingFilter = (filter: FindingFilter) => {
    setFindingFilter(filter);
  };

  const runReview = async () => {
    if (!selectedProvider || !onRun || isSubmittingRun) return;
    setRunError(null);
    setIsSubmittingRun(true);
    try {
      await onRun(selectedProvider.id);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : '评审任务提交失败，请重试');
    } finally {
      setIsSubmittingRun(false);
    }
  };

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

  const saveSuggestion = async (finding: ReviewFinding) => {
    if (!activeSuggestionEdit || activeSuggestionEdit.findingId !== finding.id) return;
    const nextSuggestion = activeSuggestionEdit.draft.trim();
    if (!nextSuggestion) {
      setSuggestionEdit({ ...activeSuggestionEdit, error: '建议内容不能为空' });
      return;
    }

    try {
      await onSaveSuggestion?.(run.id, finding.id, nextSuggestion);
      setSuggestionOverrides((current) => ({
        ...current,
        [suggestionOverrideKey(run.id, finding.id)]: nextSuggestion,
      }));
      setSuggestionEdit(null);
    } catch (saveError) {
      setSuggestionEdit({
        ...activeSuggestionEdit,
        error: saveError instanceof Error ? saveError.message : '建议保存失败，请重试',
      });
    }
  };

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      footerHint="请输入您的问题，如“解释第 2 条提升建议的评审依据”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
      onAssistantSend={onAssistantSend}
      rightRail={
        <ReviewImpact
          actualProvider={actualProvider}
          providers={providers}
          run={run}
          runAllowed={runAllowed}
          runBlockReason={runBlockReason}
          canSubmitRun={Boolean(onRun && selectedProvider)}
          hasValidatedSummary={Boolean(validatedSummary)}
          isSubmittingRun={isSubmittingRun}
          runError={runError}
          selectedProviderId={selectedProviderId}
          onRun={runReview}
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
              <button
                aria-pressed={findingFilter === 'all'}
                className={findingFilter === 'all' ? styles.filterActive : undefined}
                type="button"
                onClick={() => selectFindingFilter('all')}
              >
                全部 <span>{totalFindingCount}</span>
              </button>
              <button
                aria-pressed={findingFilter === 'fail'}
                className={findingFilter === 'fail' ? styles.filterActive : undefined}
                type="button"
                onClick={() => selectFindingFilter('fail')}
              >
                必须处理 <span>{run.findings.filter((item) => item.outcome === 'fail').length}</span>
              </button>
              {categoryFilters.map((category) => (
                <button
                  aria-pressed={findingFilter === `category:${category.key}`}
                  className={findingFilter === `category:${category.key}` ? styles.filterActive : undefined}
                  key={category.key}
                  type="button"
                  onClick={() => selectFindingFilter(`category:${category.key}`)}
                >
                  {category.label} <span>{category.count}</span>
                </button>
              ))}
              <button
                aria-pressed={findingFilter === 'actionable'}
                className={findingFilter === 'actionable' ? styles.filterActive : undefined}
                type="button"
                onClick={() => selectFindingFilter('actionable')}
              >
                可以优化内容 <span>{actionableCount}</span>
              </button>
            </div>

            <div className={styles.tableHead} aria-hidden="true">
              <span>类型</span><span>建议内容</span><span>当前得分</span><span>预期提升</span><span>关联标/修订</span><span>风险等级</span><span>操作</span>
            </div>
          </>
        ) : null}

        <div className={styles.findings}>
          {visibleFindings.map((finding) => {
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
                          onClick={() => void saveSuggestion(finding)}
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
                <strong className={styles.currentScore}>{formatScore(finding.currentScore)} / {formatScore(finding.fullScore)}</strong>
                <strong className={styles.lift}>{finding.improvableScore === undefined ? '—' : `+${finding.improvableScore.toFixed(1)} 分`}</strong>
                <span className={styles.reference}>规则 {finding.ruleVersion}<small>置信度 {finding.confidence == null ? '未知' : `${Math.round(finding.confidence * 100)}%`}</small></span>
                <span className={`${styles.riskLevel} ${meta.tone}`}>{riskLabel(finding)}</span>
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
          ) : visibleFindings.length === 0 ? (
            <div className={styles.emptyFindings} role="status">
              当前筛选条件下没有评审建议。
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
  canSubmitRun: boolean;
  providers: ReviewProvider[];
  run: ReviewRunView;
  runAllowed: boolean;
  runBlockReason?: string;
  hasValidatedSummary: boolean;
  isSubmittingRun: boolean;
  runError: string | null;
  selectedProviderId: string;
  onRun: () => Promise<void>;
  onSelect: (id: string) => void;
  onAddFiles: (files: File[]) => void | Promise<void>;
};

function ReviewImpact({
  actualProvider,
  canSubmitRun,
  providers,
  run,
  runAllowed,
  runBlockReason,
  hasValidatedSummary,
  isSubmittingRun,
  runError,
  selectedProviderId,
  onRun,
  onSelect,
  onAddFiles,
}: ReviewImpactProps) {
  const supplementInputRef = useRef<HTMLInputElement>(null);
  const [staleSnapshotId, setStaleSnapshotId] = useState<string | null>(null);
  const [supplementState, setSupplementState] = useState<{ error: string | null; pending: boolean }>({
    error: null,
    pending: false,
  });
  const needsNewSnapshot = staleSnapshotId === run.projectSnapshotId;

  const addSupplementFiles = async (files: File[]) => {
    if (supplementState.pending) return;
    setSupplementState({ error: null, pending: true });
    try {
      await onAddFiles(files);
      setStaleSnapshotId(run.projectSnapshotId);
      setSupplementState({ error: null, pending: false });
    } catch (error) {
      setSupplementState({
        error: error instanceof Error && error.message ? error.message : '补充资料上传失败，请重试',
        pending: false,
      });
    }
  };

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

          {run.validatedSummary.sectionLifts ? (
            <div className={styles.impactCards}>
              <article><span><FileCheck2 size={18} /> 商务标可提升</span><strong>{run.validatedSummary.sectionLifts.business === undefined ? '—' : `+${run.validatedSummary.sectionLifts.business.toFixed(1)} 分`}</strong><p>来自后端评审汇总</p></article>
              <article><span><Lightbulb size={18} /> 技术标可提升</span><strong>{run.validatedSummary.sectionLifts.technical === undefined ? '—' : `+${run.validatedSummary.sectionLifts.technical.toFixed(1)} 分`}</strong><p>来自后端评审汇总</p></article>
              <article><span><Sparkles size={18} /> 报价单可提升</span><strong>{run.validatedSummary.sectionLifts.pricing === undefined ? '—' : `+${run.validatedSummary.sectionLifts.pricing.toFixed(1)} 分`}</strong><p>来自后端评审汇总</p></article>
            </div>
          ) : null}
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
          disabled={!canSubmitRun || !runAllowed || run.status === 'queued' || run.status === 'running' || needsNewSnapshot || isSubmittingRun}
          onClick={() => void onRun()}
          type="button"
        >
          <Play aria-hidden="true" size={16} />
          {isSubmittingRun
            ? '正在提交评审任务'
            : run.status === 'running'
            ? '评审执行中'
            : run.status === 'queued'
              ? '评审任务排队中'
            : needsNewSnapshot
              ? '请先冻结新快照'
              : '基于冻结快照运行评审'}
        </button>
        {runError ? <p className={styles.runError} role="alert">{runError}</p> : null}
        {!canSubmitRun ? <p className={styles.runBlocked}>当前没有可用的评审机制。</p> : null}
        {!runAllowed && runBlockReason ? <p className={styles.runBlocked}>{runBlockReason}</p> : null}
      </div>

      <button
        className={styles.improveButton}
        disabled={supplementState.pending}
        onClick={() => supplementInputRef.current?.click()}
        type="button"
      >
        <UploadCloud aria-hidden="true" size={20} />
        {supplementState.pending ? '正在上传补充资料…' : '上传项目补充资料'}
      </button>
      <input
        ref={supplementInputRef}
        aria-label="上传当前项目补充资料"
        className="bv-visually-hidden"
        disabled={supplementState.pending}
        multiple
        type="file"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length > 0) void addSupplementFiles(files);
        }}
      />
      {supplementState.error ? (
        <p className={styles.runError} role="alert">{supplementState.error}</p>
      ) : null}
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
