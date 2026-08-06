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
  onApply?: (strategyId: string) => void;
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
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
}: PricingCenterProps) {
  const recommendedStrategy = calculation.strategies.find((strategy) => strategy.recommended);
  const hasCalculatedResult = calculation.status === 'calculated' && Boolean(recommendedStrategy);
  const defaultStrategy = recommendedStrategy?.id ?? '';
  const [selectedStrategyId, setSelectedStrategyId] = useState(defaultStrategy);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sampleQuery, setSampleQuery] = useState('');
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const modalCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const usableSamples = useMemo(() => samples.filter((sample) => sample.usable), [samples]);
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
    if (!confirmOpen) return undefined;
    modalCloseButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmOpen(false);
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
    setConfirmOpen(true);
  };

  const confirmApply = () => {
    if (!selectedStrategy) return;
    onApply?.(selectedStrategy.id);
    setConfirmOpen(false);
  };

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      footerHint="请输入您的问题，如“解释当前单价的时间与地区调整”"
      materials={materials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onAddFiles}
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
            <div><span>当前材料（已选中）</span><strong>高压开关柜（KYN28A-12）</strong></div>
            <div><span>编码</span><strong>10GY-DZ-006</strong></div>
            <div><span>型号规格</span><strong>KYN28A-12/1250A 31.5kA</strong></div>
            <div><span>当前报价（元）</span><strong>30,000.00</strong></div>
            <div className={styles.suggested}><span>算法建议报价（元）</span><strong>{formatCurrencyAmount(recommendedStrategy.amount)}</strong></div>
            <div><span>建议范围（元）</span><strong>{formatCurrencyAmount(recommendedStrategy.confidenceLow)} ~ {formatCurrencyAmount(recommendedStrategy.confidenceHigh)}</strong></div>
          </div>
        ) : null}

        {hasCalculatedResult ? (
          <>
            <div className={styles.detailTitle}>测算依据明细</div>
            <div className={styles.metrics}>
              <Metric label="历史中标价中位数（元）" value="29,600.00" source="来源：历史中标库" />
              <Metric label="近半年中标价均价" value="30,050.00" source="来源：历史中标库" />
              <Metric label="同地区均价（元）" value="29,850.00" source="来源：华东地区样本" />
              <Metric label="同规格均价（元）" value="29,900.00" source="来源：同规格样本" />
              <Metric label="时间趋势调整" value="+1.20%" source="依据：原材料指数上涨" />
              <Metric label="地区调整" value="+0.80%" source="依据：华东地区溢价系数" />
              <Metric label="规格调整" value="+0.50%" source="额定电流/开断能力" />
              <Metric label="内部成本（元）" value="26,800.00" source="来源：成本测算模型" />
              <Metric label="最低毛利要求" value="8.00%" source="公司策略设置" />
              <Metric label="投标上限（元）" value="31,600.00" source="依据：成本+毛利上限" />
              <div className={styles.formula}><span>报价评分公式</span><strong>价格得分 = 100 ×（1 −（报价 − 最低价）/（最高可接受价 − 最低价））</strong></div>
            </div>

            <div className={styles.analysisGrid}>
              <section aria-label="价格趋势">
                <header><span>价格趋势（近12个月 同规格中标价）</span><small><i /> 中标价均值 <b /> 中位数</small></header>
                <svg className={styles.chart} viewBox="0 0 450 185" role="img" aria-label="近十二个月价格趋势折线图">
                  <g className={styles.gridLines}><path d="M44 28H435M44 65H435M44 102H435M44 139H435" /></g>
                  <polyline className={styles.meanLine} points="44,118 80,113 116,111 152,104 188,105 224,92 260,96 296,94 332,96 368,76 404,62 435,51" />
                  <polyline className={styles.medianLine} points="44,137 80,133 116,129 152,127 188,126 224,121 260,119 296,117 332,118 368,107 404,102 435,94" />
                  <g className={styles.axisLabels}><text x="2" y="31">34,000</text><text x="2" y="68">32,000</text><text x="2" y="105">30,000</text><text x="2" y="142">28,000</text><text x="44" y="170">2025-07</text><text x="185" y="170">2025-11</text><text x="360" y="170">2026-05</text></g>
                </svg>
              </section>

              <section className={styles.samplePanel} aria-labelledby="samples-title">
                <header>
                  <span id="samples-title">可比历史中标样本（同规格 KYN28A-12）</span>
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
            <button ref={modalCloseButtonRef} aria-label="关闭确认" className={styles.modalClose} onClick={() => setConfirmOpen(false)} type="button"><X aria-hidden="true" size={18} /></button>
            <span className={styles.modalIcon}><Calculator aria-hidden="true" size={22} /></span>
            <h2 id="quote-confirm-title">确认应用“{selectedStrategy.name}”</h2>
            <p>本操作会把算法结果写入报价单并生成一个新版本，不会回写外部历史报价库。</p>
            <div className={styles.modalAmount}>{selectedStrategy.currency} {formatCurrencyAmount(selectedStrategy.amount)}</div>
            <div className={styles.modalActions}>
              <button onClick={() => setConfirmOpen(false)} type="button">取消</button>
              <button className={styles.confirmButton} onClick={confirmApply} type="button">确认生成新版本</button>
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
