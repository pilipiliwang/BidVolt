import type { EvidenceRef } from '../api/schema';
import {
  assertProjectScope,
  assertProjectSnapshotScope,
  ProjectScopeMismatchError,
} from './scope';

export interface FrozenSnapshotEvidenceSource {
  sourceType: EvidenceRef['source_type'];
  sourceRevisionId: string;
  contentHash: string;
  displayLabel?: string;
}

export interface FrozenSnapshotEvidenceInput {
  projectId: string;
  projectSnapshotId: string;
  snapshotStatus: 'frozen';
  sources: readonly FrozenSnapshotEvidenceSource[];
}

const trustedReviewEvidenceIndexBrand: unique symbol = Symbol('TrustedReviewEvidenceIndex');

export interface TrustedReviewEvidenceIndex {
  readonly projectId: string;
  readonly projectSnapshotId: string;
  readonly [trustedReviewEvidenceIndexBrand]: true;
  lookup(evidence: EvidenceRef): FrozenSnapshotEvidenceSource | undefined;
}

export class UntrustedReviewEvidenceIndexError extends Error {
  readonly code = 'UNTRUSTED_REVIEW_EVIDENCE_INDEX';

  constructor() {
    super('The review evidence index is not derived from a frozen project snapshot.');
    this.name = 'UntrustedReviewEvidenceIndexError';
  }
}

const evidenceKey = (
  sourceType: EvidenceRef['source_type'],
  sourceRevisionId: string,
  contentHash: string,
) => JSON.stringify([sourceType, sourceRevisionId, contentHash.toLowerCase()]);

export function createTrustedReviewEvidenceIndex(
  input: FrozenSnapshotEvidenceInput,
): TrustedReviewEvidenceIndex {
  if (
    input.snapshotStatus !== 'frozen' ||
    input.projectId.length === 0 ||
    input.projectSnapshotId.length === 0
  ) {
    throw new UntrustedReviewEvidenceIndexError();
  }

  const sources = new Map<string, FrozenSnapshotEvidenceSource>();
  for (const source of input.sources) {
    if (
      source.sourceRevisionId.length === 0 ||
      !/^[a-f0-9]{64}$/i.test(source.contentHash)
    ) {
      throw new UntrustedReviewEvidenceIndexError();
    }
    sources.set(
      evidenceKey(source.sourceType, source.sourceRevisionId, source.contentHash),
      Object.freeze({ ...source }),
    );
  }

  return Object.freeze({
    projectId: input.projectId,
    projectSnapshotId: input.projectSnapshotId,
    [trustedReviewEvidenceIndexBrand]: true as const,
    lookup: (evidence: EvidenceRef) =>
      sources.get(
        evidenceKey(evidence.source_type, evidence.source_revision_id, evidence.content_hash),
      ),
  });
}

export function assertTrustedReviewEvidenceIndexScope(
  index: TrustedReviewEvidenceIndex,
  expectedProjectId: string,
  expectedProjectSnapshotId: string,
): void {
  if (index[trustedReviewEvidenceIndexBrand] !== true) {
    throw new ProjectScopeMismatchError();
  }
  assertProjectScope(expectedProjectId, index.projectId);
  assertProjectSnapshotScope(expectedProjectSnapshotId, index.projectSnapshotId);
}
