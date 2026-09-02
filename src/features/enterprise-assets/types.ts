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
  createdAt: string;
  createdBy: string;
  changeNote: string;
  isCurrent: boolean;
}

export interface EnterpriseAsset {
  id: string;
  name: string;
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

export interface EnterpriseAssetUploadProps {
  enterpriseName: string;
  ingestionItems?: EnterpriseIngestionItem[];
  onUpload?: (files: File[]) => Promise<{ message?: string } | void> | void;
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
  onRefresh?: () => Promise<void> | void;
  onSelectRevision?: (assetId: string, revisionId: string) => void;
}
