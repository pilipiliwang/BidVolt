export type AppSession = {
  enterpriseId: string;
  enterpriseName: string;
  userId: string;
  user: {
    displayName: string;
    role: string;
  };
};

export const demoSession: AppSession = {
  enterpriseId: 'enterprise-huadong-001',
  enterpriseName: '华东智造科技有限公司',
  userId: 'user-lin-001',
  user: {
    displayName: '林若川',
    role: '投标负责人',
  },
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
