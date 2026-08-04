import type { z } from 'zod';

import type {
  ProjectMaterial as ApiProjectMaterial,
  projectMaterialRevisionSchema,
  requirementSchema,
} from '../api/project-materials';
import type {
  ProjectMaterial as ProjectMaterialView,
  ProjectMaterialKind as ProjectMaterialKindView,
  ProjectMaterialParseStatus as ProjectMaterialParseStatusView,
  ProjectRequirement as ProjectRequirementView,
  RequirementType as RequirementTypeView,
} from '../../features/project-materials/types';
import { evidenceSourceLabel } from './evidence';
import { assertProjectScope, ProjectScopeMismatchError } from './scope';

type ApiProjectMaterialRevision = z.infer<typeof projectMaterialRevisionSchema>;
export type ApiProjectRequirement = z.infer<typeof requirementSchema>;
type ApiMaterialEventType = ApiProjectMaterialRevision['event_type'];
type ApiParseStatus = ApiProjectMaterialRevision['parse_status'];
type ApiRequirementType = ApiProjectRequirement['type'];
type ApiRequirementStatus = ApiProjectRequirement['status'];

const materialKindByEventType = {
  initial: 'other',
  supplement: 'other',
  clarification: 'clarification',
  replacement: 'other',
} satisfies Record<ApiMaterialEventType, ProjectMaterialKindView>;

const parseStatusMap = {
  uploaded: 'queued',
  parsing: 'parsing',
  parsed: 'parsed',
  needs_review: 'needs_confirmation',
  failed: 'failed',
} satisfies Record<ApiParseStatus, ProjectMaterialParseStatusView>;

const parseProgressMap = {
  uploaded: 5,
  parsing: 55,
  parsed: 100,
  needs_review: 100,
  failed: 0,
} satisfies Record<ApiParseStatus, number>;

const requirementTypeMap = {
  basic_info: 'basic_info',
  qualification: 'qualification',
  score_rule: 'score_rule',
  reject_clause: 'reject_clause',
  tech_requirement: 'tech_requirement',
  quote_rule: 'quote_rule',
  material_checklist: 'material_checklist',
  attachment: 'attachment',
} satisfies Record<ApiRequirementType, RequirementTypeView>;

const requirementDefaultTitleMap = {
  basic_info: '基本信息',
  qualification: '资格要求',
  score_rule: '评分规则',
  reject_clause: '否决条款',
  tech_requirement: '技术要求',
  quote_rule: '报价规则',
  material_checklist: '材料清单',
  attachment: '附件要求',
} satisfies Record<ApiRequirementType, string>;

const requirementConfirmationStatusMap = {
  extracted: 'needs_confirmation',
  needs_review: 'needs_confirmation',
  confirmed: 'confirmed',
  corrected: 'confirmed',
} satisfies Record<ApiRequirementStatus, ProjectRequirementView['confirmationStatus']>;

export interface ProjectEvidenceSource {
  fileName: string;
  revisionNo: number;
}

const projectEvidenceIndexBrand: unique symbol = Symbol('ProjectEvidenceIndex');

export interface ProjectEvidenceIndex {
  readonly projectId: string;
  readonly [projectEvidenceIndexBrand]: true;
  lookup(revisionId: string): ProjectEvidenceSource | undefined;
}

function assertProjectEvidenceIndex(
  evidenceIndex: ProjectEvidenceIndex,
  expectedProjectId: string,
): void {
  if (evidenceIndex[projectEvidenceIndexBrand] !== true) {
    throw new ProjectScopeMismatchError();
  }
  assertProjectScope(expectedProjectId, evidenceIndex.projectId);
}

export function createProjectEvidenceIndex(
  materials: readonly ApiProjectMaterial[],
  expectedProjectId: string,
): ProjectEvidenceIndex {
  const index = new Map<string, ProjectEvidenceSource>();

  for (const material of materials) {
    assertProjectScope(expectedProjectId, material.project_id);
    assertProjectScope(expectedProjectId, material.current_revision.project_id);
    index.set(material.current_revision.revision_id, {
      fileName: material.name,
      revisionNo: material.current_revision.version_no,
    });
  }

  return Object.freeze({
    projectId: expectedProjectId,
    [projectEvidenceIndexBrand]: true as const,
    lookup: (revisionId: string) => index.get(revisionId),
  });
}

export function adaptProjectMaterial(
  material: ApiProjectMaterial,
  expectedProjectId: string,
): ProjectMaterialView {
  assertProjectScope(expectedProjectId, material.project_id);
  assertProjectScope(expectedProjectId, material.current_revision.project_id);

  const revision = material.current_revision;
  return {
    id: material.material_id,
    name: material.name,
    kind: materialKindByEventType[revision.event_type],
    revisionNo: revision.version_no,
    parseStatus: parseStatusMap[revision.parse_status],
    parseProgress: parseProgressMap[revision.parse_status],
    uploadedAt: revision.created_at,
  };
}

export function adaptProjectMaterials(
  materials: readonly ApiProjectMaterial[],
  expectedProjectId: string,
): ProjectMaterialView[] {
  return materials.map((material) => adaptProjectMaterial(material, expectedProjectId));
}

export function adaptProjectRequirement(
  requirement: ApiProjectRequirement,
  expectedProjectId: string,
  evidenceIndex: ProjectEvidenceIndex,
): ProjectRequirementView {
  assertProjectScope(expectedProjectId, requirement.project_id);
  assertProjectEvidenceIndex(evidenceIndex, expectedProjectId);

  const evidence =
    requirement.evidence_refs.find((candidate) => candidate.source_type === 'project_material') ??
    requirement.evidence_refs[0];
  const indexedSource = evidence ? evidenceIndex.lookup(evidence.source_revision_id) : undefined;
  const structuredTitle = requirement.structured.title;
  const title =
    typeof structuredTitle === 'string' && structuredTitle.trim().length > 0
      ? structuredTitle
      : requirementDefaultTitleMap[requirement.type];

  return {
    id: requirement.requirement_id,
    type: requirementTypeMap[requirement.type],
    title,
    content: requirement.content,
    confidence: requirement.confidence,
    confirmationStatus: requirementConfirmationStatusMap[requirement.status],
    revisionNo: indexedSource?.revisionNo ?? 0,
    coordinate: {
      fileName: indexedSource?.fileName ?? (evidence ? evidenceSourceLabel(evidence) : '未提供证据'),
      fileRevisionNo: indexedSource?.revisionNo ?? 0,
      pageNo: evidence?.locator.page,
    },
  };
}

export function adaptProjectRequirements(
  requirements: readonly ApiProjectRequirement[],
  expectedProjectId: string,
  evidenceIndex: ProjectEvidenceIndex,
): ProjectRequirementView[] {
  return requirements.map((requirement) =>
    adaptProjectRequirement(requirement, expectedProjectId, evidenceIndex),
  );
}
