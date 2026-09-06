import { describe, expect, it } from 'vitest';
import { scoreIsOutdated } from './score-freshness';
import type { ScoreSummary } from '../shared/backend-api/types';
const score: ScoreSummary = {
  score_id: 1, is_stale: false, deliverable_versions: { '25': 2 }, review_run_id: null,
  snapshot_id: null, total_score: 80, missing_count: 0, improvable: null,
  detail: null, scale: 'completeness', full_marks: 100, got_marks: 80,
};
describe('score freshness', () => {
  it('compares JSON string keys with actual deliverable ids', () => {
    expect(scoreIsOutdated(score, [{ deliverable_id: 25, current_version_no: 2 }])).toBe(false);
    expect(scoreIsOutdated(score, [{ deliverable_id: 25, current_version_no: 3 }])).toBe(true);
  });
  it('never treats local-only edits or an invalidated score as refreshed', () => {
    expect(scoreIsOutdated(score, [{ deliverable_id: 25, current_version_no: 2 }], 1)).toBe(true);
    expect(scoreIsOutdated(score, [{ deliverable_id: 25, current_version_no: 2 }], undefined, true)).toBe(true);
    expect(scoreIsOutdated(undefined, [], 1, true)).toBe(false);
  });
});
