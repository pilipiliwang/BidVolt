import type { ProjectOverviewView, ProjectDeliverableView } from '../../domains/projects/ProjectOverviewPage';
import type { ProjectSummary, ProjectStage } from '../../domains/projects/project-view-model';
import type { HistoryPriceSample, QuoteCalculationView, QuoteStrategy } from '../../domains/pricing/types';
import type { ReviewProvider as ReviewProviderView, ReviewRunView } from '../../domains/review/types';
import type { EnterpriseAsset as EnterpriseAssetView, EnterpriseAssetCategory } from '../../features/enterprise-assets/types';
import type {
  ProjectMaterial as ProjectMaterialView,
  ProjectMaterialKind,
  ProjectRequirement as ProjectRequirementView,
  ProjectSnapshot as ProjectSnapshotView,
  RequirementType,
} from '../../features/project-materials/types';
import type { PublicTaskEvent } from '../task-events';
import type {
  BackendFile,
  BackendTask,
  Deliverable,
  EnterpriseAsset,
  EnterpriseAssetDetail,
  EnterpriseAssetRevision,
  EnterpriseCategory,
  JsonObject,
  JsonValue,
  ProjectResponse,
  Requirement,
  ReviewItem,
  ReviewProvider,
  ReviewRunDetail,
  SnapshotSummary,
} from './types';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const displayJson = (value: JsonValue): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return '';
  const record = asRecord(value);
  if (record) {
    const direct = asString(record.value) ?? asString(record.label) ?? asString(record.name);
    if (direct) return direct;
  }
  return JSON.stringify(value);
};

const projectStageByStatus: Record<number, ProjectStage> = {
  1: '材料解析',
  2: '方案编制',
  3: '内部评审',
  4: '待提交',
  9: '待提交',
};

const projectProgressByStatus: Record<number, number> = { 1: 10, 2: 45, 3: 75, 4: 100, 9: 100 };

export type ProjectAdapterStats = {
  buyer?: string;
  materialCount?: number;
  riskCount?: number;
};

const buyerFromProjectNote = (note: string | null): string | undefined => {
  const match = note?.match(/^\s*招标人[：:]\s*([^\r\n]+?)\s*(?:[\r\n]|$)/);
  return match?.[1]?.trim() || undefined;
};

/**
 * Buyer is encoded in note with an explicit `招标人：` prefix until the backend exposes
 * a dedicated field. Unrecognised notes stay neutral instead of being presented as buyer data.
 */
export function adaptBackendProject(
  project: ProjectResponse,
  stats: ProjectAdapterStats = {},
): ProjectSummary {
  return {
    id: String(project.project_id),
    code: project.tender_no?.trim() || `项目-${project.project_id}`,
    title: project.name,
    buyer: stats.buyer?.trim() || buyerFromProjectNote(project.note) || '招标人待补充',
    stage: projectStageByStatus[project.status] ?? '材料解析',
    progress: projectProgressByStatus[project.status] ?? 0,
    deadline: project.deadline ?? '截止时间待补充',
    materialCount: stats.materialCount ?? 0,
    riskCount: stats.riskCount ?? 0,
    updatedAt: project.updated_at,
  };
}

export function adaptBackendProjects(
  projects: readonly ProjectResponse[],
  statsByProjectId: Readonly<Record<string, ProjectAdapterStats>> = {},
): ProjectSummary[] {
  return projects.map((project) =>
    adaptBackendProject(project, statsByProjectId[String(project.project_id)]),
  );
}

const materialKindFromFile = (file: BackendFile): ProjectMaterialKind => {
  const label = `${file.category ?? ''} ${file.name}`.toLocaleLowerCase();
  if (/澄清|补遗/.test(label)) return 'clarification';
  if (/报价|工程量清单/.test(label)) return 'quote_template';
  if (/评标|评审|评分/.test(label)) return 'scoring_rules';
  if (/技术规范|技术要求/.test(label)) return 'technical_specification';
  if (/招标公告|公告/.test(label)) return 'tender_notice';
  if (/招标文件|招标书/.test(label)) return 'tender_document';
  if (/图纸|图册/.test(label)) return 'drawing';
  return 'other';
};

const parseState = (status: number): Pick<ProjectMaterialView, 'parseProgress' | 'parseStatus'> => {
  if (status === 2) return { parseStatus: 'parsing' };
  if (status === 3) return { parseProgress: 100, parseStatus: 'parsed' };
  if (status === 4) return { parseStatus: 'failed' };
  return { parseStatus: 'queued' };
};

export function adaptBackendFile(file: BackendFile): ProjectMaterialView {
  return {
    id: String(file.file_id),
    name: file.name,
    kind: materialKindFromFile(file),
    revisionNo: 1,
    ...parseState(file.status),
    // FileObject list currently omits timestamps and material revision metadata.
    uploadedAt: '上传时间未提供',
  };
}

export const adaptBackendFiles = (files: readonly BackendFile[]): ProjectMaterialView[] =>
  files.map(adaptBackendFile);

const categoryAliases: Record<string, EnterpriseAssetCategory> = {
  '证照': 'license',
  license: 'license',
  certificate: 'license',
  '资质': 'qualification',
  qualification: 'qualification',
  '业绩': 'performance',
  performance: 'performance',
  '人员': 'personnel',
  personnel: 'personnel',
  '产品参数': 'product',
  product: 'product',
  '检测报告': 'inspection',
  inspection: 'inspection',
  inspection_report: 'inspection',
  '财务': 'finance',
  finance: 'finance',
  '其他': 'other',
  other: 'other',
};

const factLabelAliases: Record<string, string> = {
  company_name: '企业名称',
  credit_code: '统一社会信用代码',
  legal_representative: '法定代表人',
  qualification: '资质信息',
  performance: '业绩信息',
  personnel: '人员信息',
  test_report: '检测报告',
  product_param: '产品参数',
};

export type BackendEnterpriseAssetBundle = {
  asset: EnterpriseAsset;
  detail?: EnterpriseAssetDetail;
  revisions?: readonly EnterpriseAssetRevision[];
};

const assetCategory = (
  asset: EnterpriseAsset,
  categories: ReadonlyMap<number, EnterpriseCategory>,
): EnterpriseAssetCategory => {
  const categoryName = asset.category_id === null ? undefined : categories.get(asset.category_id)?.name;
  return categoryAliases[categoryName ?? ''] ?? categoryAliases[asset.asset_type ?? ''] ?? 'other';
};

export function adaptBackendEnterpriseAsset(
  bundle: BackendEnterpriseAssetBundle,
  categories: readonly EnterpriseCategory[] = [],
): EnterpriseAssetView {
  const categoryIndex = new Map(categories.map((category) => [category.category_id, category]));
  const facts = bundle.detail?.facts ?? [];
  const revisions = bundle.revisions ?? [];
  const latestRevisionNo = Math.max(0, ...revisions.map((revision) => revision.revision_no));
  const latestCreatedAt = revisions.find((revision) => revision.revision_no === latestRevisionNo)?.created_at;

  return {
    id: String(bundle.asset.asset_id),
    name: bundle.asset.name,
    category: assetCategory(bundle.asset, categoryIndex),
    // Fact extraction confidence is not asset classification confidence.
    classificationConfidence: undefined,
    status:
      bundle.asset.status === 3
        ? 'ready'
        : bundle.asset.status === 2
          ? 'needs_review'
          : bundle.asset.status === 4
            ? 'failed'
            : 'processing',
    updatedAt: latestCreatedAt ?? '更新时间未提供',
    facts: facts.map((fact) => ({
      // Backend correction is addressed by fact_id; retain it as the UI mutation key.
      key: String(fact.fact_id),
      id: String(fact.fact_id),
      label: factLabelAliases[fact.fact_key] ?? fact.fact_key,
      value: displayJson(fact.fact_value),
      confidence: fact.confidence ?? undefined,
      sourceLabel: bundle.asset.name,
      needsReview: fact.status === 1,
    })),
    revisions: revisions.map((revision) => ({
      id: String(revision.revision_id),
      revisionNo: revision.revision_no,
      createdAt: revision.created_at ?? '创建时间未提供',
      createdBy: revision.created_by === null ? '系统' : `用户 #${revision.created_by}`,
      changeNote: revision.revision_no === 1 ? '初次入库' : '企业资料版本更新',
      isCurrent: revision.revision_no === latestRevisionNo,
    })),
  };
}

export function adaptBackendEnterpriseAssets(
  bundles: readonly BackendEnterpriseAssetBundle[],
  categories: readonly EnterpriseCategory[] = [],
): EnterpriseAssetView[] {
  return bundles.map((bundle) => adaptBackendEnterpriseAsset(bundle, categories));
}

const requirementTypeAliases: Record<string, RequirementType> = {
  basic_info: 'basic_info',
  qualification: 'qualification',
  score_rule: 'score_rule',
  reject_clause: 'reject_clause',
  tech_requirement: 'tech_requirement',
  quote_rule: 'quote_rule',
  material_checklist: 'material_checklist',
  attachment: 'attachment',
};

const requirementLabels: Record<RequirementType, string> = {
  basic_info: '基本信息',
  qualification: '资格要求',
  score_rule: '评分规则',
  reject_clause: '否决条款',
  tech_requirement: '技术要求',
  quote_rule: '报价规则',
  material_checklist: '材料清单',
  attachment: '附件要求',
};

type RequirementAdapterOptions = {
  fileNamesById?: Readonly<Record<string, string>>;
};

const firstCoordinate = (coordinates: JsonValue | null): Record<string, unknown> | undefined => {
  if (Array.isArray(coordinates)) return asRecord(coordinates[0]);
  return asRecord(coordinates);
};

export function adaptBackendRequirement(
  requirement: Requirement,
  options: RequirementAdapterOptions = {},
): ProjectRequirementView {
  const type = requirementTypeAliases[requirement.req_type] ?? 'attachment';
  const structured = asRecord(requirement.structured);
  const coordinate = firstCoordinate(requirement.coordinates);
  const sourceFileId =
    requirement.source_file_id ?? asNumber(coordinate?.file_id) ?? asNumber(coordinate?.source_file_id);
  const fileName = sourceFileId === undefined || sourceFileId === null
    ? '来源文件未提供'
    : options.fileNamesById?.[String(sourceFileId)] ?? `文件 #${sourceFileId}`;

  return {
    id: String(requirement.req_id),
    type,
    title:
      requirement.req_key?.trim() ||
      asString(structured?.title) ||
      requirementLabels[type],
    content: requirement.content,
    confidence: requirement.confidence ?? undefined,
    // Backend has no confirmation state or confirmation mutation endpoint.
    confirmationStatus: 'needs_confirmation',
    revisionNo: requirement.revision,
    coordinate: {
      fileName,
      fileRevisionNo: asNumber(coordinate?.file_revision_no),
      pageNo: asNumber(coordinate?.page_no) ?? asNumber(coordinate?.page),
      blockIndex: asNumber(coordinate?.block_index),
    },
  };
}

export const adaptBackendRequirements = (
  requirements: readonly Requirement[],
  options: RequirementAdapterOptions = {},
): ProjectRequirementView[] =>
  requirements.map((requirement) => adaptBackendRequirement(requirement, options));

const collectionSize = (value: unknown): number => {
  if (Array.isArray(value)) return value.length;
  const record = asRecord(value);
  return record ? Object.keys(record).length : 0;
};

export function adaptBackendSnapshots(snapshots: readonly SnapshotSummary[]): ProjectSnapshotView[] {
  return snapshots.map((snapshot) => {
    const inputRefs = asRecord(snapshot.input_refs) ?? {};
    const materialRefs =
      inputRefs.materials ?? inputRefs.material_ids ?? inputRefs.project_materials;
    const requirementRefs = inputRefs.requirements ?? inputRefs.requirement_revisions;
    return {
      id: String(snapshot.snapshot_id),
      label: `${snapshot.snapshot_type || '项目'}快照 #${snapshot.snapshot_id}`,
      createdAt: snapshot.created_at ?? '创建时间未提供',
      materialRevisionCount: collectionSize(materialRefs),
      requirementRevisionNo:
        asNumber(inputRefs.requirement_revision_no) ?? collectionSize(requirementRefs),
      isCurrent: false,
    };
  });
}

const taskStatus = (task: BackendTask): PublicTaskEvent['status'] => {
  const progressStatus = asString(task.progress.status)?.toLocaleLowerCase();
  if (progressStatus === 'done' || progressStatus === 'succeeded') return 'succeeded';
  if (progressStatus === 'retrying') return 'retrying';
  if (progressStatus === 'cancel_requested') return 'cancel_requested';
  if (progressStatus === 'cancelled') return 'cancelled';
  if (progressStatus === 'failed') return 'failed';
  if (progressStatus === 'running') return 'running';
  const statusMap: Record<number, PublicTaskEvent['status']> = {
    1: 'queued', 2: 'running', 3: 'succeeded', 4: 'retrying', 5: 'cancelled', 6: 'failed',
  };
  return statusMap[task.status] ?? 'queued';
};

export type TaskEventAdapterOptions = {
  projectId: string;
  sequence?: number;
  occurredAt?: string;
};

export function adaptBackendTaskEvent(
  task: BackendTask,
  { projectId, sequence = 0, occurredAt }: TaskEventAdapterOptions,
): PublicTaskEvent {
  const status = taskStatus(task);
  const message =
    asString(task.progress.current_work) ??
    asString(task.progress.summary) ??
    asString(task.progress.hint) ??
    (status === 'succeeded' ? '任务已完成' : status === 'failed' ? '任务执行失败' : '任务已提交');
  const percent = asNumber(task.progress.percent);
  return {
    schema_version: '1',
    event_id: `${task.task_id}-${sequence}`,
    sequence,
    task_id: String(task.task_id),
    project_id: projectId,
    phase: asString(task.progress.phase) ?? task.task_type,
    status,
    percent: percent === undefined ? null : Math.max(0, Math.min(100, Math.round(percent))),
    public_message: message,
    error_code: status === 'failed' ? 'BACKEND_TASK_FAILED' : null,
    occurred_at: occurredAt ?? task.created_at ?? new Date().toISOString(),
  };
}

const deliverableRouteByType: Record<number, ProjectDeliverableView['id']> = {
  1: 'business',
  2: 'technical',
  3: 'quote',
};

const deliverableToneByType: Record<number, ProjectDeliverableView['tone']> = {
  1: 'business',
  2: 'technical',
  3: 'quote',
};

export function adaptBackendDeliverableCards(
  deliverables: readonly Deliverable[],
): ProjectDeliverableView[] {
  return deliverables.flatMap((deliverable) => {
    const id = deliverableRouteByType[deliverable.deliverable_type];
    if (!id) return [];
    const stat = asRecord(deliverable.stat) ?? {};
    return [{
      id,
      title: deliverable.title,
      pages: asNumber(stat.pages) ?? asNumber(stat.page_count),
      words: asString(stat.words) ?? String(asNumber(stat.word_count) ?? '—'),
      score: asString(stat.score) ?? '待评审',
      lift: asString(stat.lift) ?? '—',
      missing: asNumber(stat.missing) ?? asNumber(stat.missing_count),
      tone: deliverableToneByType[deliverable.deliverable_type],
      versionId: deliverable.current_version_no === undefined
        ? undefined
        : String(deliverable.current_version_no),
    }];
  });
}

export type BackendScoreSummary = {
  total_score: number | null;
  biz_score?: number | null;
  tech_score?: number | null;
  quote_score?: number | null;
  reject_count?: number;
  missing_count: number;
  improvable: number | null;
};

export function scoreSummaryForOverview(
  score: {
    total_score: number | null;
    missing_count: number;
    improvable: number | null;
    detail?: JsonObject | null;
  },
): BackendScoreSummary {
  const detail = asRecord(score.detail) ?? {};
  return {
    total_score: score.total_score,
    biz_score: asNumber(detail.biz_score) ?? asNumber(detail.business),
    tech_score: asNumber(detail.tech_score) ?? asNumber(detail.technical),
    quote_score: asNumber(detail.quote_score) ?? asNumber(detail.pricing),
    reject_count: asNumber(detail.reject_count) ?? asNumber(detail.rejection_risks),
    missing_count: score.missing_count,
    improvable: score.improvable,
  };
}

/** Returns undefined instead of inventing a score when the backend has not evaluated the project. */
export function adaptBackendProjectOverview(
  deliverables: readonly Deliverable[],
  score: BackendScoreSummary | null | undefined,
): ProjectOverviewView | undefined {
  if (!score || score.total_score === null) return undefined;
  return {
    deliverables: adaptBackendDeliverableCards(deliverables),
    score: {
      business: score.biz_score ?? undefined,
      technical: score.tech_score ?? undefined,
      pricing: score.quote_score ?? undefined,
      total: score.total_score,
      rejectionRisks: score.reject_count,
      missingMaterials: score.missing_count,
      estimatedLift: score.improvable ?? undefined,
    },
  };
}

const providerType = (type: string): ReviewProviderView['type'] => {
  if (type === 'code' || type === 'sandbox_code') return 'sandbox_code';
  if (type === 'document' || type === 'document_rule') return 'document_rule';
  if (type === 'rule' || type === 'rule_engine') return 'rule_engine';
  return 'api';
};

export function adaptBackendReviewProvider(provider: ReviewProvider): ReviewProviderView {
  return {
    id: String(provider.provider_id),
    name: provider.name,
    type: providerType(provider.provider_type),
    version: provider.provider_version,
    description: provider.provider_code,
    available: provider.enabled,
  };
}

export const adaptBackendReviewProviders = (
  providers: readonly ReviewProvider[],
): ReviewProviderView[] => providers.map(adaptBackendReviewProvider);

const findingOutcome = (item: ReviewItem): ReviewRunView['findings'][number]['outcome'] => {
  if (item.got !== null && item.full !== null && item.got >= item.full) return 'pass';
  const risk = asNumber(item.risk_level);
  if (risk !== undefined && risk >= 2) return 'fail';
  if ((item.improvable ?? 0) > 0) return 'risk';
  return 'unknown';
};

const backendFinding = (
  item: ReviewItem,
  providerVersion: string | undefined,
): ReviewRunView['findings'][number] => {
  const evidence = asRecord(item.evidence);
  const sourceVersion = evidence?.source_version_id;
  const risk = asNumber(item.risk_level);
  return {
    id: String(item.item_id),
    category: item.category,
    title: item.problem_description,
    outcome: findingOutcome(item),
    ruleVersion: item.ruleset_version || providerVersion || '规则版本未提供',
    confidence: item.confidence ?? undefined,
    currentScore: item.got ?? undefined,
    fullScore: item.full ?? undefined,
    improvableScore: item.improvable ?? undefined,
    riskLevel: risk === undefined ? undefined : risk >= 2 ? 'high' : risk >= 1 ? 'medium' : 'low',
    suggestion: item.effective_suggestion ?? item.suggestion ?? '请人工复核该评审项',
    evidence: evidence
      ? {
          sourceLabel: sourceVersion === null || sourceVersion === undefined
            ? '后端评审证据'
            : `成果版本 #${String(sourceVersion)}`,
          locator: '证据未通过前端冻结快照校验，定位内容已隐藏',
          verification: 'hidden_unverified',
        }
      : {
          sourceLabel: '未提供证据',
          locator: '没有可展示的证据引用',
          verification: 'missing',
        },
  };
};

export function adaptBackendReviewRun(run: ReviewRunDetail): ReviewRunView {
  const statusMap: Record<number, ReviewRunView['status']> = {
    1: 'running',
    2: 'succeeded',
    3: 'failed',
  };
  const score = asRecord(run.score);
  const detail = asRecord(score?.detail);
  const currentScore = asNumber(score?.total_score);
  const totalLift = asNumber(score?.improvable);
  const categoryCounts = [...new Set(run.items.map((item) => item.category).filter(Boolean))]
    .map((category) => ({
      key: category,
      label: category,
      count: run.items.filter((item) => item.category === category).length,
    }));
  const sectionLifts = {
    business: asNumber(detail?.biz_improvable) ?? asNumber(detail?.business_lift),
    technical: asNumber(detail?.tech_improvable) ?? asNumber(detail?.technical_lift),
    pricing: asNumber(detail?.quote_improvable) ?? asNumber(detail?.pricing_lift),
  };
  const hasSectionLift = Object.values(sectionLifts).some((value) => value !== undefined);
  return {
    id: String(run.run_id),
    status: statusMap[run.status] ?? 'idle',
    projectSnapshotId: run.snapshot_id === null ? '' : String(run.snapshot_id),
    deliverableVersions: [],
    providerId: run.provider ? String(run.provider.provider_id) : undefined,
    providerVersion: run.provider?.provider_version,
    findings: run.items.map((item) => backendFinding(item, run.provider?.provider_version)),
    validatedSummary: currentScore === undefined || totalLift === undefined
      ? undefined
      : {
          totalFindingCount: run.items.length,
          categoryCounts,
          currentScore,
          predictedScore: undefined,
          totalLift,
          sectionLifts: hasSectionLift ? sectionLifts : undefined,
        },
  };
}

export type BackendHistorySample = {
  sample_id?: number | string;
  material_ref?: string;
  material_name: string;
  material_code?: string | null;
  spec?: string | null;
  region?: string | null;
  win_price: number | string;
  currency?: string;
  tax_included?: boolean;
  win_date: string;
  provider_id?: string;
  source_hash?: string;
};

export function adaptBackendHistorySamples(
  samples: readonly BackendHistorySample[],
  snapshotIds: readonly (number | string)[] = [],
): HistoryPriceSample[] {
  return samples.map((sample, index) => ({
    id: String(sample.sample_id ?? snapshotIds[index] ?? `${sample.material_ref ?? 'sample'}-${index}`),
    materialRef: sample.material_ref,
    materialName: sample.material_name,
    materialCode: sample.material_code ?? sample.material_ref,
    specification: sample.spec ?? '规格未提供',
    region: sample.region ?? undefined,
    price: String(sample.win_price),
    currency: sample.currency ?? 'CNY',
    taxIncluded: sample.tax_included,
    occurredAt: sample.win_date,
    sourceLabel: sample.provider_id ?? '外部历史报价库',
    sourceHash: sample.source_hash,
    usable: sample.tax_included !== undefined,
    excludedReason: sample.tax_included === undefined ? '税口径未提供，不能直接用于测算' : undefined,
  }));
}

export type BackendQuoteStrategyResult = {
  strategy: 'win' | 'balance' | 'profit';
  suggested_price: number | string;
  score?: number | string | null;
  gross_margin?: number | string | null;
  risk_level?: 'low' | 'medium' | 'high';
  recommended?: boolean;
};

export type BackendQuoteCalculation = {
  calc_id: number | string;
  result?: JsonObject | null;
  strategy_results?: Partial<Record<'win' | 'balance' | 'profit', BackendQuoteStrategyResult>>;
  snapshot_refs?: readonly (number | string)[];
  samples?: readonly BackendHistorySample[];
  status?: number;
};

const strategyLabels = {
  win: ['中标优先', '优先提高价格竞争力'],
  balance: ['均衡方案', '在价格竞争力与利润之间平衡'],
  profit: ['利润优先', '在业务约束内优先保障利润'],
} as const;

const adaptQuoteStrategy = (
  strategy: BackendQuoteStrategyResult,
  confidence: { low?: string; high?: string },
  recommendedStrategy?: string,
): QuoteStrategy => ({
  id: strategy.strategy,
  name: strategyLabels[strategy.strategy][0],
  description: strategyLabels[strategy.strategy][1],
  amount: String(strategy.suggested_price),
  currency: 'CNY',
  confidenceLow: confidence.low,
  confidenceHigh: confidence.high,
  predictedScore: strategy.score === null || strategy.score === undefined ? undefined : String(strategy.score),
  grossMargin: strategy.gross_margin === null || strategy.gross_margin === undefined
    ? undefined
    : String(strategy.gross_margin),
  riskLevel: strategy.risk_level,
  recommended: strategy.recommended === true || recommendedStrategy === strategy.strategy,
});

export function adaptBackendQuoteCalculation(
  calculation: BackendQuoteCalculation,
): QuoteCalculationView {
  const result = asRecord(calculation.result);
  if (!result) {
    return {
      id: String(calculation.calc_id),
      status: 'needs_input',
      algorithmVersion: '算法版本未提供',
      sampleSnapshotId: '',
      querySnapshotId: String(calculation.calc_id),
      message: '后端尚未返回可用的测算结果',
      strategies: [],
    };
  }
  const confidence = {
    low: asNumber(result.confidence_low)?.toString(),
    high: asNumber(result.confidence_high)?.toString(),
  };
  const strategies = Object.values(calculation.strategy_results ?? {}).filter(
    (strategy): strategy is BackendQuoteStrategyResult => strategy !== undefined,
  );
  return {
    id: String(calculation.calc_id),
    status: calculation.status === 2 ? 'applied' : calculation.status === 3 ? 'abandoned' : 'calculated',
    algorithmVersion: asString(result.engine_version) ?? '算法版本未提供',
    sampleSnapshotId: (calculation.snapshot_refs ?? []).map(String).join(','),
    querySnapshotId: String(calculation.calc_id),
    strategies: strategies.map((strategy) => adaptQuoteStrategy(
      strategy,
      confidence,
      asString(result.recommended_strategy),
    )),
  };
}
