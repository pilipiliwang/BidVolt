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

export interface EnterpriseFact {
  id?: string;
  key: string;
  label: string;
  value: string;
  confidence: number;
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
  classificationConfidence: number;
  status: EnterpriseAssetStatus;
  updatedAt: string;
  expiresAt?: string;
  facts: EnterpriseFact[];
  revisions: EnterpriseAssetRevision[];
}

export interface EnterpriseIngestionItem {
  id: string;
  name: string;
  status: 'queued' | 'classifying' | 'extracting' | 'completed' | 'failed';
  progress: number;
}

export interface EnterpriseAssetUploadProps {
  enterpriseName: string;
  ingestionItems?: EnterpriseIngestionItem[];
  onUpload?: (files: File[]) => Promise<void> | void;
}

export interface EnterpriseAssetPageProps extends EnterpriseAssetUploadProps {
  assets: EnterpriseAsset[];
  onCorrectFact?: (assetId: string, factId: string, value: string) => Promise<void> | void;
  onSelectRevision?: (assetId: string, revisionId: string) => void;
}
