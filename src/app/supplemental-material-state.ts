import { getProjectScopeKey } from './session';

export type SupplementalMaterialIdsByScope = Record<string, string[]>;
export type CompletedBidMaterialIdsByScope = Record<string, string[]>;

type UploadedProjectFile = {
  file_id: number | string;
  name: string;
};

function getScopedMaterialIds(
  state: Record<string, string[]>,
  enterpriseId: string,
  projectId: string,
) {
  return state[getProjectScopeKey(enterpriseId, projectId)] ?? [];
}

function recordScopedMaterialFiles(
  state: Record<string, string[]>,
  enterpriseId: string,
  projectId: string,
  files: readonly UploadedProjectFile[],
) {
  if (files.length === 0) return state;
  const scopeKey = getProjectScopeKey(enterpriseId, projectId);
  const ids = new Set(state[scopeKey] ?? []);
  files.forEach((file) => ids.add(String(file.file_id)));
  return { ...state, [scopeKey]: [...ids] };
}

export function getSupplementalMaterialIds(
  state: SupplementalMaterialIdsByScope,
  enterpriseId: string,
  projectId: string,
) {
  return getScopedMaterialIds(state, enterpriseId, projectId);
}

export function recordSupplementalMaterialFiles(
  state: SupplementalMaterialIdsByScope,
  enterpriseId: string,
  projectId: string,
  files: readonly UploadedProjectFile[],
): SupplementalMaterialIdsByScope {
  return recordScopedMaterialFiles(state, enterpriseId, projectId, files);
}

export function getCompletedBidMaterialIds(
  state: CompletedBidMaterialIdsByScope,
  enterpriseId: string,
  projectId: string,
) {
  return getScopedMaterialIds(state, enterpriseId, projectId);
}

export function recordCompletedBidMaterialFiles(
  state: CompletedBidMaterialIdsByScope,
  enterpriseId: string,
  projectId: string,
  files: readonly UploadedProjectFile[],
): CompletedBidMaterialIdsByScope {
  return recordScopedMaterialFiles(state, enterpriseId, projectId, files);
}
