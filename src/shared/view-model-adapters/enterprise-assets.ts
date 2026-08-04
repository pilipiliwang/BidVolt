import type { z } from 'zod';

import type {
  EnterpriseAsset as ApiEnterpriseAsset,
  enterpriseAssetRevisionSchema,
} from '../api/enterprise-assets';
import type {
  EnterpriseAsset as EnterpriseAssetView,
  EnterpriseAssetCategory as EnterpriseAssetCategoryView,
  EnterpriseAssetStatus as EnterpriseAssetStatusView,
  EnterpriseFact as EnterpriseFactView,
} from '../../features/enterprise-assets/types';
import { evidenceSourceLabel } from './evidence';

type ApiEnterpriseAssetCategory = ApiEnterpriseAsset['category'];
type ApiEnterpriseAssetStatus = ApiEnterpriseAsset['status'];
type ApiEnterpriseFact = ApiEnterpriseAsset['facts'][number];
type ApiEnterpriseFactStatus = ApiEnterpriseFact['status'];
export type ApiEnterpriseAssetRevision = z.infer<typeof enterpriseAssetRevisionSchema>;

const categoryMap = {
  certificate: 'license',
  qualification: 'qualification',
  performance: 'performance',
  personnel: 'personnel',
  product: 'product',
  inspection_report: 'inspection',
  finance: 'finance',
  other: 'other',
} satisfies Record<ApiEnterpriseAssetCategory, EnterpriseAssetCategoryView>;

const statusMap = {
  ingesting: 'processing',
  needs_review: 'needs_review',
  active: 'ready',
  expired: 'needs_review',
  failed: 'failed',
} satisfies Record<ApiEnterpriseAssetStatus, EnterpriseAssetStatusView>;

const factNeedsReviewMap = {
  extracted: true,
  confirmed: false,
  corrected: false,
  conflict: true,
  low_confidence: true,
} satisfies Record<ApiEnterpriseFactStatus, boolean>;

function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return '结构化数据';
  }
}

function adaptFact(fact: ApiEnterpriseFact): EnterpriseFactView {
  const evidence = fact.evidence_refs[0];

  return {
    key: fact.key,
    label: fact.label,
    value: toDisplayValue(fact.value),
    confidence: fact.confidence,
    sourceLabel: evidence ? evidenceSourceLabel(evidence) : '未提供证据',
    sourcePage: evidence?.locator.page,
    needsReview: factNeedsReviewMap[fact.status],
  };
}

export interface EnterpriseAssetAdapterInput {
  asset: ApiEnterpriseAsset;
  revisions: readonly ApiEnterpriseAssetRevision[];
}

export function adaptEnterpriseAsset({
  asset,
  revisions,
}: EnterpriseAssetAdapterInput): EnterpriseAssetView {
  return {
    id: asset.asset_id,
    name: asset.name,
    category: categoryMap[asset.category],
    classificationConfidence: asset.classification_confidence,
    status: statusMap[asset.status],
    updatedAt: asset.updated_at,
    expiresAt: asset.expires_at ?? undefined,
    facts: asset.facts.map(adaptFact),
    revisions: revisions.map((revision) => ({
      id: revision.revision_id,
      revisionNo: revision.version_no,
      createdAt: revision.created_at,
      createdBy: '系统',
      changeNote: revision.version_no === 1 ? '初次入库' : `上传新版本：${revision.original_name}`,
      isCurrent: revision.revision_id === asset.current_revision_id,
    })),
  };
}

export function adaptEnterpriseAssets(
  inputs: readonly EnterpriseAssetAdapterInput[],
): EnterpriseAssetView[] {
  return inputs.map(adaptEnterpriseAsset);
}
