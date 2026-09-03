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
  adaptBackendEnterpriseCategories,
  adaptBackendDeliverableCards,
  adaptBackendFile,
  adaptBackendHistorySamples,
  adaptBackendProjectMaterial,
  adaptBackendProjectMaterials,
  adaptBackendProject,
  adaptBackendProjectOverview,
  adaptBackendQuoteCalculation,
  adaptBackendRequirement,
  adaptBackendReviewRun,
  adaptBackendSnapshots,
  adaptBackendTaskEvent,
  adaptAgentRunTaskEvent,
} from './adapters';

describe('backend DTO adapters', () => {
  it('adapts a project without inventing unavailable aggregate data', () => {
    const project: ProjectResponse = {
      project_id: 18,
      name: '海上平台电气设备采购项目',
      tender_no: null,
      buyer: null,
      deadline: null,
      status: 2,
      note: null,
      updated_at: '2026-08-14T00:00:00Z',
      summary: null,
    };

    expect(adaptBackendProject(project)).toEqual({
      id: '18',
      code: '招标编号未提供',
      title: '海上平台电气设备采购项目',
      buyer: '招标人待补充',
      stage: '方案编制',
      deadline: '截止时间待补充',
      updatedAt: '2026-08-14T00:00:00Z',
    });
  });

  it('reads buyer and aggregate data from the dedicated backend fields', () => {
    const project: ProjectResponse = {
      project_id: 19,
      name: '海上风电项目',
      tender_no: 'HY-2026-019',
      buyer: '海洋能源建设有限公司',
      deadline: null,
      status: 1,
      note: '重点项目，优先处理',
      updated_at: '2026-08-14T00:00:00Z',
      summary: {
        material_count: 12,
        deliverable_count: 3,
        review_run_count: 2,
        latest_total_score: 91.5,
        missing_count: 4,
        risk_level: 4,
      },
    };

    expect(adaptBackendProject(project)).toMatchObject({
      buyer: '海洋能源建设有限公司',
      materialCount: 12,
      riskCount: 4,
    });
    expect(adaptBackendProject({ ...project, buyer: null }).buyer).toBe('招标人待补充');
  });

  it('preserves aggregate zero values only when a caller supplies them from an API', () => {
    const project: ProjectResponse = {
      project_id: 20,
      name: '零统计项目',
      tender_no: 'ZERO-20',
      buyer: null,
      deadline: null,
      status: 1,
      note: null,
      updated_at: '2026-08-14T00:00:00Z',
      summary: null,
    };

    expect(adaptBackendProject(project, {
      materialCount: 0,
      progress: 0,
      riskCount: 0,
    })).toMatchObject({ materialCount: 0, progress: 0, riskCount: 0 });
  });

  it('maps backend file status without inferring business category or version from its name', () => {
    const material = adaptBackendFile({
      file_id: 9,
      name: '附件 3：技术规范书.docx',
      size: 42,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 3,
      category: null,
    });
    expect(material).toMatchObject({
      id: '9',
      kind: 'other',
      parseStatus: 'parsed',
      parseProgress: 100,
      uploadedAt: '上传时间未提供',
    });
    expect(material).not.toHaveProperty('revisionNo');
    expect(material).not.toHaveProperty('purpose');
  });

  it('uses an explicit backend file category but keeps an unknown parse status neutral', () => {
    const material = adaptBackendFile({
      file_id: 10,
      name: '普通附件.docx',
      size: 42,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 99,
      category: 'technical_specification',
      document_role: 'assistant_supplement',
    });
    expect(material).toMatchObject({
      kind: 'technical_specification',
      parseStatus: 'unknown',
      purpose: 'supplemental',
    });
    expect(material).not.toHaveProperty('parseProgress');
  });

  it('maps current Chinese document roles and rich project-material fields', () => {
    const material = adaptBackendProjectMaterial({
      material_id: 3,
      file_id: 10,
      file_name: '技术规范.docx',
      ext: '.docx',
      status: 2,
      parse_status: null,
      block_count: 88,
      block_stats: { paragraph: 80, table: 8 },
      media_count: 2,
      image_count: 2,
      image_described_count: 1,
      source_archive_id: 9,
      source_archive_name: '招标文件.zip',
      archive_path: '01_招标文件/技术规范.docx',
      expanded_count: 0,
    }, {
      file_id: 10,
      name: '技术规范.docx',
      size: 42,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 3,
      category: 'technical_specification',
      document_role: '招标公告',
    });

    expect(material).toMatchObject({
      id: '10',
      name: '01_招标文件/技术规范.docx',
      kind: 'technical_specification',
      purpose: 'current_tender',
      parseStatus: 'parsed',
      parseProgress: 100,
      blocksCount: 88,
    });
  });

  it('uses the project-material status enum instead of the file parse enum', () => {
    const base = {
      material_id: 3,
      file_id: 10,
      file_name: '技术规范.docx',
      ext: '.docx',
      parse_status: null,
      block_count: 1,
      block_stats: {},
      media_count: 0,
      image_count: 0,
      image_described_count: 0,
      source_archive_id: null,
      source_archive_name: null,
      archive_path: null,
      expanded_count: 0,
    };

    expect(adaptBackendProjectMaterial({ ...base, status: 2 })).toMatchObject({
      parseStatus: 'parsed',
      parseProgress: 100,
    });
    expect(adaptBackendProjectMaterial({ ...base, status: 3 })).toMatchObject({
      parseStatus: 'needs_confirmation',
      parseProgress: 100,
    });
  });

  it('inherits a persisted document role through nested ZIP archive materials', () => {
    const material = (fileId: number, sourceArchiveId: number | null) => ({
      material_id: fileId,
      file_id: fileId,
      file_name: `file-${fileId}.docx`,
      ext: '.docx',
      status: 3,
      parse_status: null,
      block_count: 1,
      block_stats: {},
      media_count: 0,
      image_count: 0,
      image_described_count: 0,
      source_archive_id: sourceArchiveId,
      source_archive_name: null,
      archive_path: null,
      expanded_count: 0,
    });
    const adapted = adaptBackendProjectMaterials([
      material(10, null),
      material(11, 10),
      material(12, 11),
    ], {
      10: {
        file_id: 10,
        name: '补充资料.zip',
        size: 42,
        status: 3,
        document_role: 'supplemental',
      },
      11: { file_id: 11, name: '子目录.zip', size: 21, status: 3 },
      12: { file_id: 12, name: '证明材料.docx', size: 12, status: 3 },
    });

    expect(adapted.map((item) => item.purpose)).toEqual([
      'supplemental',
      'supplemental',
      'supplemental',
    ]);
  });

  it('does not turn absent deliverable and score metrics into real zero values', () => {
    const deliverables = [{
      deliverable_id: 3,
      project_id: 18,
      deliverable_type: 2,
      title: '技术标文件',
      current_version_no: 1,
      status: 1,
      stat: {},
    }];

    expect(adaptBackendDeliverableCards(deliverables)).toEqual([
      expect.objectContaining({ pages: undefined, missing: undefined }),
    ]);
    expect(adaptBackendProjectOverview(deliverables, {
      total_score: 82,
      missing_count: 0,
      improvable: null,
    })?.score).toEqual({
      business: undefined,
      technical: undefined,
      pricing: undefined,
      total: 82,
      rejectionRisks: undefined,
      missingMaterials: 0,
      estimatedLift: undefined,
    });
  });

  it('preserves zero metrics explicitly returned by the backend', () => {
    const deliverables = [{
      deliverable_id: 3,
      project_id: 18,
      deliverable_type: 2,
      title: '技术标文件',
      current_version_no: 1,
      status: 1,
      stat: { pages: 0, missing: 0 },
    }];

    expect(adaptBackendDeliverableCards(deliverables)).toEqual([
      expect.objectContaining({ pages: 0, missing: 0 }),
    ]);
    expect(adaptBackendProjectOverview(deliverables, {
      total_score: 0,
      biz_score: 0,
      tech_score: 0,
      quote_score: 0,
      reject_count: 0,
      missing_count: 0,
      improvable: 0,
    })?.score).toEqual({
      business: 0,
      technical: 0,
      pricing: 0,
      total: 0,
      rejectionRisks: 0,
      missingMaterials: 0,
      estimatedLift: 0,
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

    expect(result).toMatchObject({
      category: 'license',
      categoryId: '1',
      categoryLabel: '证照',
      sourceFileId: '7',
      status: 'needs_review',
      updatedAt: '2026-08-14',
    });
    expect(result.facts[0]).toMatchObject({
      id: '81',
      key: '81',
      label: '统一社会信用代码',
      value: '91310000ABC',
      needsReview: true,
    });
    expect(result.revisions[0]).toMatchObject({
      fileId: '7',
      isCurrent: true,
      createdBy: '用户 #3',
      createdAt: '2026-08-14',
    });
  });

  it('adapts an enterprise list item without requiring eager detail or revision requests', () => {
    const asset: EnterpriseAsset = {
      asset_id: 6,
      name: '企业资质.pdf',
      asset_type: '资质',
      category_id: 2,
      status: 1,
      source_file_id: 13,
    };

    expect(adaptBackendEnterpriseAsset(
      { asset },
      [{ category_id: 2, name: '资质', parent_id: null }],
    )).toMatchObject({
      id: '6',
      category: 'qualification',
      categoryId: '2',
      sourceFileId: '13',
      facts: [],
      revisions: [],
      status: 'processing',
      updatedAt: '—',
    });
  });

  it('prefers real asset timestamps and formats enterprise dates at day precision', () => {
    const asset: EnterpriseAsset = {
      asset_id: 7,
      name: '企业资质.pdf',
      asset_type: '资质',
      category_id: 2,
      status: 3,
      source_file_id: 14,
      created_at: '2026-09-01',
      updated_at: '2026-09-03',
    };
    const revisions: EnterpriseAssetRevision[] = [{
      revision_id: 21,
      revision_no: 1,
      file_id: 14,
      sha256: null,
      source_location: null,
      created_by: null,
      created_at: '2026-08-31',
    }];

    const result = adaptBackendEnterpriseAsset({ asset, revisions });

    expect(result.updatedAt).toBe('2026-09-03');
    expect(result.revisions[0]?.createdAt).toBe('2026-08-31');

    const zonedTimestamp = '2026-09-03T23:30:00-07:00';
    const localDate = new Date(zonedTimestamp);
    const expectedLocalDay = [
      String(localDate.getFullYear()).padStart(4, '0'),
      String(localDate.getMonth() + 1).padStart(2, '0'),
      String(localDate.getDate()).padStart(2, '0'),
    ].join('-');
    expect(adaptBackendEnterpriseAsset({
      asset: { ...asset, updated_at: zonedTimestamp },
    }).updatedAt).toBe(expectedLocalDay);
  });

  it('falls back through valid asset and revision dates without inventing a timestamp', () => {
    const baseAsset: EnterpriseAsset = {
      asset_id: 8,
      name: '企业资质.pdf',
      asset_type: '资质',
      category_id: 2,
      status: 3,
      source_file_id: 15,
      updated_at: '2026-02-30T10:00:00+08:00',
      created_at: '2026-09-02',
    };
    const revision: EnterpriseAssetRevision = {
      revision_id: 22,
      revision_no: 1,
      file_id: 15,
      sha256: null,
      source_location: null,
      created_by: null,
      created_at: 'not-a-date',
    };

    expect(adaptBackendEnterpriseAsset({ asset: baseAsset, revisions: [revision] })).toMatchObject({
      updatedAt: '2026-09-02',
      revisions: [{ createdAt: '—' }],
    });

    expect(adaptBackendEnterpriseAsset({
      asset: { ...baseAsset, created_at: null, updated_at: 'invalid-timezone+99:00' },
      revisions: [{ ...revision, revision_no: 2, created_at: '2026-09-01' }],
    })).toMatchObject({ updatedAt: '2026-09-01' });

    expect(adaptBackendEnterpriseAsset({
      asset: { ...baseAsset, created_at: null, updated_at: null },
      revisions: [{ ...revision, created_at: null }],
    })).toMatchObject({
      updatedAt: '—',
      revisions: [{ createdAt: '—' }],
    });
  });

  it('keeps backend enterprise category ids, labels, and hierarchy without mock folders', () => {
    expect(adaptBackendEnterpriseCategories([
      { category_id: 10, name: ' 企业证照 ', parent_id: null },
      { category_id: 11, name: '安全许可证', parent_id: 10 },
      { category_id: 11, name: '重复分类不会覆盖', parent_id: null },
    ])).toEqual([
      { id: '10', label: '企业证照', parentId: null },
      { id: '11', label: '安全许可证', parentId: '10' },
    ]);
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
      confirmationStatus: 'unavailable',
      revisionNo: 2,
      coordinate: {
        fileName: '招标文件.pdf',
        fileRevisionNo: undefined,
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
      task_type: 'bid_generate',
      project_id: '18',
      phase: 'bid_generate',
      status: 'running',
      percent: 42,
      public_message: '正在生成技术标',
      error_code: null,
      occurred_at: '2026-08-14T02:00:00Z',
    });
  });

  it('does not expose a backend deliverable without a positive saved version as V0', () => {
    expect(adaptBackendDeliverableCards([{
      deliverable_id: 3,
      project_id: 18,
      deliverable_type: 2,
      title: '技术标文件',
      current_version_no: 0,
      stat: {},
    }])).toEqual([
      expect.objectContaining({ versionId: undefined }),
    ]);
  });

  it('keeps a backend queued task while using a neutral message when no message was returned', () => {
    expect(adaptBackendTaskEvent({
      task_id: 22,
      task_type: 'bid_review',
      status: 1,
      retry_count: 0,
      progress: {},
    }, { projectId: '18' })).toMatchObject({
      status: 'queued',
      public_message: '后端未提供任务进度说明',
      occurred_at: '时间未提供',
    });
  });

  it('does not turn an unknown backend task status into queued or invent failure metadata', () => {
    expect(adaptBackendTaskEvent({
      task_id: 24,
      task_type: 'bid_generate',
      status: 99,
      retry_count: 0,
      progress: {},
      error: { code: 'WORKER_UNAVAILABLE' },
    }, { projectId: '18' })).toMatchObject({
      status: 'unknown',
      error_code: 'WORKER_UNAVAILABLE',
      public_message: '后端未提供任务进度说明',
      occurred_at: '时间未提供',
    });
  });

  it('preserves a backend task that is waiting for user input', () => {
    expect(adaptBackendTaskEvent({
      task_id: 23,
      task_type: 'bid_generate',
      status: 2,
      retry_count: 0,
      progress: { status: 'waiting_user', current_work: '请确认缺失材料' },
    }, { projectId: '18' })).toMatchObject({
      status: 'waiting_user',
      task_type: 'bid_generate',
      public_message: '请确认缺失材料',
    });
  });

  it('treats agent pipeline status 4 as a terminal failure, not a retrying legacy task', () => {
    expect(adaptAgentRunTaskEvent({
      task_id: 40,
      task_type: 'agent_pipeline',
      status: 4,
      progress: { phase: 'agent_pipeline', percent: 80, status: 'retrying' },
      result: {},
      error: { code: 'AGENT_EXITED' },
      customer: { asks: [], action_list: [] },
    }, { projectId: '18' })).toMatchObject({
      status: 'failed',
      task_type: 'agent_pipeline',
      error_code: 'AGENT_EXITED',
    });
  });

  it('does not call the first backend snapshot current without an explicit marker', () => {
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
      { id: '2', materialRevisionCount: 2, requirementRevisionNo: 3 },
      { id: '1' },
    ]);
    expect(adaptBackendSnapshots([{
      snapshot_id: 3,
      snapshot_type: 'review',
      created_at: null,
      input_refs: {},
      rules_version: {},
    }])[0]).not.toHaveProperty('materialRevisionCount');
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
      predictedScore: undefined,
      totalLift: 10,
    });
    expect(view.validatedSummary?.sectionLifts).toBeUndefined();
    expect(view.findings[0]).toMatchObject({
      category: '完整性',
      currentScore: 0,
      fullScore: 10,
      improvableScore: 10,
      riskLevel: 'high',
      status: 'pending_confirm',
      actionType: 'edit_deliverable',
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
        recommended: false,
      }],
    });
  });

  it('preserves backend history material identifiers and region for page filtering', () => {
    expect(adaptBackendHistorySamples([{
      sample_id: 33,
      material_ref: 'CABLE-YJV-3x95',
      material_code: 'MAT-0095',
      material_name: '电力电缆',
      spec: '3x95',
      region: '华东',
      win_price: '118.00',
      win_date: '2026-08-01',
      provider_id: 'external-history',
      source_hash: 'abc',
    }])).toEqual([expect.objectContaining({
      id: '33',
      materialRef: 'CABLE-YJV-3x95',
      materialCode: 'MAT-0095',
      region: '华东',
      sourceHash: 'abc',
      taxIncluded: undefined,
      usable: false,
      excludedReason: '税口径未提供，不能直接用于测算',
    })]);
  });

  it('adapts real history-library rows that use package/publish/source fields', () => {
    expect(adaptBackendHistorySamples([{
      source: 'public',
      publisher: '某省电网公司',
      category: '电缆',
      package_name: 'YJV 电力电缆',
      price_mode: '金额',
      win_price: '118.5',
      limit_price: '125',
      publish_date: '2026-08-20',
      notice_id: 'NOTICE-1',
      limit_evidence: '招标公告最高限价 125 万元',
      win_evidence: '中标公告金额 118.5 万元',
      limit_evidence_url: 'https://example.com/limit',
      win_evidence_url: 'https://example.com/win',
      win_ratio: '0.948',
    }])).toEqual([expect.objectContaining({
      id: 'NOTICE-1',
      materialRef: '电缆',
      materialName: 'YJV 电力电缆',
      region: '某省电网公司',
      publisher: '某省电网公司',
      category: '电缆',
      packageName: 'YJV 电力电缆',
      priceMode: '金额',
      limitPrice: '125',
      winRatio: '0.948',
      noticeId: 'NOTICE-1',
      scope: 'public',
      limitEvidence: '招标公告最高限价 125 万元',
      winEvidence: '中标公告金额 118.5 万元',
      limitEvidenceUrl: 'https://example.com/limit',
      winEvidenceUrl: 'https://example.com/win',
      occurredAt: '2026-08-20',
      sourceLabel: '公共历史中标价行情库',
      usable: true,
    })]);
  });

  it('preserves quote status and does not synthesize confidence ranges or recommendations', () => {
    const view = adaptBackendQuoteCalculation({
      calc_id: 9,
      status: 2,
      result: { suggested: 210, engine_version: '1.0.0' },
      strategy_results: {
        win: { strategy: 'win', suggested_price: 210 },
      },
    });

    expect(view.status).toBe('applied');
    expect(view.strategies[0]).toMatchObject({
      recommended: false,
      confidenceLow: undefined,
      confidenceHigh: undefined,
    });
  });
});
