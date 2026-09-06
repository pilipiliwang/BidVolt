import type { Deliverable, ScoreSummary } from '../shared/backend-api/types';

export function scoreIsOutdated(
  score: ScoreSummary | undefined,
  deliverables: readonly Pick<Deliverable, 'deliverable_id' | 'current_version_no'>[],
  invalidatedScoreId?: number,
  localOfficeChanges = false,
) {
  if (!score) return false;
  if (score.is_stale || localOfficeChanges || score.score_id === invalidatedScoreId) return true;
  const versions = score.deliverable_versions;
  if (!versions || Object.keys(versions).length === 0) return false;
  const current = new Map(deliverables.map(d => [String(d.deliverable_id), d.current_version_no]));
  return Object.entries(versions).some(([id, version]) => current.get(id) !== version);
}

export const deliverableVersionSignature = (items: readonly Pick<Deliverable, 'deliverable_id' | 'current_version_no'>[]) =>
  items.map(item => `${item.deliverable_id}:${item.current_version_no}`).sort().join('|');
