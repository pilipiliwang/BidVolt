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
  | 'failed';

export type RequirementType =
  | 'basic_info'
  | 'qualification'
  | 'score_rule'
  | 'reject_clause'
  | 'tech_requirement'
  | 'quote_rule'
  | 'material_checklist'
  | 'attachment';

export interface ProjectMaterial {
  id: string;
  name: string;
  kind: ProjectMaterialKind;
  revisionNo: number;
  parseStatus: ProjectMaterialParseStatus;
  parseProgress: number;
  blocksCount?: number;
  uploadedAt: string;
  supersedesRevisionNo?: number;
}

export interface RequirementCoordinate {
  fileName: string;
  fileRevisionNo: number;
  pageNo?: number;
  blockIndex?: number;
}

export interface ProjectRequirement {
  id: string;
  type: RequirementType;
  title: string;
  content: string;
  confidence: number;
  confirmationStatus: 'confirmed' | 'needs_confirmation';
  revisionNo: number;
  coordinate: RequirementCoordinate;
}

export interface ProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  materialRevisionCount: number;
  requirementRevisionNo: number;
  isCurrent: boolean;
}

export interface ProjectMaterialUploadProps {
  projectId: string;
  projectName: string;
  onUpload?: (projectId: string, files: File[]) => Promise<void> | void;
}

export interface ProjectMaterialsPageProps extends ProjectMaterialUploadProps {
  enterpriseMaterials?: import('../../domains/projects/ProjectWorkbench').WorkspaceMaterial[];
  materials: ProjectMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAssistantSend?: (value: string) => void;
  onImportTenderNoticeUrl?: (
    projectId: string,
    url: string,
  ) => Promise<{ message?: string; status?: 'queued' | 'processing' | 'completed' } | void>;
  requirements: ProjectRequirement[];
  snapshots: ProjectSnapshot[];
  onConfirmRequirement?: (projectId: string, requirementId: string) => void;
  onOpenSnapshot?: (projectId: string, snapshotId: string) => void;
  onStartTask: (projectId: string, mode: 'generate' | 'validate') => Promise<void> | void;
}
