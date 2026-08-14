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

const routeIdByDeliverableType: Partial<Record<number, DeliverableRouteId>> = {
  1: 'business',
  2: 'technical',
  3: 'quote',
};

function positiveInteger(value: number | undefined) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : undefined;
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
