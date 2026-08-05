import type { HistoryPriceSample, QuoteCalculationView } from '../domains/pricing/types';
import type { ProjectOverviewView } from '../domains/projects/ProjectOverviewPage';
import type { WorkspaceMaterial } from '../domains/projects/ProjectWorkbench';
import type { ReviewProvider, ReviewRunView } from '../domains/review/types';
import type {
  EnterpriseAsset,
  EnterpriseIngestionItem,
} from '../features/enterprise-assets';
import type {
  ProjectMaterial,
  ProjectRequirement,
  ProjectSnapshot,
} from '../features/project-materials';
import { publicTaskEventSchema, type PublicTaskEvent } from '../shared/api/task-events';

export const defaultProjectId = 'BV-2026-018';
export const defaultProjectName = '海上平台电气设备采购项目';

export const projectWorkspaceMaterialsDemoByProjectId: Record<string, WorkspaceMaterial[]> = {
  [defaultProjectId]: [
    { id: 'tender', name: '招标文件', status: '已识别', tone: 'blue' },
    { id: 'notice', name: '招标公告', status: '已识别', tone: 'blue' },
    { id: 'spec', name: '技术规范书', status: '已识别', tone: 'blue' },
    { id: 'tech', name: '技术要求', status: '已识别', tone: 'blue' },
    { id: 'quote', name: '报价模板', status: '已识别', tone: 'red' },
    { id: 'clarification', name: '澄清补遗', status: '已识别', tone: 'blue' },
    { id: 'qualification', name: '资格审查文件', status: '已识别', tone: 'blue' },
    { id: 'review', name: '评标办法', status: '已识别', tone: 'orange' },
    { id: 'contract', name: '合同条款', status: '已识别', tone: 'blue' },
    { id: 'drawing', name: '图纸（电气部分）', status: '已识别', tone: 'blue' },
    { id: 'bill', name: '工程量清单', status: '已识别', tone: 'green' },
    { id: 'other', name: '其他附件', status: '已识别', tone: 'orange' },
  ],
};

export const projectOverviewDemoByProjectId: Record<string, ProjectOverviewView> = {
  [defaultProjectId]: {
    deliverables: [
      { id: 'business', title: '商务标文件', pages: 128, words: '28.6 万', score: '28.6 / 30', lift: '6.2 分', missing: 2, tone: 'business' },
      { id: 'technical', title: '技术标文件', pages: 186, words: '42.3 万', score: '45.3 / 50', lift: '6.8 分', missing: 1, tone: 'technical' },
      { id: 'quote', title: '报价单', pages: 32, words: '8.7 万', score: '17.5 / 20', lift: '2.6 分', missing: 0, tone: 'quote' },
    ],
    score: {
      business: 28.6,
      estimatedLift: 6.2,
      missingMaterials: 3,
      pricing: 17.5,
      rejectionRisks: 0,
      technical: 45.3,
      total: 91.4,
    },
  },
};

export const enterpriseAssetsDemo: EnterpriseAsset[] = [
  {
    id: 'enterprise-asset-001',
    name: '营业执照（2026 年更新）',
    category: 'license',
    classificationConfidence: 0.99,
    status: 'ready',
    updatedAt: '2026-07-28 16:42',
    expiresAt: '长期有效',
    facts: [
      {
        key: 'company_name',
        label: '企业名称',
        value: '华东智造科技有限公司',
        confidence: 0.99,
        sourceLabel: '营业执照（2026 年更新）',
        sourcePage: 1,
      },
      {
        key: 'credit_code',
        label: '统一社会信用代码',
        value: '91310115MA1K4BV018',
        confidence: 0.99,
        sourceLabel: '营业执照（2026 年更新）',
        sourcePage: 1,
      },
      {
        key: 'legal_representative',
        label: '法定代表人',
        value: '林若川',
        confidence: 0.97,
        sourceLabel: '营业执照（2026 年更新）',
        sourcePage: 1,
      },
    ],
    revisions: [
      {
        id: 'enterprise-revision-002',
        revisionNo: 2,
        createdAt: '2026-07-28 16:42',
        createdBy: 'Agent 自动归档',
        changeNote: '识别新版营业执照并更新登记信息',
        isCurrent: true,
      },
      {
        id: 'enterprise-revision-001',
        revisionNo: 1,
        createdAt: '2025-03-12 10:18',
        createdBy: '张明',
        changeNote: '首次上传',
        isCurrent: false,
      },
    ],
  },
  {
    id: 'enterprise-asset-002',
    name: '电力工程施工总承包资质',
    category: 'qualification',
    classificationConfidence: 0.93,
    status: 'needs_review',
    updatedAt: '2026-08-04 09:15',
    expiresAt: '2027-06-30',
    facts: [
      {
        key: 'qualification_level',
        label: '资质等级',
        value: '二级',
        confidence: 0.95,
        sourceLabel: '施工企业资质证书',
        sourcePage: 1,
      },
      {
        key: 'certificate_number',
        label: '证书编号',
        value: 'D2310BVO18',
        confidence: 0.68,
        sourceLabel: '施工企业资质证书',
        sourcePage: 1,
        needsReview: true,
      },
    ],
    revisions: [
      {
        id: 'enterprise-revision-003',
        revisionNo: 1,
        createdAt: '2026-08-04 09:15',
        createdBy: 'Agent 自动归档',
        changeNote: '自动分类为企业资质并抽取字段',
        isCurrent: true,
      },
    ],
  },
  {
    id: 'enterprise-asset-003',
    name: '海上平台配电柜供货业绩',
    category: 'performance',
    classificationConfidence: 0.96,
    status: 'ready',
    updatedAt: '2026-06-18 13:20',
    facts: [
      {
        key: 'customer',
        label: '客户名称',
        value: '华海能源装备有限公司',
        confidence: 0.94,
        sourceLabel: '供货合同与验收证明',
        sourcePage: 2,
      },
      {
        key: 'contract_amount',
        label: '合同金额',
        value: '1,286 万元',
        confidence: 0.97,
        sourceLabel: '供货合同与验收证明',
        sourcePage: 4,
      },
    ],
    revisions: [
      {
        id: 'enterprise-revision-004',
        revisionNo: 1,
        createdAt: '2026-06-18 13:20',
        createdBy: '陈潇',
        changeNote: '合同、验收证明组合归档',
        isCurrent: true,
      },
    ],
  },
];

export const enterpriseIngestionDemo: EnterpriseIngestionItem[] = [
  {
    id: 'ingestion-001',
    name: '2026 年产品检测报告.pdf',
    status: 'extracting',
    progress: 72,
  },
];

export const projectMaterialsDemo: ProjectMaterial[] = [
  {
    id: 'project-material-001',
    name: '海上平台电气设备采购招标文件.pdf',
    kind: 'tender_document',
    revisionNo: 2,
    parseStatus: 'parsed',
    parseProgress: 100,
    blocksCount: 1386,
    uploadedAt: '2026-08-02 09:20',
    supersedesRevisionNo: 1,
  },
  {
    id: 'project-material-002',
    name: '附件 3：技术规格书.docx',
    kind: 'technical_specification',
    revisionNo: 1,
    parseStatus: 'needs_confirmation',
    parseProgress: 100,
    blocksCount: 462,
    uploadedAt: '2026-08-02 09:24',
  },
  {
    id: 'project-material-003',
    name: '澄清通知 01 号.pdf',
    kind: 'clarification',
    revisionNo: 1,
    parseStatus: 'parsing',
    parseProgress: 64,
    uploadedAt: '2026-08-05 08:35',
  },
  {
    id: 'project-material-004',
    name: '分项报价模板.xlsx',
    kind: 'quote_template',
    revisionNo: 1,
    parseStatus: 'parsed',
    parseProgress: 100,
    blocksCount: 218,
    uploadedAt: '2026-08-02 09:26',
  },
];

export const projectRequirementsDemo: ProjectRequirement[] = [
  {
    id: 'requirement-001',
    type: 'qualification',
    title: '施工总承包资质',
    content: '投标人须具备电力工程施工总承包二级及以上资质。',
    confidence: 0.98,
    confirmationStatus: 'confirmed',
    revisionNo: 3,
    coordinate: {
      fileName: '海上平台电气设备采购招标文件.pdf',
      fileRevisionNo: 2,
      pageNo: 18,
      blockIndex: 4,
    },
  },
  {
    id: 'requirement-002',
    type: 'reject_clause',
    title: '防护等级否决项',
    content: '户外配电柜防护等级不得低于 IP56，否则按无效投标处理。',
    confidence: 0.83,
    confirmationStatus: 'needs_confirmation',
    revisionNo: 2,
    coordinate: {
      fileName: '附件 3：技术规格书.docx',
      fileRevisionNo: 1,
      pageNo: 12,
      blockIndex: 7,
    },
  },
  {
    id: 'requirement-003',
    type: 'quote_rule',
    title: '报价口径',
    content: '投标报价应包含 13% 增值税、包装及项目现场运输费用。',
    confidence: 0.96,
    confirmationStatus: 'confirmed',
    revisionNo: 1,
    coordinate: {
      fileName: '分项报价模板.xlsx',
      fileRevisionNo: 1,
      blockIndex: 21,
    },
  },
];

export const projectSnapshotsDemo: ProjectSnapshot[] = [
  {
    id: 'snapshot-20260805-02',
    label: '评审前冻结快照',
    createdAt: '2026-08-05 10:02',
    materialRevisionCount: 5,
    requirementRevisionNo: 3,
    isCurrent: true,
  },
  {
    id: 'snapshot-20260803-01',
    label: '方案编制基线',
    createdAt: '2026-08-03 14:18',
    materialRevisionCount: 4,
    requirementRevisionNo: 2,
    isCurrent: false,
  },
];

export const publicTaskEventsDemo: PublicTaskEvent[] = publicTaskEventSchema.array().parse([
  {
    schema_version: '1',
    event_id: 'public-event-004',
    sequence: 4,
    task_id: 'public-task-handle-001',
    project_id: defaultProjectId,
    phase: 'checking',
    status: 'running',
    percent: 72,
    public_message: '正在核验技术方案中的引用位置',
    error_code: null,
    occurred_at: '2026-08-05T14:36:00+08:00',
  },
  {
    schema_version: '1',
    event_id: 'public-event-003',
    sequence: 3,
    task_id: 'public-task-handle-001',
    project_id: defaultProjectId,
    phase: 'drafting',
    status: 'succeeded',
    percent: 64,
    public_message: '技术方案初稿已生成，可继续编辑',
    error_code: null,
    occurred_at: '2026-08-05T14:32:00+08:00',
  },
  {
    schema_version: '1',
    event_id: 'public-event-002',
    sequence: 2,
    task_id: 'public-task-handle-001',
    project_id: defaultProjectId,
    phase: 'parsing',
    status: 'succeeded',
    percent: 38,
    public_message: '已整理 86 条招标需求并完成来源定位',
    error_code: null,
    occurred_at: '2026-08-05T14:27:00+08:00',
  },
  {
    schema_version: '1',
    event_id: 'public-event-001',
    sequence: 1,
    task_id: 'public-task-handle-001',
    project_id: defaultProjectId,
    phase: 'queued',
    status: 'succeeded',
    percent: 8,
    public_message: '项目材料已进入本次工作台处理队列',
    error_code: null,
    occurred_at: '2026-08-05T14:20:00+08:00',
  },
]);

export const reviewProvidersDemo: ReviewProvider[] = [
  {
    id: 'provider-api',
    name: '合规评审 API',
    type: 'api',
    version: '2026.08',
    description: '由服务端适配器调用外部合规评审应用。',
    available: true,
  },
  {
    id: 'provider-code',
    name: '受限规则代码',
    type: 'sandbox_code',
    version: 'v3.4.1',
    description: '在隔离沙箱执行已签名的确定性校核代码。',
    available: true,
  },
  {
    id: 'provider-rule',
    name: '集团规则引擎',
    type: 'rule_engine',
    version: 'rule-set-18',
    description: '按集团投标内控规则检查必备项与风险。',
    available: true,
  },
  {
    id: 'provider-document',
    name: '业主评分办法',
    type: 'document_rule',
    version: 'rev-2',
    description: '从本项目评分文档固化的可追溯规则集。',
    available: false,
  },
];

export const reviewRunDemo: ReviewRunView = {
  id: 'review-run-20260805-06',
  status: 'succeeded',
  projectSnapshotId: 'snapshot-20260805-02',
  deliverableVersions: ['商务标 v8', '技术标 v6', '报价单 v4'],
  providerId: 'provider-api',
  providerVersion: '2026.08',
  responseHash: 'sha256:c8fa…90e4',
  finishedAt: '2026-08-05 10:18',
  validatedSummary: {
    totalFindingCount: 18,
    categoryCounts: [
      { key: 'business-bid-letter', label: '商务标-投标函', count: 4 },
      { key: 'business-document', label: '商务标文件', count: 4 },
    ],
    currentScore: 76,
    predictedScore: 91.6,
    totalLift: 15.6,
    sectionLifts: {
      business: 6.2,
      technical: 6.8,
      pricing: 2.6,
    },
  },
  findings: [
    {
      id: 'finding-001',
      title: '资质证书有效期覆盖不足',
      outcome: 'risk',
      ruleVersion: 'qualification-18.3',
      confidence: 0.96,
      suggestion: '请确认资质证书在合同预计履行期内持续有效，必要时补充续期承诺。',
      evidence: {
        sourceLabel: '招标文件',
        locator: '第 18 页 · 资格条件 3.1',
        exactQuote: '证书有效期须覆盖合同履行期。',
        verification: 'verified',
      },
    },
    {
      id: 'finding-002',
      title: '技术响应表已覆盖防护等级',
      outcome: 'pass',
      ruleVersion: 'technical-7.2',
      confidence: 0.99,
      suggestion: '无需处理，保留当前证据引用。',
      evidence: {
        sourceLabel: '技术标 v6',
        locator: '响应表第 42 行',
        exactQuote: '柜体防护等级：IP56。',
        verification: 'verified',
      },
    },
    {
      id: 'finding-003',
      title: '运输边界仍需人工确认',
      outcome: 'unknown',
      ruleVersion: 'quote-4.1',
      confidence: 0.61,
      suggestion: '确认海运转陆运节点是否包含在投标总价中。',
      evidence: {
        sourceLabel: '报价说明',
        locator: '第 2 页 · 费用范围',
        verification: 'verified',
      },
    },
  ],
};

export const historyPriceSamplesDemo: HistoryPriceSample[] = [
  {
    id: 'history-001',
    materialName: '海工智能配电柜',
    specification: 'IP56 / 400V / 13% 税率',
    price: '126800.00',
    currency: 'CNY',
    taxIncluded: true,
    occurredAt: '2026-04-02',
    sourceLabel: '华东海工项目历史成交',
    usable: true,
  },
  {
    id: 'history-002',
    materialName: '海工智能配电柜',
    specification: 'IP56 / 400V / 13% 税率',
    price: '131500.00',
    currency: 'CNY',
    taxIncluded: true,
    occurredAt: '2025-11-16',
    sourceLabel: '沿海平台扩建项目',
    usable: true,
  },
  {
    id: 'history-003',
    materialName: '低压配电柜',
    specification: 'IP55 / 400V / 13% 税率',
    price: '124200.00',
    currency: 'CNY',
    taxIncluded: true,
    occurredAt: '2025-08-21',
    sourceLabel: '东江能源年度框架',
    usable: true,
  },
  {
    id: 'history-004',
    materialName: '智能控制柜',
    specification: 'IP42 / 380V / 未税',
    price: '83000.00',
    currency: 'CNY',
    taxIncluded: false,
    occurredAt: '2023-01-12',
    sourceLabel: '旧版历史样本',
    usable: false,
    excludedReason: '规格、税口径与时间差异超过算法阈值',
  },
];

export const quoteCalculationDemo: QuoteCalculationView = {
  id: 'quote-calc-20260805-03',
  status: 'calculated',
  algorithmVersion: 'quote-engine-2.4.0',
  sampleSnapshotId: 'sample-snapshot-20260805-01',
  querySnapshotId: 'history-query-20260805-08',
  strategies: [
    {
      id: 'win',
      name: '中标优先',
      description: '在最低毛利约束下，提高价格竞争力。',
      amount: '29600.00',
      currency: 'CNY',
      confidenceLow: '28800.00',
      confidenceHigh: '30200.00',
      predictedScore: '94.6',
      grossMargin: '9.46%',
      riskLevel: 'low',
    },
    {
      id: 'balanced',
      name: '均衡策略',
      description: '兼顾样本中位水平、目标毛利与中标概率。',
      amount: '30200.00',
      currency: 'CNY',
      confidenceLow: '28800.00',
      confidenceHigh: '31600.00',
      predictedScore: '88.2',
      grossMargin: '11.26%',
      riskLevel: 'medium',
      recommended: true,
    },
    {
      id: 'profit',
      name: '利润优先',
      description: '在评分下降可控的范围内提高目标毛利。',
      amount: '31600.00',
      currency: 'CNY',
      confidenceLow: '30200.00',
      confidenceHigh: '32400.00',
      predictedScore: '78.5',
      grossMargin: '15.19%',
      riskLevel: 'high',
    },
  ],
};
