import {
  calculatedQuoteSchema,
  documentBlockSchema,
  enterpriseAssetSchema,
  enterpriseAssetRevisionSchema,
  historyQuerySnapshotSchema,
  projectMaterialSchema,
  projectSnapshotSchema,
  publicTaskEventSchema,
  quoteInsufficientDataSchema,
  requirementSchema,
  reviewProviderSchema,
  reviewRunSchema,
  taskSchema,
} from '../shared/api';

const timestamp = '2026-08-05T01:20:00Z';

export const enterpriseAssetFixture = enterpriseAssetSchema.parse({
  asset_id: 'asset_001',
  name: '高压电缆检测报告',
  category: 'inspection_report',
  status: 'active',
  current_revision_id: 'ear_001',
  classification_confidence: 0.96,
  expires_at: null,
  facts: [
    {
      fact_id: 'fact_001',
      key: 'product_model',
      label: '产品型号',
      value: 'YJV22-8.7/15kV',
      confidence: 0.94,
      status: 'confirmed',
      evidence_refs: [
        {
          source_type: 'enterprise_asset',
          source_revision_id: 'ear_001',
          content_hash: 'a'.repeat(64),
          locator: { page: 2, block_id: 'block_e_01' },
          exact_quote: '产品型号：YJV22-8.7/15kV',
        },
      ],
    },
  ],
  created_at: timestamp,
  updated_at: timestamp,
});

export const enterpriseAssetRevisionFixture = enterpriseAssetRevisionSchema.parse({
  revision_id: 'ear_001',
  version_no: 1,
  original_name: '高压电缆检测报告.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1824000,
  sha256: 'a'.repeat(64),
  created_at: timestamp,
});

export const projectMaterialFixture = projectMaterialSchema.parse({
  material_id: 'material_001',
  project_id: 'project_001',
  name: '某变电站电缆招标文件.pdf',
  current_revision: {
    revision_id: 'pmr_001',
    material_id: 'material_001',
    project_id: 'project_001',
    event_id: 'event_001',
    event_type: 'initial',
    version_no: 1,
    original_name: '某变电站电缆招标文件.pdf',
    mime_type: 'application/pdf',
    size_bytes: 4288102,
    sha256: 'b'.repeat(64),
    parse_status: 'parsed',
    supersedes_revision_id: null,
    created_at: timestamp,
  },
  created_at: timestamp,
});

export const documentBlockFixture = documentBlockSchema.parse({
  block_id: 'block_p_31_06',
  source_revision_id: 'pmr_001',
  type: 'paragraph',
  page: 31,
  index: 6,
  text: '项目经理应至少具有两个同类项目业绩',
  confidence: 0.98,
});

export const requirementFixture = requirementSchema.parse({
  requirement_id: 'requirement_001',
  project_id: 'project_001',
  revision_id: 'req_rev_001',
  type: 'qualification',
  content: '项目经理应至少具有两个同类项目业绩',
  structured: { minimum_project_count: 2 },
  confidence: 0.96,
  status: 'needs_review',
  evidence_refs: [
    {
      source_type: 'project_material',
      source_revision_id: 'pmr_001',
      content_hash: 'b'.repeat(64),
      locator: { page: 31, block_id: 'block_p_31_06' },
      exact_quote: '项目经理应至少具有两个同类项目业绩',
    },
  ],
});

export const projectSnapshotFixture = projectSnapshotSchema.parse({
  snapshot_id: 'snapshot_001',
  project_id: 'project_001',
  status: 'frozen',
  reason: 'review',
  manifest: {
    project_material_revision_ids: ['pmr_001'],
    requirement_revision_ids: ['req_rev_001'],
    enterprise_asset_revision_ids: ['ear_001'],
    deliverable_version_ids: ['dv_biz_001', 'dv_tech_001', 'dv_quote_001'],
    quote_sample_snapshot_id: 'history_snapshot_001',
  },
  content_hash: 'e'.repeat(64),
  created_at: timestamp,
});

export const publicTaskEventFixture = publicTaskEventSchema.parse({
  schema_version: '1',
  event_id: 'event_public_012',
  sequence: 12,
  task_id: 'task_001',
  project_id: 'project_001',
  phase: 'material_match',
  status: 'running',
  percent: 48,
  public_message: '正在匹配企业资质材料',
  error_code: null,
  occurred_at: timestamp,
});

export const taskFixture = taskSchema.parse({
  task_id: 'task_001',
  project_id: 'project_001',
  project_snapshot_id: 'snapshot_001',
  phase: 'material_match',
  status: 'running',
  percent: 48,
  public_message: '正在匹配企业资质材料',
  error_code: null,
  created_at: timestamp,
  updated_at: timestamp,
});

export const reviewProvidersFixture = reviewProviderSchema.array().parse([
  {
    provider_id: 'review_api_001',
    name: '企业评审服务',
    type: 'api',
    version: '2026.08',
    status: 'available',
    capabilities: ['score', 'risk', 'evidence', 'suggestion'],
    allowed_data_scope: ['requirements', 'deliverables'],
    can_execute: true,
  },
  {
    provider_id: 'review_code_001',
    name: '隔离规则执行器',
    type: 'sandbox_code',
    version: '1.3.0',
    status: 'available',
    capabilities: ['risk', 'evidence'],
    allowed_data_scope: ['requirements', 'deliverables', 'quote_snapshot'],
    can_execute: true,
  },
]);

export const reviewRunFixture = reviewRunSchema.parse({
  review_run_id: 'review_run_001',
  project_id: 'project_001',
  project_snapshot_id: 'snapshot_001',
  provider_id: 'review_api_001',
  provider_version: '2026.08',
  deliverable_version_ids: ['dv_biz_001', 'dv_tech_001', 'dv_quote_001'],
  status: 'succeeded',
  raw_response_hash: 'c'.repeat(64),
  findings: [
    {
      finding_id: 'finding_001',
      rule_id: 'rule_001',
      rule_version: '2.1',
      outcome: 'risk',
      score: null,
      confidence: 0.91,
      message: '项目经理业绩证明材料不足',
      suggestion: '补充合同首页、签字页及验收证明',
      evidence_refs: [
        {
          source_type: 'requirement',
          source_revision_id: 'req_rev_001',
          content_hash: 'd'.repeat(64),
          locator: { page: 31, block_id: 'block_p_31_06' },
          exact_quote: '项目经理应至少具有两个同类项目业绩',
        },
      ],
    },
  ],
  created_at: timestamp,
  finished_at: '2026-08-05T01:22:00Z',
});

export const historyQueryFixture = historyQuerySnapshotSchema.parse({
  read_only: true,
  provider_id: 'history_provider_001',
  provider_version: 'v3',
  query_snapshot_id: 'history_snapshot_001',
  source_updated_at: '2026-08-04T00:00:00Z',
  samples: [
    {
      sample_id: 'sample_001',
      material_name: '高压交联电缆',
      material_code: 'DL-YJV22-001',
      spec: 'YJV22-8.7/15kV 3x300',
      tenderer: '某省电网公司',
      region: '华东',
      win_price: '386.50',
      currency: 'CNY',
      tax_included: true,
      unit: '米',
      win_date: '2026-03-18',
      supplier: '某电缆有限公司',
      source_ref: 'external-history:sample_001',
    },
  ],
  total: 1,
  page: 1,
  size: 20,
  normalization_warnings: [],
});

export const calculatedQuoteFixture = calculatedQuoteSchema.parse({
  calc_id: 'calc_001',
  project_snapshot_id: 'snapshot_001',
  algorithm_version: 'quote-engine@2.0.0',
  created_at: timestamp,
  status: 'calculated',
  sample_snapshot_id: 'history_snapshot_001',
  confidence_interval: { min: '372.00', max: '401.00' },
  normalized_input: { currency: 'CNY', tax_included: true, unit: '米' },
  excluded_sample_count: 1,
  strategies: [
    {
      strategy_id: 'strategy_win_001',
      strategy: 'win',
      suggested_price: '377.20',
      score: '98.50',
      gross_margin: '0.0810',
      risk_level: 'medium',
      basis: ['历史样本中位数', '最低毛利约束'],
    },
    {
      strategy_id: 'strategy_balance_001',
      strategy: 'balance',
      suggested_price: '386.50',
      score: '96.00',
      gross_margin: '0.1035',
      risk_level: 'low',
      basis: ['评分与毛利平衡'],
    },
    {
      strategy_id: 'strategy_profit_001',
      strategy: 'profit',
      suggested_price: '399.00',
      score: '91.20',
      gross_margin: '0.1310',
      risk_level: 'medium',
      basis: ['评分下限', '利润最大化'],
    },
  ],
});

export const insufficientQuoteFixture = quoteInsufficientDataSchema.parse({
  calc_id: 'calc_insufficient_001',
  project_snapshot_id: 'snapshot_001',
  algorithm_version: 'quote-engine@2.0.0',
  created_at: timestamp,
  status: 'insufficient_data',
  observed_sample_count: 2,
  required_sample_count: 5,
  message: '可靠样本不足，请补充历史数据或人工核价',
});
