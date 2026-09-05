const WORKFLOW_MODE_KEY_PREFIX = 'bidvolt:project-workflow-mode:';

export function rememberGenerateWorkflow(projectId: string) {
  try {
    window.localStorage.setItem(`${WORKFLOW_MODE_KEY_PREFIX}${projectId}`, 'generate');
  } catch {
    // The route query remains the fallback when browser storage is unavailable.
  }
}

export function clearRememberedGenerateWorkflow(projectId: string) {
  try {
    window.localStorage.removeItem(`${WORKFLOW_MODE_KEY_PREFIX}${projectId}`);
  } catch {
    // A stale preference is harmless when browser storage is unavailable.
  }
}

export function hasRememberedGenerateWorkflow(projectId: string) {
  try {
    return window.localStorage.getItem(`${WORKFLOW_MODE_KEY_PREFIX}${projectId}`) === 'generate';
  } catch {
    return false;
  }
}
