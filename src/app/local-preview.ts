import type { HistoryPriceSample, QuoteCalculationView } from '../domains/pricing/types';
import type { ProjectSummary } from '../domains/projects/project-view-model';
import type { ReviewProvider, ReviewRunView } from '../domains/review/types';
import type {
  EnterpriseAsset,
  EnterpriseAssetCategoryFolder,
  EnterpriseIngestionItem,
} from '../features/enterprise-assets';
import type { ProjectMaterial, ProjectRequirement, ProjectSnapshot } from '../features/project-materials';
import type { PublicTaskEvent } from '../shared/task-events';
import type { Deliverable, DeliverableContent } from '../shared/backend-api';
import type { DeliverableRouteId } from './router';
import type { AppSession } from './session';

export const LOCAL_PREVIEW_PROJECT_ID = 'local-preview';

export const localPreviewSession: AppSession = {
  enterpriseId: 'local-preview-enterprise',
  enterpriseName: '本地预览企业（非真实数据）',
  permissions: [],
  userId: 'local-preview-user',
  user: {
    displayName: '本地预览访客',
    role: '只读界面预览',
  },
};

export const localPreviewProject: ProjectSummary = {
  buyer: '界面预览招标人（非真实数据）',
  code: 'LOCAL-PREVIEW',
  deadline: '2026-08-31 17:00',
  id: LOCAL_PREVIEW_PROJECT_ID,
  materialCount: 3,
  progress: 72,
  riskCount: 1,
  stage: '内部评审',
  title: '接口联调界面预览项目（非真实数据）',
  updatedAt: '2026-08-14 10:00',
};

export const localPreviewMaterials: ProjectMaterial[] = [
  {
    id: 'preview-material-1',
    name: '招标公告界面预览.pdf',
    kind: 'tender_notice',
    purpose: 'current_tender',
    revisionNo: 1,
    parseStatus: 'parsed',
    parseProgress: 100,
    blocksCount: 36,
    uploadedAt: '2026-08-14 09:00',
  },
  {
    id: 'preview-material-2',
    name: '采购文件界面预览.docx',
    kind: 'tender_document',
    purpose: 'current_tender',
    revisionNo: 2,
    parseStatus: 'parsed',
    parseProgress: 100,
    blocksCount: 428,
    uploadedAt: '2026-08-14 09:05',
  },
  {
    id: 'preview-material-3',
    name: '报价模板界面预览.xlsx',
    kind: 'quote_template',
    purpose: 'current_tender',
    revisionNo: 1,
    parseStatus: 'needs_confirmation',
    parseProgress: 100,
    blocksCount: 24,
    uploadedAt: '2026-08-14 09:08',
  },
];

export const localPreviewRequirements: ProjectRequirement[] = [
  {
    id: 'preview-requirement-1',
    type: 'qualification',
    title: '资质要求（界面预览）',
    content: '此处仅展示后端 Requirement 返回后的界面形态，不代表真实招标要求。',
    confidence: 0.91,
    confirmationStatus: 'confirmed',
    revisionNo: 2,
    coordinate: { fileName: '采购文件界面预览.docx', fileRevisionNo: 2, pageNo: 12, blockIndex: 41 },
  },
  {
    id: 'preview-requirement-2',
    type: 'quote_rule',
    title: '报价规则待确认（界面预览）',
    content: '此字段用于预览待确认状态；确认操作在本地预览中会被阻止。',
    confidence: 0.63,
    confirmationStatus: 'needs_confirmation',
    revisionNo: 2,
    coordinate: { fileName: '报价模板界面预览.xlsx', fileRevisionNo: 1, blockIndex: 8 },
  },
];

export const localPreviewSnapshots: ProjectSnapshot[] = [{
  id: 'preview-snapshot-1',
  label: '本地界面预览快照（非后端快照）',
  createdAt: '2026-08-14 09:30',
  materialRevisionCount: 3,
  requirementRevisionNo: 2,
  isCurrent: true,
}];

export const localPreviewDeliverables: Deliverable[] = [
  { deliverable_id: 9101, project_id: 9001, deliverable_type: 1, title: '商务标文件（界面预览）', current_version_no: 2, stat: { pages: 12, word_count: 6800, score: '待后端评审', lift: '—' } },
  { deliverable_id: 9102, project_id: 9001, deliverable_type: 2, title: '技术标文件（界面预览）', current_version_no: 3, stat: { pages: 28, word_count: 18600, score: '待后端评审', lift: '—' } },
  { deliverable_id: 9103, project_id: 9001, deliverable_type: 3, title: '报价单（界面预览）', current_version_no: 1, stat: { pages: 3, word_count: 600, score: '待后端评审', lift: '—' } },
];

export const localPreviewProviders: ReviewProvider[] = [
  { id: 'preview-provider-api', name: '外部评审 API（契约预览）', type: 'api', version: '待后端返回', description: '仅展示 API 类型评审器的前端形态；未调用外部系统。', available: true },
  { id: 'preview-provider-code', name: '沙箱代码评审（契约预览）', type: 'sandbox_code', version: '待后端返回', description: '仅展示代码评审器的前端形态；未运行任何代码。', available: true },
];

export const localPreviewReview: ReviewRunView = {
  id: 'preview-review-run',
  status: 'succeeded',
  projectSnapshotId: 'preview-snapshot-1',
  deliverableVersions: ['商务标 V2', '技术标 V3', '报价单 V1'],
  providerId: 'preview-provider-api',
  providerVersion: '界面预览',
  findings: [{
    id: 'preview-finding-1',
    category: '技术响应',
    title: '评审建议界面预览（非真实结论）',
    outcome: 'risk',
    ruleVersion: 'preview-only',
    confidence: 0.88,
    currentScore: 8,
    fullScore: 10,
    improvableScore: 2,
    riskLevel: 'medium',
    suggestion: '此建议仅用于检查编辑交互；保存操作会被本地只读门禁阻止。',
    evidence: {
      sourceLabel: '采购文件界面预览.docx',
      locator: '第 24 页 · 技术响应章节',
      exactQuote: '本段内容为界面预览占位，不是招标文件原文。',
      verification: 'verified',
    },
  }],
};

export const localPreviewQuoteSamples: HistoryPriceSample[] = [
  {
    id: 'preview-price-1',
    materialName: '智能控制柜（界面预览）',
    specification: 'IP55 / 400V',
    price: '126800.00',
    currency: 'CNY',
    taxIncluded: true,
    occurredAt: '2026-04-02',
    sourceLabel: '外部历史库返回形态预览（非真实记录）',
    usable: true,
  },
  {
    id: 'preview-price-2',
    materialName: '智能控制柜（界面预览）',
    specification: '税口径未知',
    price: '119500.00',
    currency: 'CNY',
    occurredAt: '2025-12-18',
    sourceLabel: '外部历史库返回形态预览（非真实记录）',
    usable: false,
    excludedReason: '税口径未提供，不能直接用于测算',
  },
];

export const localPreviewQuote: QuoteCalculationView = {
  id: 'preview-calculation',
  status: 'calculated',
  algorithmVersion: '本地界面预览（未执行算法）',
  sampleSnapshotId: 'preview-price-snapshot',
  querySnapshotId: 'preview-query-snapshot',
  message: '金额仅用于预览布局，不是算法结果。',
  strategies: [{
    id: 'balance',
    name: '均衡策略（界面预览）',
    description: '用于检查后端策略返回后的界面；点击应用不会写入。',
    amount: '302000.00',
    currency: 'CNY',
    confidenceLow: '288000.00',
    confidenceHigh: '316000.00',
    grossMargin: '11.2%',
    riskLevel: 'medium',
    recommended: true,
  }],
};

export const localPreviewTasks: PublicTaskEvent[] = [{
  schema_version: '1',
  event_id: 'preview-task-event',
  sequence: 1,
  task_id: 'preview-task',
  project_id: LOCAL_PREVIEW_PROJECT_ID,
  phase: 'preview',
  status: 'succeeded',
  percent: 100,
  public_message: '此记录仅展示任务结果组件，未创建后端任务。',
  error_code: null,
  occurred_at: '2026-08-14T09:45:00+08:00',
}];

export const localPreviewEnterpriseAssets: EnterpriseAsset[] = [{
  id: 'preview-enterprise-asset-1',
  name: '营业执照界面预览.pdf',
  category: 'license',
  categoryId: 'preview-license',
  categoryLabel: '企业证照',
  classificationConfidence: 0.96,
  status: 'needs_review',
  updatedAt: '2026-08-14 08:30',
  expiresAt: '长期',
  facts: [{
    id: 'preview-fact-1',
    key: 'enterprise_name',
    label: '企业名称',
    value: '本地预览企业（非真实数据）',
    confidence: 0.96,
    sourceLabel: '营业执照界面预览.pdf',
    sourcePage: 1,
    needsReview: true,
  }],
  revisions: [{
    id: 'preview-revision-1',
    revisionNo: 1,
    createdAt: '2026-08-14 08:30',
    createdBy: '本地界面预览',
    changeNote: '仅展示版本追溯界面，未写入企业资料库。',
    isCurrent: true,
  }],
}];

export const localPreviewEnterpriseCategories: EnterpriseAssetCategoryFolder[] = [{
  id: 'preview-license',
  label: '企业证照',
  parentId: null,
}];

export const localPreviewIngestions: EnterpriseIngestionItem[] = [{
  id: 'preview-ingestion-1',
  name: '企业资料归类界面预览',
  status: 'completed',
  progress: 100,
}];

export function getLocalPreviewEditor(routeId: DeliverableRouteId, requestedVersion: string): {
  content: DeliverableContent;
  deliverable: Deliverable;
  readOnlyReason: string;
} | undefined {
  const deliverable = localPreviewDeliverables.find((item) => ({ 1: 'business', 2: 'technical', 3: 'quote' } as const)[item.deliverable_type] === routeId);
  if (!deliverable?.current_version_no) return undefined;
  const version = requestedVersion === 'latest' ? deliverable.current_version_no : Number(requestedVersion);
  if (!Number.isInteger(version) || version !== deliverable.current_version_no) return undefined;
  let model: DeliverableContent['model'];
  if (routeId === 'quote') {
    model = {
      rows: [{
        id: 'preview-row-1', code: 'PREVIEW-001', name: '智能控制柜（界面预览）',
        specification: 'IP55 / 400V', quantity: 2, unit: '套', tenderPrice: 320000, userPrice: 302000,
      }],
    };
  } else {
    model = {
      html: `<h1>${routeId === 'technical' ? '技术标' : '商务标'}成果界面预览</h1><p>这是一份仅供检查在线预览布局的本地快照，不是后端生成的投标成果。</p><h2>接口联调说明</h2><p>保存、下载、AI 修改与上传操作均由本地只读门禁阻止。</p>`,
    };
  }
  return {
    content: { deliverable_id: deliverable.deliverable_id, deliverable_type: deliverable.deliverable_type, version_no: version, model },
    deliverable,
    readOnlyReason: '本地只读预览：没有连接真实后端，编辑、保存和下载均已禁用。',
  };
}
