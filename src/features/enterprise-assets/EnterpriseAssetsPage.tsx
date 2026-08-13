import {
  Archive,
  ChevronRight,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { EnterpriseAssetDetail } from './components/EnterpriseAssetDetail';
import { EnterpriseAssetUpload } from './components/EnterpriseAssetUpload';
import type {
  EnterpriseAsset,
  EnterpriseAssetCategory,
  EnterpriseAssetPageProps,
} from './types';
import './enterprise-assets.css';

const categoryMeta: ReadonlyArray<{
  category: EnterpriseAssetCategory;
  label: string;
}> = [
  { category: 'other', label: '企业基本信息' },
  { category: 'license', label: '企业证照' },
  { category: 'qualification', label: '体系及资质认证' },
  { category: 'personnel', label: '企业人员' },
  { category: 'performance', label: '企业业绩' },
  { category: 'product', label: '产品资料' },
  { category: 'inspection', label: '检测报告' },
  { category: 'finance', label: '财务资料' },
];

const categoryLabel = Object.fromEntries(
  categoryMeta.map(({ category, label }) => [category, label]),
) as Record<EnterpriseAssetCategory, string>;

const statusLabel = {
  processing: '处理中',
  needs_review: '待确认',
  ready: '已归档',
  failed: '处理失败',
} as const;

function getAssetFileMeta(asset: EnterpriseAsset) {
  const extension = asset.name.split('.').at(-1)?.toLocaleLowerCase();
  if (extension === 'pdf') return { label: 'PDF', tone: 'pdf', Icon: FileType2 };
  if (['doc', 'docx'].includes(extension ?? '')) {
    return { label: 'Word', tone: 'word', Icon: FileText };
  }
  if (['xls', 'xlsx', 'csv'].includes(extension ?? '')) {
    return { label: 'Excel', tone: 'excel', Icon: FileSpreadsheet };
  }
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '')) {
    return { label: '图片', tone: 'image', Icon: FileImage };
  }
  if (['zip', 'rar', '7z'].includes(extension ?? '')) {
    return { label: '压缩包', tone: 'archive', Icon: FileArchive };
  }
  return { label: '资料', tone: 'document', Icon: FileText };
}

export function EnterpriseAssetsPage({
  enterpriseName,
  assets,
  ingestionItems,
  onUpload,
  onCorrectFact,
  onRefresh,
  onSelectRevision,
}: EnterpriseAssetPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<EnterpriseAssetCategory | 'all'>(
    'all',
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  const refreshAssets = async () => {
    if (isRefreshing) return;
    setRefreshError('');
    setIsRefreshing(true);
    try {
      await onRefresh?.();
      setQuery('');
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : '资料列表刷新失败，请稍后重试。');
    } finally {
      setIsRefreshing(false);
    }
  };

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      const inFolder = selectedCategory === 'all' || asset.category === selectedCategory;
      const matchesQuery =
        !normalizedQuery ||
        `${asset.name} ${categoryLabel[asset.category]}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return inFolder && matchesQuery;
    });
  }, [assets, query, selectedCategory]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const processingCount = (ingestionItems ?? []).filter(
    (item) => !['completed', 'failed'].includes(item.status),
  ).length;

  return (
    <section className="enterprise-page">
      <header className="enterprise-page__header">
        <div>
          <h2>企业资料库</h2>
          <p>统一管理企业资料，智能识别与归类，高效支持投标全流程</p>
        </div>
        <button
          className="enterprise-primary-action"
          type="button"
          onClick={() => setUploadOpen(true)}
        >
          <Upload aria-hidden="true" size={18} />
          上传资料
          {processingCount > 0 ? <em>{processingCount}</em> : null}
        </button>
      </header>

      <div className="enterprise-toolbar">
        <label className="enterprise-search">
          <span className="enterprise-visually-hidden">搜索企业资料</span>
          <input
            type="search"
            value={query}
            placeholder="搜索文件名称/关键词"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Search aria-hidden="true" size={19} />
        </label>
        <button
          className="enterprise-refresh"
          type="button"
          aria-label="刷新资料列表"
          aria-busy={isRefreshing}
          disabled={isRefreshing}
          onClick={() => void refreshAssets()}
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </div>
      {refreshError ? <p className="enterprise-refresh-error" role="alert">{refreshError}</p> : null}

      <section className="enterprise-workspace" aria-label="企业资料工作区">
        <aside className="enterprise-library">
          <div className="enterprise-library__heading">
            <h3>
              <Archive aria-hidden="true" size={18} />
              企业资料库
            </h3>
            <span>{assets.length}</span>
          </div>
          <nav aria-label="企业资料分类">
            <button
              className={`enterprise-folder${selectedCategory === 'all' ? ' enterprise-folder--active' : ''}`}
              type="button"
              onClick={() => setSelectedCategory('all')}
            >
              <ChevronRight aria-hidden="true" size={13} />
              <Folder aria-hidden="true" size={18} />
              <span>全部资料</span>
              <em>{assets.length}</em>
            </button>
            {categoryMeta.map(({ category, label }) => {
              const count = assets.filter((asset) => asset.category === category).length;
              return (
                <button
                  className={`enterprise-folder${selectedCategory === category ? ' enterprise-folder--active' : ''}`}
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                >
                  <ChevronRight aria-hidden="true" size={13} />
                  <Folder aria-hidden="true" size={18} />
                  <span>{label}</span>
                  <em>{count}</em>
                </button>
              );
            })}
          </nav>
          <div className="enterprise-boundary" role="note">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>
              <strong>企业域专属资料</strong>
              此处上传的资料归企业所有；自动分类不会改变其数据归属，项目材料也不会进入企业库。
            </span>
          </div>
        </aside>

        <div className="enterprise-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>文件名称</th>
                <th>文件类型</th>
                <th>所属文件夹</th>
                <th>识别状态</th>
                <th>更新时间 ↓</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((asset) => {
                const fileMeta = getAssetFileMeta(asset);
                const FileIcon = fileMeta.Icon;
                return (
                  <tr key={asset.id}>
                    <td>
                      <button
                        className="enterprise-file-link"
                        type="button"
                        onClick={() => setSelectedAssetId(asset.id)}
                        aria-label={`查看${asset.name}详情`}
                      >
                        <span className={`enterprise-file-icon enterprise-file-icon--${fileMeta.tone}`}>
                          <FileIcon aria-hidden="true" size={20} />
                        </span>
                        <strong>{asset.name}</strong>
                      </button>
                    </td>
                    <td>{fileMeta.label}</td>
                    <td>{categoryLabel[asset.category]}</td>
                    <td>
                      <span className={`enterprise-status enterprise-status--${asset.status}`}>
                        {statusLabel[asset.status]}
                      </span>
                    </td>
                    <td>{asset.updatedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleAssets.length === 0 ? (
            <div className="enterprise-empty-copy">
              <Search aria-hidden="true" size={24} />
              <strong>没有匹配的企业资料</strong>
              <span>尝试更换关键词或选择其他文件夹。</span>
            </div>
          ) : null}
        </div>
      </section>

      {isUploadOpen ? createPortal(
        <div className="enterprise-modal-layer">
          <button
            className="enterprise-modal-backdrop"
            type="button"
            aria-label="点击遮罩关闭上传资料窗口"
            onClick={() => setUploadOpen(false)}
          />
          <section
            className="enterprise-modal enterprise-modal--upload"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enterprise-upload-dialog-title"
          >
            <header className="enterprise-modal__header">
              <div>
                <span>企业资料专属入口</span>
                <h2 id="enterprise-upload-dialog-title">上传并自动归档</h2>
              </div>
              <button
                className="enterprise-modal__close"
                type="button"
                aria-label="关闭上传资料窗口"
                onClick={() => setUploadOpen(false)}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <EnterpriseAssetUpload
              enterpriseName={enterpriseName}
              ingestionItems={ingestionItems}
              onUpload={onUpload}
            />
          </section>
        </div>,
        document.body,
      ) : null}

      {selectedAsset ? createPortal(
        <div className="enterprise-modal-layer">
          <button
            className="enterprise-modal-backdrop"
            type="button"
            aria-label="点击遮罩关闭资料详情"
            onClick={() => setSelectedAssetId(null)}
          />
          <section
            className="enterprise-modal enterprise-modal--detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedAsset.name}详情`}
          >
            <button
              className="enterprise-modal__close enterprise-modal__close--floating"
              type="button"
              aria-label="关闭资料详情"
              onClick={() => setSelectedAssetId(null)}
            >
              <X aria-hidden="true" size={20} />
            </button>
            <EnterpriseAssetDetail
              asset={selectedAsset}
              onCorrectFact={onCorrectFact}
              onSelectRevision={onSelectRevision}
            />
          </section>
        </div>,
        document.body,
      ) : null}
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
