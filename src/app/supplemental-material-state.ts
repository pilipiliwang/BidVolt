import { getProjectScopeKey } from './session';

export type SupplementalMaterialIdsByScope = Record<string, string[]>;

type UploadedProjectFile = {
  file_id: number | string;
  name: string;
};

export function getSupplementalMaterialIds(
  state: SupplementalMaterialIdsByScope,
  enterpriseId: string,
  projectId: string,
) {
  return state[getProjectScopeKey(enterpriseId, projectId)] ?? [];
}

export function recordSupplementalMaterialFiles(
  state: SupplementalMaterialIdsByScope,
  enterpriseId: string,
  projectId: string,
  files: readonly UploadedProjectFile[],
): SupplementalMaterialIdsByScope {
  if (files.length === 0) return state;
  const scopeKey = getProjectScopeKey(enterpriseId, projectId);
  const ids = new Set(state[scopeKey] ?? []);
  files.forEach((file) => ids.add(String(file.file_id)));
  return { ...state, [scopeKey]: [...ids] };
}
