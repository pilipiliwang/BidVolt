import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BACKEND_SESSION_EXPIRED_EVENT,
  clearBackendSession,
  expireBackendSessionIfCurrent,
  getBackendAccessToken,
  getBackendRefreshToken,
  getRememberedEnterpriseName,
  replaceBackendSessionTokens,
  saveBackendSession,
} from './backend-session';

describe('backend session storage', () => {
  beforeEach(() => clearBackendSession());

  it('keeps remembered credentials in local storage', () => {
    saveBackendSession(
      { access_token: 'access', refresh_token: 'refresh' },
      { enterpriseName: '测试电力公司', remember: true },
    );

    expect(getBackendAccessToken()).toBe('access');
    expect(getBackendRefreshToken()).toBe('refresh');
    expect(getRememberedEnterpriseName()).toBe('测试电力公司');
    expect(window.localStorage.getItem('bidvolt.access-token')).toBe('access');
    expect(window.sessionStorage.getItem('bidvolt.access-token')).toBeNull();
  });

  it('uses session storage when remember is disabled and clears both stores', () => {
    saveBackendSession(
      { access_token: 'temporary', refresh_token: 'temporary-refresh' },
      { remember: false },
    );
    expect(window.sessionStorage.getItem('bidvolt.access-token')).toBe('temporary');

    clearBackendSession();
    expect(getBackendAccessToken()).toBeNull();
    expect(getBackendRefreshToken()).toBeNull();
  });

  it('rotates tokens only when the session that started refresh is still active', () => {
    saveBackendSession(
      { access_token: 'old-access', refresh_token: 'old-refresh' },
      { enterpriseName: '测试电力公司', remember: false },
    );

    expect(replaceBackendSessionTokens(
      { access_token: 'new-access', refresh_token: 'new-refresh' },
      { accessToken: 'old-access', refreshToken: 'old-refresh' },
    )).toBe(true);
    expect(getBackendAccessToken()).toBe('new-access');
    expect(getBackendRefreshToken()).toBe('new-refresh');
    expect(getRememberedEnterpriseName()).toBe('测试电力公司');

    saveBackendSession(
      { access_token: 'other-enterprise', refresh_token: 'other-refresh' },
      { enterpriseName: '新企业', remember: true },
    );
    expect(replaceBackendSessionTokens(
      { access_token: 'stale-access', refresh_token: 'stale-refresh' },
      { accessToken: 'new-access', refreshToken: 'new-refresh' },
    )).toBe(false);
    expect(getBackendAccessToken()).toBe('other-enterprise');
  });

  it('expires and notifies only the session that received the rejected refresh', () => {
    saveBackendSession(
      { access_token: 'old-access', refresh_token: 'old-refresh' },
      { remember: true },
    );
    const expired = vi.fn();
    window.addEventListener(BACKEND_SESSION_EXPIRED_EVENT, expired);

    expect(expireBackendSessionIfCurrent({
      accessToken: 'different-access', refreshToken: 'different-refresh',
    })).toBe(false);
    expect(expired).not.toHaveBeenCalled();
    expect(getBackendAccessToken()).toBe('old-access');

    expect(expireBackendSessionIfCurrent({
      accessToken: 'old-access', refreshToken: 'old-refresh',
    })).toBe(true);
    expect(expired).toHaveBeenCalledOnce();
    expect(getBackendAccessToken()).toBeNull();

    window.removeEventListener(BACKEND_SESSION_EXPIRED_EVENT, expired);
  });
});
