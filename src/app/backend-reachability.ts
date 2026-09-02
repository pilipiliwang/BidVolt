export type BackendReachabilityEvent = {
  status: 'started' | 'succeeded' | 'expected-empty' | 'failed' | 'cancelled';
  failureKind?: 'network' | 'response' | null;
};

export type BackendConnectivityNotice = {
  level: 'disconnected' | 'partial';
  text: string;
};

export type BackendReachabilityState = {
  consecutiveNetworkFailures: number;
  hasReachableResponse: boolean;
  notice: BackendConnectivityNotice | null;
};

export const initialBackendReachabilityState: BackendReachabilityState = {
  consecutiveNetworkFailures: 0,
  hasReachableResponse: false,
  notice: null,
};

const DISCONNECTED_AFTER_NETWORK_FAILURES = 3;

/**
 * Derives user-facing connectivity from request outcomes. HTTP errors still
 * prove that the backend is reachable; only transport failures affect the
 * connectivity notice. A later reachable response clears stale warnings.
 */
export function reduceBackendReachability(
  state: BackendReachabilityState,
  event: BackendReachabilityEvent,
): BackendReachabilityState {
  const reachedBackend = event.status === 'succeeded'
    || event.status === 'expected-empty'
    || (event.status === 'failed' && event.failureKind === 'response');

  if (reachedBackend) {
    if (state.hasReachableResponse
      && state.consecutiveNetworkFailures === 0
      && state.notice === null) return state;
    return {
      consecutiveNetworkFailures: 0,
      hasReachableResponse: true,
      notice: null,
    };
  }

  if (event.status !== 'failed' || event.failureKind !== 'network') return state;

  const consecutiveNetworkFailures = state.consecutiveNetworkFailures + 1;
  const level = !state.hasReachableResponse
    || consecutiveNetworkFailures >= DISCONNECTED_AFTER_NETWORK_FAILURES
    ? 'disconnected'
    : 'partial';
  return {
    ...state,
    consecutiveNetworkFailures,
    notice: {
      level,
      text: level === 'partial'
        ? '部分接口请求失败，后端服务仍可访问，请稍后重试当前操作。'
        : '暂时无法连接后端服务，系统将在后续请求成功后自动恢复。',
    },
  };
}
