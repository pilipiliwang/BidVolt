import { Archive, FileCheck2, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EnterpriseAssetDetail } from './components/EnterpriseAssetDetail';
import { EnterpriseAssetUpload } from './components/EnterpriseAssetUpload';
import type { EnterpriseAssetPageProps } from './types';
import './enterprise-assets.css';

const categoryLabel = {
  license: '证照',
  qualification: '资质',
  performance: '业绩',
  personnel: '人员',
  product: '产品',
  inspection: '检测',
  finance: '财务',
  other: '其他',
} as const;

export function EnterpriseAssetsPage({
  enterpriseName,
  assets,
  ingestionItems,
  onUpload,
  onCorrectFact,
  onSelectRevision,
}: EnterpriseAssetPageProps) {
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0]?.id ?? '');
  const [query, setQuery] = useState('');

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return assets;
    return assets.filter((asset) =>
      `${asset.name} ${categoryLabel[asset.category]}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [assets, query]);

  const selectedAsset =
    assets.find((asset) => asset.id === selectedAssetId) ?? visibleAssets[0] ?? assets[0];
  const reviewCount = assets.filter((asset) => asset.status === 'needs_review').length;
  const readyCount = assets.filter((asset) => asset.status === 'ready').length;

  return (
    <section className="enterprise-page">
      <header className="enterprise-page__hero">
        <div>
          <p className="enterprise-eyebrow">Enterprise knowledge base</p>
          <h2>企业资料库</h2>
          <p className="enterprise-page__lead">
            管理 {enterpriseName} 长期有效、跨项目复用的证照、资质、业绩与产品事实。
          </p>
        </div>
        <div className="enterprise-boundary" role="note">
          <Archive aria-hidden="true" size={19} />
          <span>
            <strong>企业域</strong>
            此处上传的资料归企业所有，自动分类不会改变其数据归属。
          </span>
        </div>
      </header>

      <section className="enterprise-summary" aria-label="企业资料概览">
        <article>
          <Archive aria-hidden="true" size={19} />
          <span>资料总数</span>
          <strong>{assets.length}</strong>
        </article>
        <article>
          <FileCheck2 aria-hidden="true" size={19} />
          <span>可跨项目复用</span>
          <strong>{readyCount}</strong>
        </article>
        <article>
          <Sparkles aria-hidden="true" size={19} />
          <span>待人工确认</span>
          <strong>{reviewCount}</strong>
        </article>
      </section>

      <EnterpriseAssetUpload
        enterpriseName={enterpriseName}
        ingestionItems={ingestionItems}
        onUpload={onUpload}
      />

      <section className="enterprise-workspace" aria-label="企业资料工作区">
        <aside className="enterprise-library">
          <div className="enterprise-library__heading">
            <div>
              <p className="enterprise-eyebrow">已归档资料</p>
              <h2>资料目录</h2>
            </div>
            <span>{visibleAssets.length}</span>
          </div>
          <label className="enterprise-search">
            <Search aria-hidden="true" size={17} />
            <span className="enterprise-visually-hidden">搜索企业资料</span>
            <input
              type="search"
              value={query}
              placeholder="搜索资料或分类"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <div className="enterprise-asset-list">
            {visibleAssets.map((asset) => (
              <button
                className={asset.id === selectedAsset?.id ? 'enterprise-asset enterprise-asset--active' : 'enterprise-asset'}
                key={asset.id}
                type="button"
                onClick={() => setSelectedAssetId(asset.id)}
              >
                <span className="enterprise-asset__type">{categoryLabel[asset.category]}</span>
                <span className="enterprise-asset__copy">
                  <strong>{asset.name}</strong>
                  <small>版本 {asset.revisions.at(0)?.revisionNo ?? 1} · {asset.updatedAt}</small>
                </span>
                {asset.status === 'needs_review' && <em>待确认</em>}
              </button>
            ))}
            {visibleAssets.length === 0 && (
              <p className="enterprise-empty-copy">没有匹配的企业资料。</p>
            )}
          </div>
        </aside>

        {selectedAsset ? (
          <EnterpriseAssetDetail
            asset={selectedAsset}
            onCorrectFact={onCorrectFact}
            onSelectRevision={onSelectRevision}
          />
        ) : (
          <section className="enterprise-detail enterprise-detail--empty">
            <Archive aria-hidden="true" size={30} />
            <h2>还没有企业资料</h2>
            <p>从上方入口上传后，Agent 会自动分类并保留原始来源。</p>
          </section>
        )}
      </section>
    </section>
  );
}

export type {
  EnterpriseAsset,
  EnterpriseAssetCategory,
  EnterpriseAssetPageProps,
  EnterpriseAssetRevision,
  EnterpriseAssetStatus,
  EnterpriseFact,
  EnterpriseIngestionItem,
} from './types';
