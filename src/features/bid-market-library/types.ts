export type BidMarketContentKind = 'article' | 'video' | 'document' | 'other';

export type BidMarketCategoryId =
  | 'wechat-article'
  | 'wechat-video'
  | 'document'
  | 'other';

export type BidMarketDataSource = 'api' | 'mock';

export type BidMarketLoadState = 'loading' | 'ready' | 'error' | 'unavailable';

export interface BidMarketCategory {
  id: BidMarketCategoryId;
  label: string;
  count?: number;
}

export interface BidMarketContent {
  id: string;
  title: string;
  kind: BidMarketContentKind;
  categoryId: BidMarketCategoryId;
  categoryLabel: string;
  summary?: string;
  source?: string;
  typeLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  duration?: string;
  fileType?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  body?: string;
}

export interface BidMarketUploadResult {
  message?: string;
}

export interface BidMarketUrlImportPayload {
  categoryId: BidMarketCategoryId;
  url: string;
}

export interface BidMarketLibraryProps {
  canManage?: boolean;
  state: BidMarketLoadState;
  items: BidMarketContent[];
  dataSource?: BidMarketDataSource;
  errorMessage?: string;
  unavailableMessage?: string;
  pageSize?: number;
  onRefresh?: () => Promise<void> | void;
  onDeleteContent?: (contentId: string) => Promise<void> | void;
  onImportUrl?: (
    payload: BidMarketUrlImportPayload,
  ) => Promise<BidMarketUploadResult | void> | BidMarketUploadResult | void;
  onUploadFiles?: (
    files: File[],
    categoryId: BidMarketCategoryId,
  ) => Promise<BidMarketUploadResult | void> | BidMarketUploadResult | void;
}
