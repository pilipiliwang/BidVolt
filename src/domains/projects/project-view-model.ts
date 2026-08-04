export type ProjectStage = '材料解析' | '方案编制' | '内部评审' | '待提交';

export type ProjectSummary = {
  buyer: string;
  code: string;
  deadline: string;
  id: string;
  materialCount: number;
  progress: number;
  riskCount: number;
  stage: ProjectStage;
  title: string;
  updatedAt: string;
};

export const projectSummaries: ProjectSummary[] = [
  {
    id: 'BV-2026-018',
    code: 'BV-2026-018',
    title: '海上平台电气设备采购项目',
    buyer: '中海能源装备有限公司',
    stage: '方案编制',
    progress: 72,
    deadline: '2026-08-12 17:00',
    materialCount: 24,
    riskCount: 3,
    updatedAt: '今天 14:32',
  },
  {
    id: 'BV-2026-015',
    code: 'BV-2026-015',
    title: '华南基地智能配电柜年度框架采购',
    buyer: '南方工业建设集团',
    stage: '内部评审',
    progress: 86,
    deadline: '2026-08-09 10:00',
    materialCount: 31,
    riskCount: 5,
    updatedAt: '今天 11:06',
  },
  {
    id: 'BV-2026-012',
    code: 'BV-2026-012',
    title: '沿海风电场箱式变电站扩容工程',
    buyer: '东江清洁能源有限公司',
    stage: '材料解析',
    progress: 34,
    deadline: '2026-08-20 15:00',
    materialCount: 12,
    riskCount: 1,
    updatedAt: '昨天 18:45',
  },
  {
    id: 'BV-2026-009',
    code: 'BV-2026-009',
    title: '炼化园区低压开关设备升级项目',
    buyer: '海州炼化工程管理中心',
    stage: '待提交',
    progress: 96,
    deadline: '2026-08-07 09:30',
    materialCount: 28,
    riskCount: 0,
    updatedAt: '昨天 16:20',
  },
];

export function getProjectSummary(projectId: string) {
  return projectSummaries.find((project) => project.id === projectId);
}
