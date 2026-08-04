export class ProjectScopeMismatchError extends Error {
  readonly code = 'PROJECT_SCOPE_MISMATCH';

  constructor() {
    super('Project scope mismatch. The response was discarded.');
    this.name = 'ProjectScopeMismatchError';
  }
}

export function assertProjectScope(expectedProjectId: string, responseProjectId: string): void {
  if (expectedProjectId !== responseProjectId) {
    throw new ProjectScopeMismatchError();
  }
}

export class ProjectSnapshotScopeMismatchError extends Error {
  readonly code = 'PROJECT_SNAPSHOT_SCOPE_MISMATCH';

  constructor() {
    super('Project snapshot scope mismatch. The response was discarded.');
    this.name = 'ProjectSnapshotScopeMismatchError';
  }
}

export function assertProjectSnapshotScope(
  expectedProjectSnapshotId: string,
  responseProjectSnapshotId: string,
): void {
  if (expectedProjectSnapshotId !== responseProjectSnapshotId) {
    throw new ProjectSnapshotScopeMismatchError();
  }
}
