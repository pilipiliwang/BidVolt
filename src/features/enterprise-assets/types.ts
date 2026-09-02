import type { ImageDescriptionPayload } from '../../shared/backend-api/types';

export type EnterpriseAssetCategory =
  | 'license'
  | 'qualification'
  | 'performance'
  | 'personnel'
  | 'product'
  | 'inspection'
  | 'finance'
  | 'other';

export type EnterpriseAssetStatus = 'processing' | 'needs_review' | 'ready' | 'failed';

export interface EnterpriseAssetCategoryFolder {
  id: string;
  label: string;
  parentId: string | null;
}

export interface EnterpriseFact {
  id?: string;
  key: string;
  label: string;
  value: string;
  confidence?: number;
  sourceLabel: string;
  sourcePage?: number;
  needsReview?: boolean;
}

export interface EnterpriseAssetRevision {
  id: string;
  revisionNo: number;
  fileId?: string;
  createdAt: string;
  createdBy: string;
  changeNote: string;
  isCurrent: boolean;
}

export interface EnterpriseAsset {
  id: string;
  name: string;
  sourceFileId?: string;
  category: EnterpriseAssetCategory;
  categoryId: string | null;
  categoryLabel: string;
  classificationConfidence?: number;
  status: EnterpriseAssetStatus;
  updatedAt: string;
  expiresAt?: string;
  imageDescription?: ImageDescriptionPayload | null;
  facts: EnterpriseFact[];
  revisions: EnterpriseAssetRevision[];
}

export interface EnterpriseIngestionItem {
  id: string;
  name: string;
  status: 'queued' | 'classifying' | 'extracting' | 'pending_confirmation' | 'completed' | 'failed';
  progress?: number;
}

export interface EnterpriseUploadState {
  message: string;
  type: 'error' | 'idle' | 'loading' | 'success';
}

export interface EnterpriseUploadRecord {
  id: string;
  fileName: string;
  status: 'accepted' | 'failed';
  createdAt: string;
  fileId?: string;
  assetId?: string;
  duplicate?: boolean;
  message?: string;
  expanded?: {
    imported: number;
    duplicates: number;
    failed: number;
    error?: string;
  };
}

export type EnterpriseAssetPreview =
  | { kind: 'image' | 'pdf'; blob: Blob; mimeType: string }
  | { kind: 'text'; blocks: Array<{ id: string; pageNo?: number; text: string }> }
  | { kind: 'unsupported'; message: string };

export interface EnterpriseAssetUploadProps {
  enterpriseName: string;
  onUpload?: (files: File[]) => Promise<{
    message?: string;
    records?: EnterpriseUploadRecord[];
    type?: 'error' | 'success';
  } | void> | void;
  uploadState?: EnterpriseUploadState;
  onUploadStateChange?: (state: EnterpriseUploadState) => void;
}

export interface EnterpriseAssetPageProps extends EnterpriseAssetUploadProps {
  assets: EnterpriseAsset[];
  categories: EnterpriseAssetCategoryFolder[];
  onCorrectFact?: (
    assetId: string,
    factId: string,
    value: string,
  ) => Promise<EnterpriseAsset | void> | EnterpriseAsset | void;
  onLoadAssetDetail?: (assetId: string) => Promise<EnterpriseAsset | void>;
  onLoadAssetPreview?: (fileId: string, fileName: string) => Promise<EnterpriseAssetPreview>;
  onDownloadAssetFile?: (fileId: string, fileName: string) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  onSelectRevision?: (assetId: string, revisionId: string) => void;
}
