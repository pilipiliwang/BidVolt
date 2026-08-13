import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Calculator,
  Check,
  CircleHelp,
  Database,
  LockKeyhole,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';

import { ProjectWorkbench, type WorkspaceMaterial } from '../projects/ProjectWorkbench';
import styles from './PricingCenter.module.css';
import type { HistoryPriceSample, QuoteCalculationView } from './types';

type PricingCenterProps = {
  samples: HistoryPriceSample[];
  calculation: QuoteCalculationView;
  enterpriseMaterials?: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  onApply?: (strategyId: string) => Promise<void> | void;
  onAssistantSend?: (value: string) => void;
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  );
}

function formatCurrencyAmount(amount: string) {
  if (!amount.trim()) return '—';
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '—';
  return numericAmount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatOptionalCurrency(amount: number | null) {
  return amount === null
    ? '—'
    : amount.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function calculateSampleStats(samples: HistoryPriceSample[]) {
  const pricedSamples = samples
    .map((sample) => ({ ...sample, numericPrice: Number(sample.price) }))
    .filter((sample) => Number.isFinite(sample.numericPrice));
  const orderedPrices = pricedSamples.map((sample) => sample.numericPrice).sort((a, b) => a - b);
  const middle = Math.floor(orderedPrices.length / 2);
  const median = orderedPrices.length
    ? orderedPrices.length % 2
      ? orderedPrices[middle]
      : (orderedPrices[middle - 1] + orderedPrices[middle]) / 2
    : null;
  const latest = [...pricedSamples].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return {
    average: orderedPrices.length
      ? orderedPrices.reduce((sum, amount) => sum + amount, 0) / orderedPrices.length
      : null,
    latest: latest?.numericPrice ?? null,
    latestAt: latest?.occurredAt ?? '',
    maximum: orderedPrices.at(-1) ?? null,
    median,
    minimum: orderedPrices[0] ?? null,
  };
}

const riskLabels = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
} as const;

export function PricingCenter({
  samples,
  calculation,
  enterpriseMaterials = [],
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onApply,
  onAssistantSend,
}: PricingCenterProps) {
  const recommendedStrategy = calculation.strategies.find((strategy) => strategy.recommended);
  const hasCalculatedResult = calculation.status === 'calculated' && Boolean(recommendedStrategy);
  const defaultStrategy = recommendedStrategy?.id ?? '';
  const [selectedStrategyId, setSelectedStrategyId] = useState(defaultStrategy);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const isApplyingRef = useRef(false);
  const [sampleQuery, setSampleQuery] = useState('');
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const modalCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const usableSamples = useMemo(() => samples.filter((sample) => sample.usable), [samples]);
  const sampleStats = useMemo(() => calculateSampleStats(usableSamples), [usableSamples]);
  const sampleScope = useMemo(() => {
    const materialNames = [...new Set(usableSamples.map((sample) => sample.materialName).filter(Boolean))];
    const specifications = [...new Set(usableSamples.map((sample) => sample.specification).filter(Boolean))];
    return {
      material: materialNames.length === 1 ? materialNames[0] : materialNames.length ? `${materialNames.length} 种材料` : '—',
      specification: specifications.length === 1 ? specifications[0] : specifications.length ? `${specifications.length} 种规格` : '—',
    };
  }, [usableSamples]);
  const visibleSamples = useMemo(() => {
    const normalizedQuery = sampleQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return samples;
    return samples.filter((sample) =>
      `${sample.materialName} ${sample.specification} ${sample.sourceLabel}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [sampleQuery, samples]);
  const selectedStrategy = calculation.strategies.find((strategy) => strategy.id === selectedStrategyId);

  useEffect(() => {
    setSelectedStrategyId(defaultStrategy);
  }, [defaultStrategy]);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    modalCloseButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isApplyingRef.current) setConfirmOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusableElements = getFocusableElements(modalRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1)!;
      const activeElement = document.activeElement;
      const focusIsOutsideModal = !modalRef.current.contains(activeElement);
      if (event.shiftKey && (activeElement === firstElement || focusIsOutsideModal)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || focusIsOutsideModal)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      previouslyFocusedRef.current = null;
    };
  }, [confirmOpen]);

  const openConfirm = () => {
    previouslyFocusedRef.current = applyButtonRef.current;
    setApplyError('');
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (isApplying) return;
    setConfirmOpen(false);
  };

  const confirmApply = async () => {
    if (!selectedStrategy || !onApply || isApplying) return;
    setApplyError('');
    setIsApplying(true);
    isApplyingRef.current = true;
    try {
      await onApply(selectedStrategy.id);
      setConfirmOpen(false);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : '报价策略应用失败，请稍后重试。');
    } finally {
      isApplyingRef.current = false;
      setIsApplying(false);
    }
  };

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      footerHint="请输入您的问题，如“解释当前单价的时间与地区调整”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
      onAssistantSend={onAssistantSend}
      rightRail={
        <section className={styles.strategies} aria-labelledby="strategy-title">
          <header><h2 id="strategy-title">报价策略</h2><CircleHelp aria-hidden="true" size={15} /></header>
          {hasCalculatedResult ? (
            <>
              <div className={styles.strategyList}>
                {calculation.strategies.map((strategy) => {
                  const selected = strategy.id === selectedStrategyId;
                  return (
                    <button
                      aria-pressed={selected}
                      className={selected ? styles.strategySelected : undefined}
                      key={strategy.id}
                      onClick={() => setSelectedStrategyId(strategy.id)}
                      type="button"
                    >
                      <span className={styles.strategyTopline}>
                        <strong>{strategy.name}{strategy.recommended ? '（推荐）' : ''}</strong>
                        {strategy.recommended ? <em>推荐</em> : <i aria-hidden="true" />}
                      </span>
                      <dl>
                        <div><dt>建议报价（元）</dt><dd>{formatCurrencyAmount(strategy.amount)}</dd></div>
                        {strategy.predictedScore ? <div><dt>预防价格得分</dt><dd>{strategy.predictedScore} / 100</dd></div> : null}
                        {strategy.grossMargin ? <div><dt>预防毛利率</dt><dd>{strategy.grossMargin}</dd></div> : null}
                        {strategy.riskLevel ? (
                          <div>
                            <dt>风险等级</dt>
                            <dd className={strategy.riskLevel === 'low' ? styles.lowRisk : strategy.riskLevel === 'high' ? styles.highRisk : styles.mediumRisk}>
                              {riskLabels[strategy.riskLevel]}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <p>策略说明：{strategy.description}</p>
                    </button>
                  );
                })}
              </div>
              <button
                ref={applyButtonRef}
                className={styles.applyButton}
                disabled={!selectedStrategy}
                onClick={openConfirm}
                type="button"
              >
                <Check aria-hidden="true" size={18} />
                应用到报价单并生成新版本
              </button>
            </>
          ) : (
            <InsufficientState calculation={calculation} />
          )}
        </section>
      }
    >
      <section className={styles.basis} aria-labelledby="pricing-title">
        <header className={styles.basisHeader}>
          <div>
            <h1 id="pricing-title">单价测算依据</h1>
            <p>历史价格取值与确定性算法测算过程</p>
          </div>
          <div className={styles.readOnlyBadge}>
            <LockKeyhole aria-hidden="true" size={15} />
            <span><strong>外部历史库只读</strong>仅查询，不新增、修改或删除</span>
          </div>
        </header>

        {hasCalculatedResult && recommendedStrategy ? (
          <div className={styles.materialSummary}>
            <div><span>测算样本材料</span><strong>{sampleScope.material}</strong></div>
            <div><span>样本规格口径</span><strong>{sampleScope.specification}</strong></div>
            <div><span>可用样本</span><strong>{usableSamples.length} 条</strong></div>
            <div className={styles.suggested}><span>算法建议报价（元）</span><strong>{formatCurrencyAmount(recommendedStrategy.amount)}</strong></div>
            <div><span>建议范围（元）</span><strong>{formatCurrencyAmount(recommendedStrategy.confidenceLow)} ~ {formatCurrencyAmount(recommendedStrategy.confidenceHigh)}</strong></div>
          </div>
        ) : null}

        {hasCalculatedResult ? (
          <>
            <div className={styles.detailTitle}>测算依据明细</div>
            <div className={styles.metrics}>
              <Metric label="历史中标价中位数（元）" value={formatOptionalCurrency(sampleStats.median)} source="当前可用历史样本" />
              <Metric label="历史中标价平均值（元）" value={formatOptionalCurrency(sampleStats.average)} source="当前可用历史样本" />
              <Metric label="历史中标价最低值（元）" value={formatOptionalCurrency(sampleStats.minimum)} source="当前可用历史样本" />
              <Metric label="历史中标价最高值（元）" value={formatOptionalCurrency(sampleStats.maximum)} source="当前可用历史样本" />
              <Metric label="最近样本中标价（元）" value={formatOptionalCurrency(sampleStats.latest)} source={sampleStats.latestAt ? `样本日期：${sampleStats.latestAt}` : '当前无可用样本'} />
              <Metric label="建议区间下限（元）" value={recommendedStrategy ? formatCurrencyAmount(recommendedStrategy.confidenceLow) : '—'} source="算法返回结果" />
              <Metric label="建议区间上限（元）" value={recommendedStrategy ? formatCurrencyAmount(recommendedStrategy.confidenceHigh) : '—'} source="算法返回结果" />
              <Metric label="算法版本" value={calculation.algorithmVersion || '—'} source="报价算法服务" />
              <div className={styles.formula}><span>测算追溯信息</span><strong>样本快照：{calculation.sampleSnapshotId || '—'} · 查询快照：{calculation.querySnapshotId || '—'}</strong></div>
            </div>

            <div className={styles.analysisGrid}>
              <section aria-label="价格趋势">
                <header><span>价格趋势（按可用历史样本）</span><small><i /> 样本中标价</small></header>
                <SamplePriceChart samples={usableSamples} />
              </section>

              <section className={styles.samplePanel} aria-labelledby="samples-title">
                <header>
                  <span id="samples-title">可比历史中标样本</span>
                  <label className={styles.searchBox}>
                    <Search aria-hidden="true" size={13} />
                    <span className="bv-visually-hidden">筛选历史样本</span>
                    <input placeholder="筛选样本" type="search" value={sampleQuery} onChange={(event) => setSampleQuery(event.currentTarget.value)} />
                  </label>
                </header>
                <div className={styles.sampleTable}>
                  <div className={styles.sampleTableHead}><span>项目名称</span><span>规格/来源</span><span>中标时间</span><span>中标价（元）</span></div>
                  {visibleSamples.map((sample) => (
                    <article className={!sample.usable ? styles.excluded : undefined} key={sample.id}>
                      <span>{sample.materialName}</span>
                      <span>{sample.specification}<small>{sample.sourceLabel}</small></span>
                      <time>{sample.occurredAt}</time>
                      <strong>{Number(sample.price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</strong>
                      {sample.usable ? <BadgeCheck aria-label="可用于测算" size={14} /> : <ShieldAlert aria-label="已排除" size={14} />}
                    </article>
                  ))}
                  {visibleSamples.length === 0 ? <p>没有匹配的历史样本，请调整筛选条件。</p> : null}
                </div>
                <footer><Database aria-hidden="true" size={14} />已获取 {usableSamples.length} 条可用样本 · 查询快照 {calculation.querySnapshotId}</footer>
              </section>
            </div>
          </>
        ) : null}
      </section>

      {confirmOpen && selectedStrategy ? (
        <div aria-labelledby="quote-confirm-title" aria-modal="true" className={styles.modalBackdrop} role="dialog">
          <div ref={modalRef} className={styles.modal} tabIndex={-1}>
            <button ref={modalCloseButtonRef} aria-label="关闭确认" className={styles.modalClose} disabled={isApplying} onClick={closeConfirm} type="button"><X aria-hidden="true" size={18} /></button>
            <span className={styles.modalIcon}><Calculator aria-hidden="true" size={22} /></span>
            <h2 id="quote-confirm-title">确认应用“{selectedStrategy.name}”</h2>
            <p>本操作会把算法结果写入报价单并生成一个新版本，不会回写外部历史报价库。</p>
            <div className={styles.modalAmount}>{selectedStrategy.currency} {formatCurrencyAmount(selectedStrategy.amount)}</div>
            {applyError ? <p className={styles.modalError} role="alert">{applyError}</p> : null}
            <div className={styles.modalActions}>
              <button disabled={isApplying} onClick={closeConfirm} type="button">取消</button>
              <button className={styles.confirmButton} disabled={isApplying || !onApply} onClick={() => void confirmApply()} type="button">
                {isApplying ? '正在生成…' : '确认生成新版本'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ProjectWorkbench>
  );
}

function Metric({ label, source, value }: { label: string; source: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{source}</small></div>;
}

function SamplePriceChart({ samples }: { samples: HistoryPriceSample[] }) {
  const points = [...samples]
    .map((sample) => ({
      date: sample.occurredAt,
      id: sample.id,
      value: Number(sample.price),
    }))
    .filter((sample) => Number.isFinite(sample.value))
    .sort((first, second) => first.date.localeCompare(second.date));

  if (points.length === 0) {
    return <div className={styles.insufficient} role="status"><p>暂无可用于绘制价格趋势的历史样本。</p></div>;
  }

  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(maximum * 0.1, 1);
  const lowerBound = minimum - spread * 0.1;
  const upperBound = maximum + spread * 0.1;
  const width = 391;
  const height = 111;
  const xFor = (index: number) => 44 + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
  const yFor = (value: number) => 28 + ((upperBound - value) / (upperBound - lowerBound)) * height;
  const linePoints = points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ');
  const labelIndexes = points.length <= 3
    ? points.map((_, index) => index)
    : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <svg className={styles.chart} viewBox="0 0 450 185" role="img" aria-label="历史样本价格趋势折线图">
      <title>历史样本价格趋势</title>
      <desc>根据当前加载且可用于测算的 {points.length} 条历史报价样本绘制。</desc>
      <g className={styles.gridLines}><path d="M44 28H435M44 65H435M44 102H435M44 139H435" /></g>
      <polyline className={styles.meanLine} points={linePoints} />
      {points.map((point, index) => (
        <circle key={point.id} cx={xFor(index)} cy={yFor(point.value)} r="3.5" fill="#278965" />
      ))}
      <g className={styles.axisLabels}>
        {[0, 1, 2, 3].map((index) => (
          <text key={index} x="2" y={31 + index * 37}>
            {Math.round(upperBound - ((upperBound - lowerBound) * index) / 3).toLocaleString('zh-CN')}
          </text>
        ))}
        {labelIndexes.map((index) => (
          <text
            key={points[index].id}
            x={xFor(index)}
            y="170"
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          >
            {points[index].date}
          </text>
        ))}
      </g>
    </svg>
  );
}

function InsufficientState({ calculation }: { calculation: QuoteCalculationView }) {
  const title = calculation.status === 'insufficient_data' ? '无法可靠测算' : '测算条件未满足';
  return (
    <div className={styles.insufficient} role="status">
      <AlertCircle aria-hidden="true" size={25} />
      <h3>{title}</h3>
      <p>{calculation.message ?? '请补充合格的历史样本、成本或规格口径后重新测算。'}</p>
      <strong>系统不会使用 AI 猜测任何报价数字。</strong>
    </div>
  );
}
