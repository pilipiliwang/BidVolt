export type BidMarketContentKind = 'article' | 'video' | 'document';

export type BidMarketLoadState = 'loading' | 'ready' | 'error' | 'unavailable';

export interface BidMarketCategory {
  id: string;
  label: string;
  count?: number;
}

export interface BidMarketContent {
  id: string;
  title: string;
  kind: BidMarketContentKind;
  categoryId: string;
  categoryLabel: string;
  summary?: string;
  source?: string;
  typeLabel?: string;
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

export interface BidMarketLibraryProps {
  state: BidMarketLoadState;
  categories: BidMarketCategory[];
  items: BidMarketContent[];
  errorMessage?: string;
  unavailableMessage?: string;
  pageSize?: number;
  onRefresh?: () => Promise<void> | void;
  onUpload?: (files: File[], categoryId: string) => Promise<BidMarketUploadResult | void> | BidMarketUploadResult | void;
}
