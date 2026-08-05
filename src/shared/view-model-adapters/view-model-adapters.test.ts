import { describe, expect, it } from 'vitest';

import {
  enterpriseAssetRevisionSchema,
  enterpriseAssetSchema,
} from '../api/enterprise-assets';
import { projectMaterialSchema, requirementSchema } from '../api/project-materials';
import { calculatedQuoteSchema, quoteCalculationSchema } from '../api/quotes';
import { reviewRunSchema } from '../api/review';
import { adaptEnterpriseAsset } from './enterprise-assets';
import { adaptQuoteCalculation } from './pricing';
import {
  adaptProjectMaterial,
  adaptProjectRequirement,
  createProjectEvidenceIndex,
  type ProjectEvidenceIndex,
} from './project-materials';
import { adaptReviewRun } from './review';
import {
  ProjectScopeMismatchError,
  ProjectSnapshotScopeMismatchError,
} from './scope';
import { createTrustedReviewEvidenceIndex } from './trusted-review-evidence';

const hash = 'a'.repeat(64);
const createdAt = '2026-08-05T01:00:00+08:00';

const projectEvidence = {
  source_type: 'project_material' as const,
  source_revision_id: 'revision-1',
  content_hash: hash,
  locator: { page: 12, block_id: 'block-3' },
  exact_quote: '投标人应具有有效资质。',
};

describe('enterprise asset API to UI adapter', () => {
  it('maps category, expired status, facts, evidence and revisions without guessing a new domain', () => {
    const asset = enterpriseAssetSchema.parse({
      asset_id: 'asset-1',
      name: '产品检验报告',
      category: 'inspection_report',
      status: 'expired',
      current_revision_id: 'asset-revision-2',
      classification_confidence: 0.93,
      expires_at: '2026-12-31T00:00:00+08:00',
      facts: [
        {
          fact_id: 'fact-1',
          key: 'scope',
          label: '检验范围',
          value: { voltage: '10kV' },
          confidence: 0.61,
          status: 'conflict',
          evidence_refs: [
            {
              source_type: 'enterprise_asset',
              source_revision_id: 'asset-revision-2',
              content_hash: hash,
              locator: { page: 3 },
            },
          ],
        },
      ],
      created_at: createdAt,
      updated_at: createdAt,
    });
    const revisions = [
      enterpriseAssetRevisionSchema.parse({
        revision_id: 'asset-revision-1',
        version_no: 1,
        original_name: '报告-v1.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        sha256: hash,
        created_at: createdAt,
      }),
      enterpriseAssetRevisionSchema.parse({
        revision_id: 'asset-revision-2',
        version_no: 2,
        original_name: '报告-v2.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
        sha256: hash,
        created_at: createdAt,
      }),
    ];

    const view = adaptEnterpriseAsset({ asset, revisions });

    expect(view).toMatchObject({
      id: 'asset-1',
      category: 'inspection',
      status: 'needs_review',
      facts: [
        {
          value: '{"voltage":"10kV"}',
          sourceLabel: '企业资料',
          sourcePage: 3,
          needsReview: true,
        },
      ],
    });
    expect(view.revisions.map(({ revisionNo, isCurrent }) => ({ revisionNo, isCurrent }))).toEqual([
      { revisionNo: 1, isCurrent: false },
      { revisionNo: 2, isCurrent: true },
    ]);
  });
});

describe('project material and requirement API to UI adapters', () => {
  const material = projectMaterialSchema.parse({
    material_id: 'material-1',
    project_id: 'project-a',
    name: '第一次澄清文件.pdf',
    current_revision: {
      revision_id: 'revision-1',
      material_id: 'material-1',
      project_id: 'project-a',
      event_id: 'event-1',
      event_type: 'clarification',
      version_no: 2,
      original_name: '第一次澄清文件.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      sha256: hash,
      parse_status: 'needs_review',
      supersedes_revision_id: 'revision-0',
      created_at: createdAt,
    },
    created_at: createdAt,
  });

  it('maps parse state and resolves requirement evidence against the project material revision', () => {
    const requirement = requirementSchema.parse({
      requirement_id: 'requirement-1',
      project_id: 'project-a',
      revision_id: 'requirement-revision-1',
      type: 'qualification',
      content: '投标人应具有有效资质。',
      structured: { title: '投标人资质' },
      confidence: 0.76,
      status: 'needs_review',
      evidence_refs: [projectEvidence],
    });
    const index = createProjectEvidenceIndex([material], 'project-a');

    expect(adaptProjectMaterial(material, 'project-a')).toMatchObject({
      kind: 'clarification',
      revisionNo: 2,
      parseStatus: 'needs_confirmation',
      parseProgress: 100,
    });
    expect(adaptProjectRequirement(requirement, 'project-a', index)).toMatchObject({
      type: 'qualification',
      title: '投标人资质',
      confirmationStatus: 'needs_confirmation',
      revisionNo: 2,
      coordinate: {
        fileName: '第一次澄清文件.pdf',
        fileRevisionNo: 2,
        pageNo: 12,
      },
    });
  });

  it('rejects a material whose response scope differs from the requested project', () => {
    expect(() => adaptProjectMaterial(material, 'project-b')).toThrow(ProjectScopeMismatchError);
  });

  it('rejects a foreign or structurally forged project evidence index', () => {
    const projectBRequirement = requirementSchema.parse({
      requirement_id: 'requirement-b',
      project_id: 'project-b',
      revision_id: 'requirement-revision-b',
      type: 'qualification',
      content: '项目 B 的资格要求',
      structured: {},
      confidence: 0.9,
      status: 'confirmed',
      evidence_refs: [projectEvidence],
    });
    const projectAIndex = createProjectEvidenceIndex([material], 'project-a');
    const forgedIndex = {
      projectId: 'project-b',
      lookup: () => ({ fileName: 'foreign-secret.pdf', revisionNo: 9 }),
    } as unknown as ProjectEvidenceIndex;

    expect(() =>
      adaptProjectRequirement(projectBRequirement, 'project-b', projectAIndex),
    ).toThrow(ProjectScopeMismatchError);
    expect(() =>
      adaptProjectRequirement(projectBRequirement, 'project-b', forgedIndex),
    ).toThrow(ProjectScopeMismatchError);
  });
});

describe('review API to UI adapter', () => {
  const run = reviewRunSchema.parse({
    review_run_id: 'run-1',
    project_id: 'project-a',
    project_snapshot_id: 'snapshot-1',
    provider_id: 'provider-1',
    provider_version: '2.0.0',
    deliverable_version_ids: ['deliverable-version-1'],
    status: 'invalid_response',
    raw_response_hash: hash,
    findings: [
      ['pass', '通过'],
      ['fail', '未通过'],
      ['risk', '风险'],
      ['unknown', '未知'],
      ['abstain', '弃权'],
    ].map(([outcome, message], index) => ({
      finding_id: `finding-${index}`,
      rule_id: `rule-${index}`,
      rule_version: '1.0.0',
      outcome,
      score: null,
      confidence: 0.8,
      message,
      suggestion: null,
      evidence_refs: index === 0 ? [projectEvidence] : [],
    })),
    created_at: createdAt,
    finished_at: createdAt,
  });

  const trustedEvidenceIndex = createTrustedReviewEvidenceIndex({
    projectId: 'project-a',
    projectSnapshotId: 'snapshot-1',
    snapshotStatus: 'frozen',
    sources: [
      {
        sourceType: 'project_material',
        sourceRevisionId: 'revision-1',
        contentHash: hash,
        displayLabel: '第一次澄清文件.pdf',
      },
    ],
  });

  it('preserves every outcome and run status while exposing only trusted evidence', () => {
    const view = adaptReviewRun(run, 'project-a', trustedEvidenceIndex);

    expect(view.status).toBe('invalid_response');
    expect(view.findings.map((finding) => finding.outcome)).toEqual([
      'pass',
      'fail',
      'risk',
      'unknown',
      'abstain',
    ]);
    expect(view.findings[0].evidence).toMatchObject({
      sourceLabel: '第一次澄清文件.pdf',
      locator: '第 12 页',
      exactQuote: projectEvidence.exact_quote,
      verification: 'verified',
    });
    expect(view.findings[0].evidence.locator).not.toContain('block-3');
    expect(view.findings[4].suggestion).toContain('人工复核');
    expect(view.responseHash).toBeUndefined();
  });

  it('maps an explicitly validated review summary without inventing aggregate values', () => {
    const summarizedRun = reviewRunSchema.parse({
      ...run,
      status: 'succeeded',
      review_summary: {
        total_finding_count: 18,
        category_counts: [
          { category_key: 'business-bid-letter', label: '商务标-投标函', count: 4 },
        ],
        current_score: 76,
        predicted_score: 91.6,
        total_lift: 15.6,
        section_lifts: { business: 6.2, technical: 6.8, pricing: 2.6 },
      },
    });

    expect(adaptReviewRun(summarizedRun, 'project-a', trustedEvidenceIndex).validatedSummary)
      .toEqual({
        totalFindingCount: 18,
        categoryCounts: [
          { key: 'business-bid-letter', label: '商务标-投标函', count: 4 },
        ],
        currentScore: 76,
        predictedScore: 91.6,
        totalLift: 15.6,
        sectionLifts: { business: 6.2, technical: 6.8, pricing: 2.6 },
      });
  });

  it('hides unverified quotes and rejects project or frozen-snapshot scope mismatches', () => {
    const emptyIndex = createTrustedReviewEvidenceIndex({
      projectId: 'project-a',
      projectSnapshotId: 'snapshot-1',
      snapshotStatus: 'frozen',
      sources: [],
    });
    const otherSnapshotIndex = createTrustedReviewEvidenceIndex({
      projectId: 'project-a',
      projectSnapshotId: 'snapshot-other',
      snapshotStatus: 'frozen',
      sources: [],
    });
    const hidden = adaptReviewRun(run, 'project-a', emptyIndex).findings[0].evidence;

    expect(hidden).toEqual({
      sourceLabel: '未验证证据',
      locator: '证据未通过冻结快照校验，引用内容与内部定位已隐藏',
      verification: 'hidden_unverified',
    });
    expect(hidden.exactQuote).toBeUndefined();
    expect(
      adaptReviewRun({ ...run, status: 'timed_out' }, 'project-a', trustedEvidenceIndex).status,
    ).toBe('timed_out');
    expect(() => adaptReviewRun(run, 'project-b', trustedEvidenceIndex)).toThrow(
      ProjectScopeMismatchError,
    );
    expect(() => adaptReviewRun(run, 'project-a', otherSnapshotIndex)).toThrow(
      ProjectSnapshotScopeMismatchError,
    );
  });
});

describe('quote calculation API to UI adapter', () => {
  const calculation = calculatedQuoteSchema.parse({
    calc_id: 'calc-1',
    project_snapshot_id: 'snapshot-1',
    algorithm_version: 'quote-engine/1.0.0',
    created_at: createdAt,
    status: 'calculated',
    query_snapshot_id: 'query-snapshot-1',
    sample_snapshot_id: 'sample-snapshot-1',
    confidence_interval: { min: '95.00', max: '112.00' },
    normalized_input: { currency: 'CNY', tax_included: true, unit: '台' },
    excluded_sample_count: 2,
    strategies: [
      {
        strategy_id: 'strategy-win',
        strategy: 'win',
        suggested_price: '98.00',
        score: '0.92',
        gross_margin: '0.08',
        risk_level: 'medium',
        basis: ['历史中标价分位数'],
      },
      {
        strategy_id: 'strategy-balance',
        strategy: 'balance',
        suggested_price: '104.00',
        score: '0.88',
        gross_margin: '0.13',
        risk_level: 'low',
        basis: ['成本约束', '历史样本'],
      },
      {
        strategy_id: 'strategy-profit',
        strategy: 'profit',
        suggested_price: '110.00',
        score: '0.72',
        gross_margin: '0.18',
        risk_level: 'high',
        basis: ['最低利润率'],
      },
    ],
  });

  it('maps deterministic strategies and keeps insufficient-data responses price-free', () => {
    const calculatedView = adaptQuoteCalculation(calculation, 'snapshot-1');
    const insufficient = quoteCalculationSchema.parse({
      calc_id: 'calc-2',
      project_snapshot_id: 'snapshot-1',
      algorithm_version: 'quote-engine/1.0.0',
      created_at: createdAt,
      status: 'insufficient_data',
      query_snapshot_id: 'query-snapshot-insufficient',
      observed_sample_count: 1,
      required_sample_count: 5,
      message: '可用历史样本不足，无法给出报价。',
    });
    const insufficientView = adaptQuoteCalculation(insufficient, 'snapshot-1');

    expect(calculatedView).toMatchObject({
      sampleSnapshotId: 'sample-snapshot-1',
      querySnapshotId: 'query-snapshot-1',
      strategies: [
        { name: '中标优先', amount: '98.00', currency: 'CNY' },
        { name: '均衡方案', amount: '104.00', recommended: true },
        { name: '利润优先', amount: '110.00' },
      ],
    });
    expect(insufficientView).toMatchObject({
      status: 'insufficient_data',
      querySnapshotId: 'query-snapshot-insufficient',
      message: '可用历史样本不足，无法给出报价。',
      strategies: [],
    });
  });

  it('throws a safe scope error that does not echo either snapshot identifier', () => {
    let thrown: unknown;
    try {
      adaptQuoteCalculation(calculation, 'secret-snapshot-b');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProjectSnapshotScopeMismatchError);
    expect(String(thrown)).toContain('Project snapshot scope mismatch');
    expect(String(thrown)).not.toContain('snapshot-1');
    expect(String(thrown)).not.toContain('secret-snapshot-b');
  });
});
