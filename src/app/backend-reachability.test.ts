import { describe, expect, it } from 'vitest';

import {
  initialBackendReachabilityState,
  reduceBackendReachability,
} from './backend-reachability';

describe('reduceBackendReachability', () => {
  it('reports an initial transport failure as disconnected', () => {
    const state = reduceBackendReachability(initialBackendReachabilityState, {
      failureKind: 'network',
      status: 'failed',
    });

    expect(state.notice?.level).toBe('disconnected');
    expect(state.consecutiveNetworkFailures).toBe(1);
  });

  it('reports a transport failure after a response as partial', () => {
    const reachable = reduceBackendReachability(initialBackendReachabilityState, {
      status: 'succeeded',
    });
    const state = reduceBackendReachability(reachable, {
      failureKind: 'network',
      status: 'failed',
    });

    expect(state.notice?.level).toBe('partial');
  });

  it('escalates repeated transport failures to disconnected', () => {
    const reachable = reduceBackendReachability(initialBackendReachabilityState, {
      status: 'succeeded',
    });
    const first = reduceBackendReachability(reachable, {
      failureKind: 'network',
      status: 'failed',
    });
    const second = reduceBackendReachability(first, {
      failureKind: 'network',
      status: 'failed',
    });
    const third = reduceBackendReachability(second, {
      failureKind: 'network',
      status: 'failed',
    });

    expect(second.notice?.level).toBe('partial');
    expect(third.notice?.level).toBe('disconnected');
  });

  it('clears a stale transport warning after the backend responds', () => {
    const failed = reduceBackendReachability(initialBackendReachabilityState, {
      failureKind: 'network',
      status: 'failed',
    });
    const recovered = reduceBackendReachability(failed, { status: 'succeeded' });

    expect(recovered).toEqual({
      consecutiveNetworkFailures: 0,
      hasReachableResponse: true,
      notice: null,
    });
  });

  it('treats an HTTP error as reachable and ignores cancellation', () => {
    const cancelled = reduceBackendReachability(initialBackendReachabilityState, {
      status: 'cancelled',
    });
    expect(cancelled).toBe(initialBackendReachabilityState);

    const responseFailure = reduceBackendReachability(initialBackendReachabilityState, {
      failureKind: 'response',
      status: 'failed',
    });
    expect(responseFailure.hasReachableResponse).toBe(true);
    expect(responseFailure.notice).toBeNull();
  });
});
