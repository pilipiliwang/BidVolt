import { describe, expect, it } from 'vitest';

import type {
  BackendTask,
  EnterpriseAsset,
  EnterpriseAssetDetail,
  EnterpriseAssetRevision,
  ProjectResponse,
} from './types';
import {
  adaptBackendEnterpriseAsset,
  adaptBackendFile,
  adaptBackendProject,
  adaptBackendQuoteCalculation,
  adaptBackendRequirement,
  adaptBackendReviewRun,
  adaptBackendSnapshots,
  adaptBackendTaskEvent,
} from './adapters';

describe('backend DTO adapters', () => {
  it('adapts a project without inventing unavailable aggregate data', () => {
    const project: ProjectResponse = {
      project_id: 18,
      name: '海上平台电气设备采购项目',
      tender_no: null,
      deadline: null,
      status: 2,
      note: null,
      updated_at: '2026-08-14T00:00:00Z',
    };

    expect(adaptBackendProject(project)).toEqual({
      id: '18',
      code: '项目-18',
      title: '海上平台电气设备采购项目',
      buyer: '招标人待补充',
      stage: '方案编制',
      progress: 45,
      deadline: '截止时间待补充',
      materialCount: 0,
      riskCount: 0,
      updatedAt: '2026-08-14T00:00:00Z',
    });
  });

  it('maps backend file status and infers a UI material category only from its labels', () => {
    expect(adaptBackendFile({
      file_id: 9,
      name: '附件 3：技术规范书.docx',
      size: 42,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 3,
      category: null,
    })).toMatchObject({
      id: '9',
      kind: 'technical_specification',
      parseStatus: 'parsed',
      parseProgress: 100,
      revisionNo: 1,
      uploadedAt: '上传时间未提供',
    });
  });

  it('keeps fact_id as the mutation key for enterprise fact correction', () => {
    const asset: EnterpriseAsset = {
      asset_id: 5,
      name: '营业执照.pdf',
      asset_type: '证照',
      category_id: 1,
      status: 2,
      source_file_id: 7,
    };
    const detail: EnterpriseAssetDetail = {
      ...asset,
      facts: [{
        fact_id: 81,
        fact_key: 'credit_code',
        fact_value: { value: '91310000ABC' },
        confidence: 0.94,
        status: 1,
      }],
    };
    const revisions: EnterpriseAssetRevision[] = [{
      revision_id: 12,
      revision_no: 1,
      file_id: 7,
      sha256: 'a'.repeat(64),
      source_location: null,
      created_by: 3,
      created_at: '2026-08-14T01:00:00Z',
    }];

    const result = adaptBackendEnterpriseAsset(
      { asset, detail, revisions },
      [{ category_id: 1, name: '证照', parent_id: null }],
    );

    expect(result).toMatchObject({ category: 'license', status: 'needs_review' });
    expect(result.facts[0]).toMatchObject({
      id: '81',
      key: '81',
      label: '统一社会信用代码',
      value: '91310000ABC',
      needsReview: true,
    });
    expect(result.revisions[0]).toMatchObject({ isCurrent: true, createdBy: '用户 #3' });
  });

  it('adapts requirement coordinates but marks confirmation as unavailable', () => {
    expect(adaptBackendRequirement({
      req_id: 3,
      req_type: 'score_rule',
      req_key: null,
      content: '技术参数满分 20 分',
      structured: { title: '技术参数响应' },
      coordinates: [{ page_no: 12, block_index: 4 }],
      confidence: 0.87,
      revision: 2,
      source_file_id: 9,
    }, { fileNamesById: { '9': '招标文件.pdf' } })).toEqual({
      id: '3',
      type: 'score_rule',
      title: '技术参数响应',
      content: '技术参数满分 20 分',
      confidence: 0.87,
      confirmationStatus: 'needs_confirmation',
      revisionNo: 2,
      coordinate: {
        fileName: '招标文件.pdf',
        fileRevisionNo: 0,
        pageNo: 12,
        blockIndex: 4,
      },
    });
  });

  it('preserves backend task public progress in the existing drawer event contract', () => {
    const task: BackendTask = {
      task_id: 21,
      task_type: 'bid_generate',
      status: 2,
      retry_count: 0,
      created_at: '2026-08-14T02:00:00Z',
      progress: {
        phase: 'bid_generate',
        status: 'running',
        percent: 42,
        current_work: '正在生成技术标',
      },
    };

    expect(adaptBackendTaskEvent(task, { projectId: '18', sequence: 4 })).toEqual({
      schema_version: '1',
      event_id: '21-4',
      sequence: 4,
      task_id: '21',
      project_id: '18',
      phase: 'bid_generate',
      status: 'running',
      percent: 42,
      public_message: '正在生成技术标',
      error_code: null,
      occurred_at: '2026-08-14T02:00:00Z',
    });
  });

  it('marks only the first backend snapshot as current', () => {
    expect(adaptBackendSnapshots([
      {
        snapshot_id: 2,
        snapshot_type: 'review',
        created_at: '2026-08-14T03:00:00Z',
        input_refs: { materials: [1, 2], requirement_revision_no: 3 },
        rules_version: {},
      },
      {
        snapshot_id: 1,
        snapshot_type: 'review',
        created_at: '2026-08-13T03:00:00Z',
        input_refs: {},
        rules_version: {},
      },
    ])).toMatchObject([
      { id: '2', isCurrent: true, materialRevisionCount: 2, requirementRevisionNo: 3 },
      { id: '1', isCurrent: false },
    ]);
  });

  it('hides unverified backend review evidence instead of rendering internal evidence fields', () => {
    const view = adaptBackendReviewRun({
      run_id: 7,
      status: 2,
      snapshot_id: 6,
      provider: {
        provider_id: 2,
        provider_code: 'external_api',
        provider_type: 'api',
        provider_version: 'v1',
        name: '外部评审',
        enabled: true,
      },
      score: {
        score_id: 2,
        total_score: 66.7,
        missing_count: 1,
        improvable: 10,
        detail: { items_count: 1 },
      },
      items: [{
        item_id: 99,
        category: '完整性',
        problem_description: '缺少技术标',
        got: 0,
        full: 10,
        improvable: 10,
        risk_level: '2',
        suggestion: '请生成技术标',
        suggestion_override: null,
        effective_suggestion: '请生成技术标',
        action_type: 'edit_deliverable',
        evidence: { exact_quote: '不应直接展示', source_version_id: 3 },
        status: 1,
        confidence: 0.91,
        ruleset_version: 'builtin-code-1.0',
      }],
    });

    expect(view.status).toBe('succeeded');
    expect(view.validatedSummary).toMatchObject({
      totalFindingCount: 1,
      categoryCounts: [{ key: '完整性', label: '完整性', count: 1 }],
      currentScore: 66.7,
      predictedScore: 76.7,
      totalLift: 10,
    });
    expect(view.validatedSummary?.sectionLifts).toBeUndefined();
    expect(view.findings[0]).toMatchObject({
      category: '完整性',
      currentScore: 0,
      fullScore: 10,
      improvableScore: 10,
      riskLevel: 'high',
      confidence: 0.91,
      ruleVersion: 'builtin-code-1.0',
    });
    expect(view.findings[0].evidence).toEqual({
      sourceLabel: '成果版本 #3',
      locator: '证据未通过前端冻结快照校验，定位内容已隐藏',
      verification: 'hidden_unverified',
    });
  });

  it('uses deterministic quote result/strategy fields without AI-derived values', () => {
    expect(adaptBackendQuoteCalculation({
      calc_id: 8,
      result: { suggested: 119.4, engine_version: '1.0.0' },
      snapshot_refs: [101, 102],
      strategy_results: {
        balance: {
          strategy: 'balance',
          suggested_price: 119.4,
          score: 88.06,
          gross_margin: 0.16,
          risk_level: 'medium',
        },
      },
    })).toMatchObject({
      id: '8',
      status: 'calculated',
      algorithmVersion: '1.0.0',
      sampleSnapshotId: '101,102',
      strategies: [{
        id: 'balance',
        amount: '119.4',
        predictedScore: '88.06',
        grossMargin: '0.16',
        recommended: true,
      }],
    });
  });
});
