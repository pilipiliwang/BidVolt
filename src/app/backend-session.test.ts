import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearBackendSession,
  getBackendAccessToken,
  getBackendRefreshToken,
  getRememberedEnterpriseName,
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
});
