export type ProjectStage = '材料解析' | '方案编制' | '内部评审' | '待提交' | '状态未知';

export type ProjectSummary = {
  buyer: string;
  code: string;
  deadline: string;
  id: string;
  materialCount?: number;
  progress?: number;
  riskCount?: number;
  stage: ProjectStage;
  title: string;
  updatedAt: string;
};
