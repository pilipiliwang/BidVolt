import { describe, expect, it, vi } from 'vitest';

import type { Deliverable, DeliverableVersion } from '../shared/backend-api';
import {
  buildProjectOverviewVersionOptions,
  isCurrentDeliverableVersionFromTask,
  loadDeliverableVersionLists,
} from './deliverable-versions';

const deliverables: Deliverable[] = [
  {
    deliverable_id: 11,
    deliverable_type: 1,
    title: '商务标',
    current_version_no: 2,
  },
  {
    deliverable_id: 12,
    deliverable_type: 2,
    title: '技术标',
    current_version_no: 6,
  },
  {
    deliverable_id: 13,
    deliverable_type: 3,
    title: '报价单',
    current_version_no: 1,
  },
];

const version = (versionNo: number): DeliverableVersion => ({
  version_no: versionNo,
  version_type: 1,
  milestone: false,
  created_by: null,
  source_task_id: null,
  created_at: null,
});

describe('deliverable version data', () => {
  it('uses source_task_id as the authoritative latest-task match', () => {
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: { ...version(2), source_task_id: 901, created_at: '2026-09-03T09:00:00Z' },
      currentVersionNo: 2,
      task: { task_id: '901', occurred_at: '2026-09-03T10:00:00Z' },
    })).toBe(true);
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: { ...version(2), source_task_id: 900, created_at: '2026-09-03T12:00:00Z' },
      currentVersionNo: 2,
      task: { task_id: 901, occurred_at: '2026-09-03T10:00:00Z' },
    })).toBe(false);
  });

  it('falls back to creation time only when source task metadata is absent', () => {
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: { ...version(2), created_at: '2026-09-03T10:00:01Z' },
      currentVersionNo: 2,
      task: { task_id: 901, occurred_at: '2026-09-03T10:00:00Z' },
    })).toBe(true);
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: { ...version(2), created_at: '2026-09-03T09:59:59Z' },
      currentVersionNo: 2,
      task: { task_id: 901, occurred_at: '2026-09-03T10:00:00Z' },
    })).toBe(false);
  });

  it('does not treat metadata-free versions as the latest task output', () => {
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: version(2),
      currentVersionNo: 2,
      task: { task_id: 901 },
    })).toBe(false);
    expect(isCurrentDeliverableVersionFromTask({
      currentVersionNo: 2,
      task: { task_id: 901 },
    })).toBe(false);
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: { ...version(2), created_at: 'invalid-date' },
      currentVersionNo: 2,
      task: { task_id: 901, occurred_at: '2026-09-03T10:00:00Z' },
    })).toBe(false);
  });

  it('keeps current_version_no compatibility when there is no latest task context', () => {
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: version(2),
      currentVersionNo: 2,
      task: null,
    })).toBe(true);
    expect(isCurrentDeliverableVersionFromTask({ currentVersionNo: 2 })).toBe(true);
  });

  it('rejects missing current versions and a non-current version record', () => {
    expect(isCurrentDeliverableVersionFromTask({
      currentVersion: version(1),
      currentVersionNo: 2,
      task: { task_id: 901 },
    })).toBe(false);
    expect(isCurrentDeliverableVersionFromTask({ currentVersionNo: 0, task: { task_id: 901 } })).toBe(false);
    expect(isCurrentDeliverableVersionFromTask({ currentVersionNo: 2, task: null })).toBe(true);
  });

  it('loads every list with bounded concurrency and keeps results keyed by backend id', async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const listVersions = vi.fn(async (deliverableId: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return [version(deliverableId)];
    });

    const request = loadDeliverableVersionLists(deliverables, listVersions, 2);
    await vi.waitFor(() => expect(listVersions).toHaveBeenCalledTimes(2));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(listVersions).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => release());

    await expect(request).resolves.toEqual({
      11: [version(11)],
      12: [version(12)],
      13: [version(13)],
    });
    expect(maxActive).toBe(2);
  });

  it('isolates a failed child request instead of rejecting the project load', async () => {
    const result = await loadDeliverableVersionLists(
      deliverables.slice(0, 2),
      async (deliverableId) => {
        if (deliverableId === 12) throw new Error('version endpoint unavailable');
        return [version(1), version(2)];
      },
    );

    expect(result).toEqual({
      11: [version(1), version(2)],
      12: [],
    });
  });

  it('uses only the real current version as fallback when history is unavailable', () => {
    expect(buildProjectOverviewVersionOptions([deliverables[1]], { 12: [] })).toEqual([
      {
        deliverableId: 'technical',
        title: '技术标',
        versionId: '6',
        isCurrent: true,
      },
    ]);
  });

  it('sorts backend versions newest first, deduplicates current, and keeps historical versions read-only', () => {
    expect(buildProjectOverviewVersionOptions([deliverables[0]], {
      11: [version(1), version(2), version(2), version(4)],
    })).toEqual([
      { deliverableId: 'business', title: '商务标', versionId: '4' },
      { deliverableId: 'business', title: '商务标', versionId: '2', isCurrent: true },
      { deliverableId: 'business', title: '商务标', versionId: '1' },
    ]);
  });

  it('does not create options for unsupported deliverable types or invalid version numbers', () => {
    expect(buildProjectOverviewVersionOptions([
      { deliverable_id: 20, deliverable_type: 9, title: '未知成果', current_version_no: 3 },
      { deliverable_id: 21, deliverable_type: 2, title: '空成果', current_version_no: 0 },
    ], {
      20: [version(3)],
      21: [version(0), version(-1)],
    })).toEqual([]);
  });
});
