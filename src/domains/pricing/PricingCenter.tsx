import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Calculator,
  Check,
  Database,
  LockKeyhole,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';

import styles from './PricingCenter.module.css';
import type { HistoryPriceSample, QuoteCalculationView } from './types';

type PricingCenterProps = {
  samples: HistoryPriceSample[];
  calculation: QuoteCalculationView;
  onApply?: (strategyId: string) => void;
};

export function PricingCenter({ samples, calculation, onApply }: PricingCenterProps) {
  const defaultStrategy = calculation.strategies.find((strategy) => strategy.recommended)?.id ?? '';
  const [selectedStrategyId, setSelectedStrategyId] = useState(defaultStrategy);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const usableCount = useMemo(() => samples.filter((sample) => sample.usable).length, [samples]);
  const selectedStrategy = calculation.strategies.find((strategy) => strategy.id === selectedStrategyId);

  const confirmApply = () => {
    if (!selectedStrategy) return;
    onApply?.(selectedStrategy.id);
    setConfirmOpen(false);
  };

  return (
    <section className={styles.page} aria-labelledby="pricing-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>HistoryPriceProvider + QuoteEngine</span>
          <h1 id="pricing-title">报价测算中心</h1>
          <p>历史价格只读查询，标准化、样本剔除和三类策略均由确定性算法完成。</p>
        </div>
        <div className={styles.readOnlyBadge}>
          <LockKeyhole aria-hidden="true" size={18} />
          <div>
            <strong>外部历史库只读</strong>
            <span>仅查询，不新增、不修改、不删除</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.samples} aria-labelledby="samples-title">
          <div className={styles.panelHeader}>
            <div>
              <span>查询快照 {calculation.querySnapshotId}</span>
              <h2 id="samples-title">历史样本</h2>
            </div>
            <div className={styles.sampleCount}>
              <strong>{usableCount}</strong>
              <span>/ {samples.length} 可用</span>
            </div>
          </div>

          <label className={styles.searchBox}>
            <Search aria-hidden="true" size={17} />
            <span className={styles.srOnly}>筛选历史样本</span>
            <input placeholder="筛选物料、规格或来源" type="search" />
          </label>

          <div className={styles.sampleList}>
            {samples.map((sample) => (
              <article className={`${styles.sample} ${!sample.usable ? styles.excluded : ''}`} key={sample.id}>
                <div className={styles.sampleMain}>
                  <span className={styles.databaseIcon}>
                    <Database aria-hidden="true" size={17} />
                  </span>
                  <div>
                    <strong>{sample.materialName}</strong>
                    <span>{sample.specification}</span>
                  </div>
                </div>
                <div className={styles.samplePrice}>
                  <strong>
                    {sample.currency} {sample.price}
                  </strong>
                  <span>{sample.taxIncluded ? '含税' : '未税'} · {sample.occurredAt}</span>
                </div>
                <div className={styles.sampleSource}>
                  {sample.usable ? (
                    <BadgeCheck aria-label="可用于测算" className={styles.usableIcon} size={17} />
                  ) : (
                    <ShieldAlert aria-label="已排除" className={styles.excludedIcon} size={17} />
                  )}
                  <span>{sample.usable ? sample.sourceLabel : sample.excludedReason}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.calculation} aria-labelledby="calculation-title">
          <div className={styles.panelHeader}>
            <div>
              <span>算法 {calculation.algorithmVersion}</span>
              <h2 id="calculation-title">确定性报价策略</h2>
            </div>
            <Calculator aria-hidden="true" className={styles.calculatorIcon} size={24} />
          </div>

          {calculation.status === 'calculated' ? (
            <>
              <div className={styles.strategyList}>
                {calculation.strategies.map((strategy) => {
                  const selected = strategy.id === selectedStrategyId;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`${styles.strategy} ${selected ? styles.strategySelected : ''}`}
                      key={strategy.id}
                      onClick={() => setSelectedStrategyId(strategy.id)}
                      type="button"
                    >
                      <span className={styles.strategyTopline}>
                        <strong>{strategy.name}</strong>
                        {strategy.recommended ? <span>推荐</span> : null}
                      </span>
                      <span className={styles.amount}>
                        <small>{strategy.currency}</small>
                        {strategy.amount}
                      </span>
                      <span className={styles.range}>
                        置信区间 {strategy.confidenceLow}–{strategy.confidenceHigh}
                      </span>
                      <span className={styles.description}>{strategy.description}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.snapshotMeta}>
                <span>样本快照</span>
                <strong>{calculation.sampleSnapshotId}</strong>
                <span>测算 ID</span>
                <strong>{calculation.id}</strong>
              </div>

              <button
                className={styles.applyButton}
                disabled={!selectedStrategy}
                onClick={() => setConfirmOpen(true)}
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
      </div>

      {confirmOpen && selectedStrategy ? (
        <div aria-labelledby="quote-confirm-title" aria-modal="true" className={styles.modalBackdrop} role="dialog">
          <div className={styles.modal}>
            <button aria-label="关闭确认" className={styles.modalClose} onClick={() => setConfirmOpen(false)} type="button">
              <X aria-hidden="true" size={18} />
            </button>
            <span className={styles.modalIcon}>
              <Calculator aria-hidden="true" size={22} />
            </span>
            <h2 id="quote-confirm-title">确认应用“{selectedStrategy.name}”</h2>
            <p>本操作会把算法结果写入报价单并生成一个新版本，不会回写外部历史报价库。</p>
            <div className={styles.modalAmount}>
              {selectedStrategy.currency} {selectedStrategy.amount}
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setConfirmOpen(false)} type="button">取消</button>
              <button className={styles.confirmButton} onClick={confirmApply} type="button">确认生成新版本</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InsufficientState({ calculation }: { calculation: QuoteCalculationView }) {
  const title = calculation.status === 'insufficient_data' ? '无法可靠测算' : '测算条件未满足';
  return (
    <div className={styles.insufficient} role="status">
      <span className={styles.insufficientIcon}>
        <AlertCircle aria-hidden="true" size={25} />
      </span>
      <h3>{title}</h3>
      <p>{calculation.message ?? '请补充合格的历史样本、成本或规格口径后重新测算。'}</p>
      <strong>系统不会使用 AI 猜测任何报价数字。</strong>
    </div>
  );
}
