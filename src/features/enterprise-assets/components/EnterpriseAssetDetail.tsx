import { Check, Clock3, FileText, History, PencilLine, Save, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { EnterpriseAsset, EnterpriseFact } from '../types';

const categoryLabel = {
  license: '企业证照',
  qualification: '企业资质',
  performance: '项目业绩',
  personnel: '人员资料',
  product: '产品参数',
  inspection: '检测报告',
  finance: '财务资料',
  other: '其他资料',
} as const;

const statusLabel = {
  processing: '处理中',
  needs_review: '需要确认',
  ready: '可复用',
  failed: '处理失败',
} as const;

interface EnterpriseAssetDetailProps {
  asset: EnterpriseAsset;
  onCorrectFact?: (assetId: string, factKey: string, value: string) => void;
  onSelectRevision?: (assetId: string, revisionId: string) => void;
}

interface FactRowProps {
  assetId: string;
  fact: EnterpriseFact;
  onCorrectFact?: (assetId: string, factKey: string, value: string) => void;
}

function confidencePercent(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

function EnterpriseFactRow({ assetId, fact, onCorrectFact }: FactRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(fact.value);

  const submitCorrection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = draftValue.trim();
    if (!nextValue) return;
    onCorrectFact?.(assetId, fact.key, nextValue);
    setIsEditing(false);
  };

  return (
    <article className={`enterprise-fact${fact.needsReview ? ' enterprise-fact--review' : ''}`}>
      <div className="enterprise-fact__label">
        <span>{fact.label}</span>
        {fact.needsReview && <em>待确认</em>}
      </div>
      {isEditing ? (
        <form className="enterprise-fact__form" onSubmit={submitCorrection}>
          <label>
            <span className="enterprise-visually-hidden">修正{fact.label}</span>
            <input
              autoFocus
              value={draftValue}
              onChange={(event) => setDraftValue(event.currentTarget.value)}
            />
          </label>
          <button className="enterprise-icon-button enterprise-icon-button--primary" type="submit">
            <Save aria-hidden="true" size={16} />
            保存
          </button>
          <button
            className="enterprise-icon-button"
            type="button"
            onClick={() => {
              setDraftValue(fact.value);
              setIsEditing(false);
            }}
          >
            <X aria-hidden="true" size={16} />
            取消
          </button>
        </form>
      ) : (
        <div className="enterprise-fact__value-row">
          <strong>{fact.value || '—'}</strong>
          <button
            className="enterprise-text-button"
            type="button"
            onClick={() => setIsEditing(true)}
          >
            <PencilLine aria-hidden="true" size={15} />
            纠正字段
          </button>
        </div>
      )}
      <div className="enterprise-fact__source">
        <span>置信度 {confidencePercent(fact.confidence)}%</span>
        <span>
          来源：{fact.sourceLabel}
          {fact.sourcePage ? ` · 第 ${fact.sourcePage} 页` : ''}
        </span>
      </div>
    </article>
  );
}

export function EnterpriseAssetDetail({
  asset,
  onCorrectFact,
  onSelectRevision,
}: EnterpriseAssetDetailProps) {
  const classificationPercent = confidencePercent(asset.classificationConfidence);

  return (
    <section className="enterprise-detail" aria-labelledby="enterprise-detail-title">
      <header className="enterprise-detail__header">
        <div>
          <div className="enterprise-detail__tags">
            <span className="enterprise-chip">{categoryLabel[asset.category]}</span>
            <span className={`enterprise-status enterprise-status--${asset.status}`}>
              {statusLabel[asset.status]}
            </span>
          </div>
          <h2 id="enterprise-detail-title">{asset.name}</h2>
          <p>最近更新 {asset.updatedAt}</p>
        </div>
        <div className="enterprise-classification" aria-label="自动分类置信度">
          <span>自动分类置信度</span>
          <strong>{classificationPercent}%</strong>
          <div className="enterprise-classification__bar" aria-hidden="true">
            <span style={{ width: `${classificationPercent}%` }} />
          </div>
        </div>
      </header>

      {asset.expiresAt && (
        <div className="enterprise-expiry">
          <Clock3 aria-hidden="true" size={17} />
          有效期至 {asset.expiresAt}，生成标书时会同步校验证照有效性
        </div>
      )}

      <div className="enterprise-detail__grid">
        <section className="enterprise-panel" aria-labelledby="enterprise-facts-title">
          <div className="enterprise-panel__heading">
            <FileText aria-hidden="true" size={18} />
            <div>
              <h3 id="enterprise-facts-title">结构化字段</h3>
              <p>人工纠正会创建新版本，原值和来源始终保留</p>
            </div>
          </div>
          <div className="enterprise-facts">
            {asset.facts.length ? (
              asset.facts.map((fact) => (
                <EnterpriseFactRow
                  assetId={asset.id}
                  fact={fact}
                  key={fact.key}
                  onCorrectFact={onCorrectFact}
                />
              ))
            ) : (
              <p className="enterprise-empty-copy">尚未抽取到结构化字段。</p>
            )}
          </div>
        </section>

        <section className="enterprise-panel" aria-labelledby="enterprise-revisions-title">
          <div className="enterprise-panel__heading">
            <History aria-hidden="true" size={18} />
            <div>
              <h3 id="enterprise-revisions-title">版本记录</h3>
              <p>原文件、字段纠正与自动分类均可追溯</p>
            </div>
          </div>
          <ol className="enterprise-revisions">
            {asset.revisions.map((revision) => {
              const revisionContent = (
                <>
                  <span className="enterprise-revision__marker" aria-hidden="true">
                    {revision.isCurrent ? <Check size={14} /> : revision.revisionNo}
                  </span>
                  <span>
                    <strong>版本 {revision.revisionNo}</strong>
                    <small>{revision.changeNote}</small>
                    <small>{revision.createdAt} · {revision.createdBy}</small>
                  </span>
                  {revision.isCurrent && <em>当前版本</em>}
                </>
              );

              return (
                <li key={revision.id}>
                  {onSelectRevision ? (
                    <button
                      type="button"
                      className={revision.isCurrent ? 'enterprise-revision enterprise-revision--current' : 'enterprise-revision'}
                      onClick={() => onSelectRevision(asset.id, revision.id)}
                    >
                      {revisionContent}
                    </button>
                  ) : (
                    <div
                      className={revision.isCurrent ? 'enterprise-revision enterprise-revision--current enterprise-revision--static' : 'enterprise-revision enterprise-revision--static'}
                    >
                      {revisionContent}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </section>
  );
}
