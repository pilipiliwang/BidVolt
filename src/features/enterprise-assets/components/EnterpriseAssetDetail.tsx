import { Check, Clock3, Eye, FileText, History, PencilLine, Save, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { ImageDescriptionSummary } from '../../../shared/ui/ImageDescriptionSummary';
import type { EnterpriseAsset, EnterpriseAssetPreview as EnterpriseAssetPreviewData, EnterpriseFact } from '../types';
import { EnterpriseAssetPreview } from './EnterpriseAssetPreview';

interface EnterpriseAssetDetailProps {
  asset: EnterpriseAsset;
  onCorrectFact?: (
    assetId: string,
    factId: string,
    value: string,
  ) => Promise<EnterpriseAsset | void> | EnterpriseAsset | void;
  onLoadPreview?: (fileId: string, fileName: string) => Promise<EnterpriseAssetPreviewData>;
  onDownloadFile?: (fileId: string, fileName: string) => Promise<void> | void;
  onSelectRevision?: (assetId: string, revisionId: string) => void;
}

interface FactRowProps {
  assetId: string;
  fact: EnterpriseFact;
  onCorrectFact?: (
    assetId: string,
    factId: string,
    value: string,
  ) => Promise<EnterpriseAsset | void> | EnterpriseAsset | void;
}

function confidencePercent(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

function EnterpriseFactRow({ assetId, fact, onCorrectFact }: FactRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(fact.value);
  const [displayValue, setDisplayValue] = useState(fact.value);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayValue(fact.value);
    setDraftValue(fact.value);
  }, [fact.value]);

  const submitCorrection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = draftValue.trim();
    if (!nextValue || isSaving) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await onCorrectFact?.(assetId, fact.id ?? fact.key, nextValue);
      setDisplayValue(nextValue);
      setDraftValue(nextValue);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error && error.message
        ? error.message
        : '字段纠正保存失败，请重试。');
    } finally {
      setIsSaving(false);
    }
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
              disabled={isSaving}
              value={draftValue}
              onChange={(event) => setDraftValue(event.currentTarget.value)}
            />
          </label>
          <button
            className="enterprise-icon-button enterprise-icon-button--primary"
            disabled={isSaving}
            type="submit"
          >
            <Save aria-hidden="true" size={16} />
            {isSaving ? '保存中…' : '保存'}
          </button>
          <button
            className="enterprise-icon-button"
            disabled={isSaving}
            type="button"
            onClick={() => {
                setDraftValue(displayValue);
              setSaveError('');
              setIsEditing(false);
            }}
          >
            <X aria-hidden="true" size={16} />
            取消
          </button>
          {saveError ? <p className="enterprise-fact__error" role="alert">{saveError}</p> : null}
        </form>
      ) : (
        <div className="enterprise-fact__value-row">
          <strong>{displayValue || '—'}</strong>
          {onCorrectFact ? (
            <button
              className="enterprise-text-button"
              type="button"
              onClick={() => {
                setSaveError('');
                setIsEditing(true);
              }}
            >
              <PencilLine aria-hidden="true" size={15} />
              纠正字段
            </button>
          ) : null}
        </div>
      )}
      <div className="enterprise-fact__source">
        <span>{fact.confidence === undefined ? '置信度未提供' : `置信度 ${confidencePercent(fact.confidence)}%`}</span>
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
  onLoadPreview,
  onDownloadFile,
  onSelectRevision,
}: EnterpriseAssetDetailProps) {
  const defaultFileId = asset.sourceFileId
    ?? asset.revisions.find((revision) => revision.isCurrent)?.fileId
    ?? asset.revisions.find((revision) => revision.fileId)?.fileId;
  const [activeTab, setActiveTab] = useState<'preview' | 'recognition' | 'revisions'>(
    defaultFileId ? 'preview' : 'recognition',
  );
  const [previewFileId, setPreviewFileId] = useState(defaultFileId);

  useEffect(() => {
    setPreviewFileId(defaultFileId);
    setActiveTab(defaultFileId ? 'preview' : 'recognition');
  }, [asset.id, defaultFileId]);

  return (
    <section className="enterprise-detail" aria-labelledby="enterprise-detail-title">
      <header className="enterprise-detail__header">
        <div>
          <h2 id="enterprise-detail-title">{asset.name}</h2>
          <p>最近更新 {asset.updatedAt}</p>
        </div>
      </header>

      {asset.expiresAt && (
        <div className="enterprise-expiry">
          <Clock3 aria-hidden="true" size={17} />
          有效期至 {asset.expiresAt}，生成标书时会同步校验证照有效性
        </div>
      )}

      <nav className="enterprise-detail__tabs" aria-label="资料详情内容">
        <button
          className={activeTab === 'preview' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('preview')}
        >
          <Eye aria-hidden="true" size={16} />
          原件预览
        </button>
        <button
          className={activeTab === 'recognition' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('recognition')}
        >
          <FileText aria-hidden="true" size={16} />
          识别结果
        </button>
        <button
          className={activeTab === 'revisions' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('revisions')}
        >
          <History aria-hidden="true" size={16} />
          版本记录
        </button>
      </nav>

      <div className={`enterprise-detail__content${activeTab === 'preview' ? ' enterprise-detail__content--preview' : ''}`}>
        {activeTab === 'preview' ? (
          <EnterpriseAssetPreview
            fileId={previewFileId}
            fileName={asset.name}
            onLoadPreview={onLoadPreview}
            onDownloadFile={onDownloadFile}
          />
        ) : null}

        {activeTab === 'recognition' ? (
          <div className="enterprise-detail__recognition">
            {asset.imageDescription ? (
              <section className="enterprise-panel enterprise-panel--image-description" aria-labelledby="enterprise-image-description-title">
                <div className="enterprise-panel__heading">
                  <FileText aria-hidden="true" size={18} />
                  <div>
                    <h3 id="enterprise-image-description-title">图片识别与编号复核</h3>
                    <p>若编号读数不一致，请对照原件核对。</p>
                  </div>
                </div>
                <ImageDescriptionSummary description={asset.imageDescription} />
              </section>
            ) : null}
            <section className="enterprise-panel" aria-labelledby="enterprise-facts-title">
              <div className="enterprise-panel__heading">
                <FileText aria-hidden="true" size={18} />
                <div>
                  <h3 id="enterprise-facts-title">资料关键信息</h3>
                  <p>如有误差，可对照原件人工纠正。</p>
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
                  <p className="enterprise-empty-copy">暂无资料关键信息。</p>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'revisions' ? (
          <section className="enterprise-panel enterprise-panel--revisions" aria-labelledby="enterprise-revisions-title">
            <div className="enterprise-panel__heading">
              <History aria-hidden="true" size={18} />
              <div>
                <h3 id="enterprise-revisions-title">版本记录</h3>
                <p>用于查看和追溯已上传的原文件版本。</p>
              </div>
            </div>
            <ol className="enterprise-revisions">
              {asset.revisions.length ? asset.revisions.map((revision) => {
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
                    {revision.fileId ? (
                      <button
                        type="button"
                        className={revision.isCurrent ? 'enterprise-revision enterprise-revision--current' : 'enterprise-revision'}
                        onClick={() => {
                          setPreviewFileId(revision.fileId);
                          setActiveTab('preview');
                          onSelectRevision?.(asset.id, revision.id);
                        }}
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
              }) : (
                <li className="enterprise-revisions__empty">
                  <History aria-hidden="true" size={24} />
                  <strong>暂无历史文件版本</strong>
                  <span>暂无其他可追溯的原文件版本。</span>
                </li>
              )}
            </ol>
          </section>
        ) : null}
      </div>
    </section>
  );
}
