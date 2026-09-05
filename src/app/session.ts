export type AppSession = {
  enterpriseId: string;
  enterpriseName: string;
  permissions: string[];
  userId: string;
  user: {
    displayName: string;
    role: string;
  };
};

export function getProjectScopeKey(enterpriseId: string, projectId: string) {
  return `${encodeURIComponent(enterpriseId)}::${encodeURIComponent(projectId)}`;
}

export function getEditorDraftScopeKey(
  enterpriseId: string,
  userId: string,
  projectId: string,
) {
  return `${getProjectScopeKey(enterpriseId, projectId)}::${encodeURIComponent(userId)}`;
}
