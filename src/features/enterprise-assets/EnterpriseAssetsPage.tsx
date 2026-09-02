import {
  Archive,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { EnterpriseAssetDetail } from './components/EnterpriseAssetDetail';
import { EnterpriseAssetUpload } from './components/EnterpriseAssetUpload';
import { EnterpriseUploadHistory } from './components/EnterpriseUploadHistory';
import {
  ALL_ENTERPRISE_ASSETS_FOLDER_ID,
  buildEnterpriseAssetFolders,
} from './category-folders';
import type {
  EnterpriseAsset,
  EnterpriseAssetPageProps,
  EnterpriseUploadRecord,
  EnterpriseUploadState,
} from './types';
import './enterprise-assets.css';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50] as const;

type PaginationItem = number | 'end-ellipsis' | 'start-ellipsis';

function buildPaginationItems(currentPage: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 4) [2, 3, 4, 5].forEach((page) => pages.add(page));
  if (currentPage >= pageCount - 3) {
    [pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1]
      .forEach((page) => pages.add(page));
  }

  const orderedPages = [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((first, second) => first - second);
  const items: PaginationItem[] = [];
  orderedPages.forEach((page, index) => {
    const previousPage = orderedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push(previousPage === 1 ? 'start-ellipsis' : 'end-ellipsis');
    }
    items.push(page);
  });
  return items;
}

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
  categories,
  onUpload,
  onCorrectFact,
  onLoadAssetDetail,
  onLoadAssetPreview,
  onDownloadAssetFile,
  onRefresh,
  onSelectRevision,
}: EnterpriseAssetPageProps) {
  const [selectedFolderId, setSelectedFolderId] = useState(ALL_ENTERPRISE_ASSETS_FOLDER_ID);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [isUploadHistoryOpen, setUploadHistoryOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [uploadState, setUploadState] = useState<EnterpriseUploadState>({
    message: '',
    type: 'idle',
  });
  const [uploadRecords, setUploadRecords] = useState<EnterpriseUploadRecord[]>([]);
  const [loadedAsset, setLoadedAsset] = useState<EnterpriseAsset | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState('');
  const detailRequestRef = useRef(0);

  const refreshAssets = async () => {
    if (isRefreshing) return;
    setRefreshError('');
    setIsRefreshing(true);
    try {
      await onRefresh?.();
      setQuery('');
      setCurrentPage(1);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : '资料列表刷新失败，请稍后重试。');
    } finally {
      setIsRefreshing(false);
    }
  };

  const folders = useMemo(
    () => buildEnterpriseAssetFolders(categories, assets, {
      allLabel: '业务资料',
      separateSourceArchives: true,
    }),
    [assets, categories],
  );
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return selectedFolder.items.filter((asset) => {
      const matchesQuery =
        !normalizedQuery ||
        `${asset.name} ${asset.categoryLabel}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesQuery;
    });
  }, [query, selectedFolder.items]);
  const pageCount = Math.max(1, Math.ceil(visibleAssets.length / pageSize));
  const activePage = Math.min(currentPage, pageCount);
  const pageOffset = (activePage - 1) * pageSize;
  const paginatedAssets = visibleAssets.slice(pageOffset, pageOffset + pageSize);
  const pageRangeStart = visibleAssets.length === 0 ? 0 : pageOffset + 1;
  const pageRangeEnd = Math.min(pageOffset + pageSize, visibleAssets.length);
  const paginationItems = useMemo(
    () => buildPaginationItems(activePage, pageCount),
    [activePage, pageCount],
  );

  useEffect(() => {
    if (currentPage !== activePage) setCurrentPage(activePage);
  }, [activePage, currentPage]);

  const selectedAsset = loadedAsset?.id === selectedAssetId
    ? loadedAsset
    : assets.find((asset) => asset.id === selectedAssetId);
  const showActivity = uploadState.type !== 'idle' || uploadRecords.length > 0;

  const uploadFiles = async (files: File[]) => {
    const result = await onUpload?.(files);
    const records = result?.records;
    if (records?.length) {
      setUploadRecords((current) => [...records, ...current]);
    }
    return result;
  };

  const openAssetDetail = async (assetId: string) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedAssetId(assetId);
    setLoadedAsset(null);
    setDetailLoadError('');
    if (!onLoadAssetDetail) return;
    setIsDetailLoading(true);
    try {
      const detail = await onLoadAssetDetail(assetId);
      if (detailRequestRef.current === requestId && detail) setLoadedAsset(detail);
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetailLoadError(
          error instanceof Error && error.message
            ? error.message
            : '资料详情加载失败，请稍后重试。',
        );
      }
    } finally {
      if (detailRequestRef.current === requestId) setIsDetailLoading(false);
    }
  };

  const closeAssetDetail = () => {
    detailRequestRef.current += 1;
    setSelectedAssetId(null);
    setLoadedAsset(null);
    setDetailLoadError('');
    setIsDetailLoading(false);
  };

  const correctAssetFact = async (assetId: string, factId: string, value: string) => {
    const detailRequestId = detailRequestRef.current;
    const refreshedAsset = await onCorrectFact?.(assetId, factId, value);
    if (
      refreshedAsset
      && refreshedAsset.id === assetId
      && detailRequestRef.current === detailRequestId
    ) {
      setLoadedAsset(refreshedAsset);
    }
    return refreshedAsset;
  };

  return (
    <section className="enterprise-page">
      <header className="enterprise-page__header">
        <p>此处资料仅归属当前企业；上传后由系统自动归类，项目材料不会进入企业资料库。</p>
        <button
          className="enterprise-primary-action"
          type="button"
          onClick={() => setUploadOpen(true)}
        >
          <Upload aria-hidden="true" size={18} />
          上传资料
          {uploadState.type === 'loading' ? <em>1</em> : null}
        </button>
      </header>

      {showActivity ? (
        <section className="enterprise-activity" aria-label="企业资料上传与处理状态">
          {uploadState.type !== 'idle' ? (
            <div
              className={`enterprise-activity__upload enterprise-activity__upload--${uploadState.type}`}
              role={uploadState.type === 'error' ? 'alert' : 'status'}
            >
              <span className="enterprise-activity__icon" aria-hidden="true">
                {uploadState.type === 'loading'
                  ? <LoaderCircle size={19} />
                  : uploadState.type === 'error'
                    ? <AlertCircle size={19} />
                    : <CheckCircle2 size={19} />}
              </span>
              <span>
                <strong>
                  {uploadState.type === 'loading'
                    ? '上传中'
                    : uploadState.type === 'error'
                      ? '上传失败'
                      : '上传已受理'}
                </strong>
                <small>{uploadState.message}</small>
              </span>
            </div>
          ) : null}
          {uploadRecords.length > 0 ? (
            <button type="button" onClick={() => setUploadHistoryOpen(true)}>
              查看上传记录（{uploadRecords.length}）
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="enterprise-toolbar">
        <label className="enterprise-search">
          <span className="enterprise-visually-hidden">搜索企业资料</span>
          <input
            type="search"
            value={query}
            placeholder="搜索文件名称/关键词"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setCurrentPage(1);
            }}
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
              资料分类
            </h3>
            <span>{assets.length}</span>
          </div>
          <nav aria-label="企业资料分类">
            {folders.map((folder) => (
              <button
                className={`enterprise-folder${selectedFolder.id === folder.id ? ' enterprise-folder--active' : ''}`}
                key={folder.id}
                type="button"
                onClick={() => {
                  setSelectedFolderId(folder.id);
                  setCurrentPage(1);
                }}
              >
                <ChevronRight aria-hidden="true" size={13} />
                <Folder aria-hidden="true" size={18} />
                <span>{folder.label}</span>
                <em>{folder.items.length}</em>
              </button>
            ))}
          </nav>
        </aside>

        <div className="enterprise-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>文件名称</th>
                <th>文件类型</th>
                <th>所属文件夹</th>
                <th>更新时间 ↓</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAssets.map((asset) => {
                const fileMeta = getAssetFileMeta(asset);
                const FileIcon = fileMeta.Icon;
                return (
                  <tr key={asset.id}>
                    <td>
                      <button
                        className="enterprise-file-link"
                        type="button"
                        onClick={() => void openAssetDetail(asset.id)}
                        aria-label={`查看${asset.name}详情`}
                      >
                        <span className={`enterprise-file-icon enterprise-file-icon--${fileMeta.tone}`}>
                          <FileIcon aria-hidden="true" size={20} />
                        </span>
                        <strong>{asset.name}</strong>
                      </button>
                    </td>
                    <td>{fileMeta.label}</td>
                    <td>{selectedFolder.kind === 'source' ? '源文件' : asset.categoryLabel}</td>
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
          <nav className="enterprise-pagination" aria-label="企业资料分页">
            <p role="status" aria-live="polite">
              显示 {pageRangeStart}–{pageRangeEnd} 条，共 {visibleAssets.length} 条
            </p>
            <div className="enterprise-pagination__pages">
              <button
                type="button"
                disabled={activePage === 1}
                aria-label="上一页"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                上一页
              </button>
              {paginationItems.map((item) => item === 'start-ellipsis' || item === 'end-ellipsis' ? (
                <span aria-hidden="true" key={item}>…</span>
              ) : (
                <button
                  type="button"
                  aria-current={item === activePage ? 'page' : undefined}
                  aria-label={`第 ${item} 页`}
                  key={item}
                  onClick={() => setCurrentPage(item)}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                disabled={activePage === pageCount}
                aria-label="下一页"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              >
                下一页
              </button>
            </div>
            <label>
              <span>每页</span>
              <select
                aria-label="每页显示数量"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.currentTarget.value));
                  setCurrentPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} 条</option>
                ))}
              </select>
            </label>
          </nav>
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
              onUpload={onUpload ? uploadFiles : undefined}
              uploadState={uploadState}
              onUploadStateChange={setUploadState}
            />
          </section>
        </div>,
        document.body,
      ) : null}

      {isUploadHistoryOpen ? createPortal(
        <div className="enterprise-modal-layer">
          <button
            className="enterprise-modal-backdrop"
            type="button"
            aria-label="点击遮罩关闭上传记录"
            onClick={() => setUploadHistoryOpen(false)}
          />
          <section
            className="enterprise-modal enterprise-modal--upload-history"
            role="dialog"
            aria-modal="true"
            aria-label="企业资料上传记录"
          >
            <button
              className="enterprise-modal__close enterprise-modal__close--floating"
              type="button"
              aria-label="关闭上传记录"
              onClick={() => setUploadHistoryOpen(false)}
            >
              <X aria-hidden="true" size={20} />
            </button>
            <EnterpriseUploadHistory
              records={uploadRecords}
              onOpenAsset={(assetId) => {
                setUploadHistoryOpen(false);
                void openAssetDetail(assetId);
              }}
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
            onClick={closeAssetDetail}
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
              onClick={closeAssetDetail}
            >
              <X aria-hidden="true" size={20} />
            </button>
            {isDetailLoading ? (
              <p className="enterprise-detail-load-state" role="status">
                <LoaderCircle aria-hidden="true" size={18} />
                正在加载资料详情…
              </p>
            ) : null}
            {detailLoadError ? (
              <p className="enterprise-detail-load-state enterprise-detail-load-state--error" role="alert">
                <AlertCircle aria-hidden="true" size={18} />
                {detailLoadError}
              </p>
            ) : null}
            <EnterpriseAssetDetail
              asset={selectedAsset}
              onLoadPreview={onLoadAssetPreview}
              onDownloadFile={onDownloadAssetFile}
              onCorrectFact={onCorrectFact ? correctAssetFact : undefined}
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
  EnterpriseAssetCategoryFolder,
  EnterpriseAssetPageProps,
  EnterpriseAssetRevision,
  EnterpriseAssetPreview,
  EnterpriseAssetStatus,
  EnterpriseFact,
  EnterpriseUploadRecord,
  EnterpriseIngestionItem,
} from './types';
