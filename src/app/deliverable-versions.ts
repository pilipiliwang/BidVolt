import type { DeliverableRouteId } from './router';
import type {
  Deliverable,
  DeliverableVersion,
} from '../shared/backend-api';

export const DELIVERABLE_VERSION_REQUEST_CONCURRENCY = 3;

export type DeliverableVersionsById = Record<string, DeliverableVersion[]>;

export type DeliverableVersionOption = {
  deliverableId: DeliverableRouteId;
  title: string;
  versionId: string;
  isCurrent?: boolean;
};

export type TaskDeliverableEditorTarget = {
  deliverableId: DeliverableRouteId;
  versionId: string;
};

export type DeliverableTaskIdentity = {
  occurred_at?: string | null;
  task_id?: number | string | null;
};

export type CurrentDeliverableVersionMatchInput = {
  currentVersion?: Pick<DeliverableVersion, 'created_at' | 'source_task_id' | 'version_no'> | null;
  currentVersionNo?: number | null;
  task?: DeliverableTaskIdentity | null;
};

const routeIdByDeliverableType: Partial<Record<number, DeliverableRouteId>> = {
  1: 'business',
  2: 'technical',
  3: 'quote',
};

function positiveInteger(value: number | undefined) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function normalizedId(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

/**
 * Resolves an editor route only when a persisted backend version explicitly
 * identifies the task that created it. This intentionally does not fall back
 * to current_version_no: doing so could send a newly started task to an older
 * project's result while the new version is still being generated.
 */
export function findTaskDeliverableEditorTarget(
  deliverables: readonly Deliverable[],
  versionsById: DeliverableVersionsById,
  taskId: number | string | null | undefined,
): TaskDeliverableEditorTarget | null {
  const normalizedTaskId = normalizedId(taskId);
  if (normalizedTaskId === null) return null;

  for (const deliverable of deliverables) {
    const deliverableId = routeIdByDeliverableType[deliverable.deliverable_type];
    if (!deliverableId) continue;
    const version = [...(versionsById[String(deliverable.deliverable_id)] ?? [])]
      .filter((candidate) => (
        positiveInteger(candidate.version_no) !== undefined
        && normalizedId(candidate.source_task_id) === normalizedTaskId
      ))
      .sort((left, right) => right.version_no - left.version_no)[0];
    if (!version) continue;
    return { deliverableId, versionId: String(version.version_no) };
  }
  return null;
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tells whether the currently advertised deliverable version was produced by
 * the latest generation task. Explicit source-task metadata is authoritative;
 * timestamps are used only when that relation is absent. Older backends that
 * expose neither field retain the historical current_version_no behaviour.
 */
export function isCurrentDeliverableVersionFromTask({
  currentVersion,
  currentVersionNo,
  task,
}: CurrentDeliverableVersionMatchInput): boolean {
  const advertisedVersionNo = positiveInteger(currentVersionNo ?? undefined);
  if (!advertisedVersionNo) return false;
  if (currentVersion && currentVersion.version_no !== advertisedVersionNo) return false;

  // Without a latest-task context there is nothing to disambiguate: preserve
  // the legacy behaviour and expose the backend-advertised current version.
  if (!task) return true;

  const sourceTaskId = normalizedId(currentVersion?.source_task_id);
  const taskId = normalizedId(task.task_id);
  if (sourceTaskId !== null) return taskId !== null && sourceTaskId === taskId;

  const versionCreatedAt = timestamp(currentVersion?.created_at);
  const taskOccurredAt = timestamp(task.occurred_at);
  if (versionCreatedAt !== null || taskOccurredAt !== null) {
    return versionCreatedAt !== null
      && taskOccurredAt !== null
      && versionCreatedAt >= taskOccurredAt;
  }

  // A latest task does exist, so an untraceable version must not be presented
  // as that task's output. The caller can keep waiting for version metadata.
  return false;
}

/**
 * Loads the backend version list for every deliverable without allowing a large
 * project to create an unbounded request burst. A failed child request is
 * represented by an empty list; callers can still expose the independently
 * reported current_version_no without inventing historical versions.
 */
export async function loadDeliverableVersionLists(
  deliverables: readonly Deliverable[],
  listVersions: (deliverableId: Deliverable['deliverable_id']) => Promise<DeliverableVersion[]>,
  concurrency = DELIVERABLE_VERSION_REQUEST_CONCURRENCY,
): Promise<DeliverableVersionsById> {
  const versionsById = Object.fromEntries(
    deliverables.map((deliverable) => [String(deliverable.deliverable_id), []]),
  ) as DeliverableVersionsById;
  if (deliverables.length === 0) return versionsById;

  const workerCount = Math.min(
    deliverables.length,
    Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1,
  );
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < deliverables.length) {
      const index = nextIndex;
      nextIndex += 1;
      const deliverable = deliverables[index];
      try {
        versionsById[String(deliverable.deliverable_id)] = [
          ...await listVersions(deliverable.deliverable_id),
        ];
      } catch {
        versionsById[String(deliverable.deliverable_id)] = [];
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return versionsById;
}

/** Builds truthful, editor-ready options from version-list responses. */
export function buildProjectOverviewVersionOptions(
  deliverables: readonly Deliverable[],
  versionsById: DeliverableVersionsById,
): DeliverableVersionOption[] {
  return deliverables.flatMap((deliverable) => {
    const deliverableId = routeIdByDeliverableType[deliverable.deliverable_type];
    if (!deliverableId) return [];

    const currentVersionNo = positiveInteger(deliverable.current_version_no);
    const versionNumbers = new Set<number>();
    for (const version of versionsById[String(deliverable.deliverable_id)] ?? []) {
      const versionNo = positiveInteger(version.version_no);
      if (versionNo !== undefined) versionNumbers.add(versionNo);
    }
    if (currentVersionNo !== undefined) versionNumbers.add(currentVersionNo);

    return [...versionNumbers]
      .sort((left, right) => right - left)
      .map((versionNo) => ({
        deliverableId,
        title: deliverable.title,
        versionId: String(versionNo),
        ...(versionNo === currentVersionNo ? { isCurrent: true } : {}),
      }));
  });
}
