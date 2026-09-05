import type { PublicTaskEvent } from '../../shared/task-events';
import type { EnterpriseAssetPreview } from '../enterprise-assets/types';
import type { ProjectReviewSidebarViewModel } from '../../domains/projects/ProjectReviewSidebar';
import type {
  EnterpriseMaterialsRefreshHandler,
  EnterpriseUploadHandler,
} from '../../domains/projects/ProjectWorkbench';
import type {
  ProjectWorkflowFacts,
  ProjectWorkflowTaskSummary,
} from '../../domains/projects/ProjectWorkflow';
import type { FileImageDescriptions } from '../../shared/backend-api/types';

export type ProjectMaterialKind =
  | 'tender_notice'
  | 'tender_document'
  | 'technical_specification'
  | 'scoring_rules'
  | 'quote_template'
  | 'clarification'
  | 'drawing'
  | 'other';

export type ProjectMaterialParseStatus =
  | 'queued'
  | 'parsing'
  | 'parsed'
  | 'needs_confirmation'
  | 'failed'
  | 'unknown';

export type ProjectMaterialPurpose =
  | 'current_tender'
  | 'supplemental'
  | 'completed_bid';

export type RequirementType =
  | 'basic_info'
  | 'qualification'
  | 'score_rule'
  | 'reject_clause'
  | 'tech_requirement'
  | 'quote_rule'
  | 'material_checklist'
  | 'attachment'
  | 'unknown';

export interface ProjectMaterial {
  id: string;
  name: string;
  kind: ProjectMaterialKind;
  revisionNo?: number;
  parseStatus: ProjectMaterialParseStatus;
  /** Persisted backend role only. Missing means the API did not classify the file purpose. */
  purpose?: ProjectMaterialPurpose;
  parseProgress?: number;
  blocksCount?: number;
  imageCount?: number;
  imageDescribedCount?: number;
  uploadedAt: string;
  supersedesRevisionNo?: number;
}

export interface RequirementCoordinate {
  fileName: string;
  fileRevisionNo?: number;
  pageNo?: number;
  blockIndex?: number;
}

export interface ProjectRequirement {
  id: string;
  type: RequirementType;
  title: string;
  content: string;
  confidence?: number;
  confirmationStatus: 'confirmed' | 'needs_confirmation' | 'unavailable';
  revisionNo: number;
  coordinate: RequirementCoordinate;
}

export interface ProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  materialRevisionCount?: number;
  requirementRevisionNo?: number;
  isCurrent?: boolean;
}

export interface ProjectMaterialUploadProps {
  projectId: string;
  projectName: string;
  onUpload?: (projectId: string, files: File[]) => Promise<void> | void;
  onRemoveMaterial?: (projectId: string, fileId: string) => Promise<void> | void;
}

export interface ProjectMaterialsPageProps extends ProjectMaterialUploadProps {
  enterpriseCategories?: import('../enterprise-assets').EnterpriseAssetCategoryFolder[];
  enterpriseLibraryKey?: string;
  enterpriseMaterials?: import('../../domains/projects/ProjectWorkbench').WorkspaceMaterial[];
  materials: ProjectMaterial[];
  hasDeliverables?: boolean;
  initialWorkflowMode?: 'choose' | 'generate';
  onAddEnterpriseFiles?: EnterpriseUploadHandler;
  onRefreshEnterpriseMaterials?: EnterpriseMaterialsRefreshHandler;
  onLoadEnterprisePreview?: (fileId: string, fileName: string) => Promise<EnterpriseAssetPreview>;
  onDownloadEnterpriseFile?: (fileId: string, fileName: string) => void | Promise<void>;
  onAssistantAddFiles?: (files: File[]) => void | Promise<void>;
  onCompletedBidUpload?: (projectId: string, files: File[]) => void | Promise<void>;
  onAssistantSend?: (value: string) => void | Promise<void>;
  onImportTenderNoticeUrl?: (
    projectId: string,
    url: string,
  ) => Promise<{ message?: string; status?: 'queued' | 'processing' | 'completed' } | void>;
  onLoadImageDescriptions?: (fileId: string) => Promise<FileImageDescriptions>;
  requirements: ProjectRequirement[];
  reviewSidebar?: ProjectReviewSidebarViewModel;
  snapshots: ProjectSnapshot[];
  taskSummary?: ProjectWorkflowTaskSummary;
  generationTaskId?: string;
  taskStatus?: PublicTaskEvent['status'];
  onOpenTasks?: () => void;
  onConfirmRequirement?: (projectId: string, requirementId: string) => Promise<void> | void;
  onCorrectRequirement?: (
    projectId: string,
    requirementId: string,
    content: string,
  ) => Promise<void> | void;
  onOpenSnapshot?: (projectId: string, snapshotId: string) => void;
  onStartTask: (projectId: string, mode: 'generate' | 'validate') => Promise<void> | void;
  workflowFacts?: ProjectWorkflowFacts;
}
