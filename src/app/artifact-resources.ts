import type { ProjectDeliverableView } from '../domains/projects/ProjectOverviewPage';
import type { ProjectResultCategory, ProjectResultFile } from '../domains/projects/ProjectResourceRail';
import type { AgentArtifactSummary } from '../shared/backend-api/artifacts';
import type { BackendId } from '../shared/backend-api/types';

export type ArtifactProjectResultFile = ProjectResultFile & {
  source: 'backend-artifact';
  artifactId: BackendId;
  projectId: BackendId;
  taskId: BackendId;
  versionNo: number;
  /** Backend package path retained separately from the visible leaf name. */
  artifactName: string;
  updatedAt: string | null;
};

const CATEGORY_BY_GROUP: Readonly<Record<string, ProjectResultCategory>> = {
  商务文件: 'business',
  技术文件: 'technical',
  价格文件: 'price',
  内部管理文件: 'internal',
  business: 'business',
  technical: 'technical',
  price: 'price',
  quote: 'price',
  internal: 'internal',
};
const CATEGORY_LABEL: Readonly<Record<ProjectResultCategory, string>> = {
  business: '商务文件', technical: '技术文件', price: '价格文件', internal: '内部管理文件',
  unclassified: '待分类成果',
};
const CATEGORY_ORDER = ['business', 'technical', 'price', 'internal'] as const;
const validId = (value: BackendId) => /^[1-9]\d*$/.test(String(value));

export function artifactResourceId(projectId: BackendId, artifactId: BackendId): string {
  if (!validId(projectId) || !validId(artifactId)) throw new TypeError('成果标识无效');
  return `artifact:${projectId}:${artifactId}`;
}

/** A plain file_id, deliverable_id, local filename or another project's ID never resolves here. */
export function artifactIdentityFromResourceId(projectId: BackendId, resourceId: string) {
  const match = /^artifact:([1-9]\d*):([1-9]\d*)$/.exec(resourceId);
  return match && match[1] === String(projectId)
    ? { projectId: match[1], artifactId: match[2] }
    : null;
}

function artifactCategory(artifact: AgentArtifactSummary): ProjectResultCategory | undefined {
  if (artifact.is_internal) return 'internal';
  // The group is backend metadata. Do not guess from a filename or move unknown files into "internal".
  return CATEGORY_BY_GROUP[artifact.group.trim()];
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Versions and timestamps are a refresh key, not evidence that scoring/package regeneration finished. */
export function artifactResourcesRevision(artifacts: readonly AgentArtifactSummary[]): string {
  return JSON.stringify(artifacts.map((artifact) => [
    String(artifact.project_id), String(artifact.artifact_id), artifact.version_no,
    artifact.updated_at, artifact.bytes, artifact.name, artifact.group, artifact.status,
  ]).sort((left, right) => String(left[1]).localeCompare(String(right[1]))));
}

/** Keeps all distinct artifact IDs, including same-name files returned by "save as new". */
export function adaptArtifactResources(projectId: BackendId, artifacts: readonly AgentArtifactSummary[]) {
  const resultFiles: ArtifactProjectResultFile[] = [];
  const packageArtifacts: AgentArtifactSummary[] = [];
  const unclassifiedArtifacts: AgentArtifactSummary[] = [];
  const seen = new Set<string>();

  for (const artifact of artifacts) {
    if (String(artifact.project_id) !== String(projectId)) throw new Error('不能显示其他项目的成果');
    const id = artifactResourceId(projectId, artifact.artifact_id);
    if (seen.has(id)) throw new Error('成果目录包含重复标识');
    seen.add(id);
    if (artifact.kind === 'zip') {
      packageArtifacts.push(artifact);
      continue;
    }
    const category = artifactCategory(artifact) ?? 'unclassified';
    if (category === 'unclassified') {
      unclassifiedArtifacts.push(artifact);
    }
    const name = artifact.filename.trim() || artifact.name.split('/').pop()?.trim();
    if (!name) {
      unclassifiedArtifacts.push(artifact);
      continue;
    }
    resultFiles.push({
      id, category, name,
      source: 'backend-artifact',
      artifactId: artifact.artifact_id,
      projectId: artifact.project_id,
      taskId: artifact.task_id,
      versionNo: artifact.version_no,
      artifactName: artifact.name,
      updatedAt: artifact.updated_at,
      mediaType: artifact.mime,
      sizeLabel: sizeLabel(artifact.bytes),
      versionLabel: `v${artifact.version_no}`,
      remoteRevision: JSON.stringify([artifact.version_no, artifact.updated_at, artifact.bytes]),
      // "ready" means a file exists, not that its content passed review.
      ...(artifact.status === 'ready' ? { statusLabel: '已生成' } : {}),
    });
  }

  // Existing overview cards are category-level. Never fabricate pages, scores or
  // a shared version number from the binary file directory.
  const deliverables: ProjectDeliverableView[] = CATEGORY_ORDER.flatMap((category) => {
    if (!resultFiles.some((file) => file.category === category)) return [];
    const routeId = category === 'price' ? 'quote' : category;
    return [{ id: routeId, tone: routeId, title: CATEGORY_LABEL[category], lift: '—', score: '—', words: '—' }];
  });

  return {
    resultFiles,
    deliverables,
    packageArtifacts,
    unclassifiedArtifacts,
    revision: artifactResourcesRevision(artifacts),
  };
}
