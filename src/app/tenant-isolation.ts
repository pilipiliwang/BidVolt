export type TenantGenerationGuard = {
  capture: () => number;
  commit: (generation: number, callback: () => void) => boolean;
  invalidate: () => number;
  isCurrent: (generation: number) => boolean;
};

export function createTenantGenerationGuard(initialGeneration = 0): TenantGenerationGuard {
  let currentGeneration = initialGeneration;

  return {
    capture: () => currentGeneration,
    commit(generation, callback) {
      if (generation !== currentGeneration) return false;
      callback();
      return true;
    },
    invalidate() {
      currentGeneration += 1;
      return currentGeneration;
    },
    isCurrent: (generation) => generation === currentGeneration,
  };
}

export function createEmptyTenantDomainState() {
  return {
    editor: null,
    enterpriseAssets: [],
    enterpriseIngestions: [],
    history: { records: [], samples: [], total: 0 },
    loadingProjectId: null,
    projectData: {},
    projects: [],
    projectsTotal: 0,
    reviewProviders: [],
    snapshotDetail: null,
    statusMessage: null,
    taskDrawerProjectId: null,
  };
}
