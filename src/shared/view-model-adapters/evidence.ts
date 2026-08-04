import type { EvidenceRef } from '../api/schema';

type EvidenceSourceType = EvidenceRef['source_type'];

const evidenceSourceLabels = {
  enterprise_asset: '企业资料',
  project_material: '本项目材料',
  requirement: '需求条目',
  deliverable: '成果版本',
  search: '检索结果',
} satisfies Record<EvidenceSourceType, string>;

export function evidenceSourceLabel(evidence: EvidenceRef): string {
  return evidenceSourceLabels[evidence.source_type];
}

export function evidenceLocator(evidence: EvidenceRef): string {
  const parts: string[] = [];
  if (evidence.locator.page !== undefined) parts.push(`第 ${evidence.locator.page} 页`);
  if (evidence.locator.cell_range !== undefined) parts.push(`单元格 ${evidence.locator.cell_range}`);
  return parts.join(' · ') || '未提供定位信息';
}
