export type BackendTokenPair = {
  access_token: string;
  refresh_token: string;
};

const ACCESS_TOKEN_KEY = 'bidvolt.access-token';
const REFRESH_TOKEN_KEY = 'bidvolt.refresh-token';
const ENTERPRISE_NAME_KEY = 'bidvolt.enterprise-name';
export const BACKEND_SESSION_EXPIRED_EVENT = 'bidvolt:backend-session-expired';

function allStores() {
  return [window.localStorage, window.sessionStorage];
}

function preferredStore(remember: boolean) {
  return remember ? window.localStorage : window.sessionStorage;
}

export function clearBackendSession() {
  for (const store of allStores()) {
    store.removeItem(ACCESS_TOKEN_KEY);
    store.removeItem(REFRESH_TOKEN_KEY);
    store.removeItem(ENTERPRISE_NAME_KEY);
  }
}

export function expireBackendSession() {
  clearBackendSession();
  window.dispatchEvent(new Event(BACKEND_SESSION_EXPIRED_EVENT));
}

function matchingStore(expected: { accessToken: string; refreshToken: string }) {
  const localMatches = window.localStorage.getItem(ACCESS_TOKEN_KEY) === expected.accessToken
    && window.localStorage.getItem(REFRESH_TOKEN_KEY) === expected.refreshToken;
  if (localMatches) return window.localStorage;

  const sessionMatches = window.sessionStorage.getItem(ACCESS_TOKEN_KEY) === expected.accessToken
    && window.sessionStorage.getItem(REFRESH_TOKEN_KEY) === expected.refreshToken;
  return sessionMatches ? window.sessionStorage : null;
}

export function expireBackendSessionIfCurrent(expected: {
  accessToken: string;
  refreshToken: string;
}) {
  if (!matchingStore(expected)) return false;
  expireBackendSession();
  return true;
}

export function saveBackendSession(
  tokens: BackendTokenPair,
  options: { enterpriseName?: string; remember: boolean },
) {
  clearBackendSession();
  const store = preferredStore(options.remember);
  store.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  store.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  if (options.enterpriseName) {
    store.setItem(ENTERPRISE_NAME_KEY, options.enterpriseName);
  }
}

export function replaceBackendSessionTokens(
  tokens: BackendTokenPair,
  expected: { accessToken: string; refreshToken: string },
) {
  const store = matchingStore(expected);
  if (!store) return false;

  const enterpriseName = store.getItem(ENTERPRISE_NAME_KEY);
  clearBackendSession();
  store.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  store.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  if (enterpriseName) store.setItem(ENTERPRISE_NAME_KEY, enterpriseName);
  return true;
}

function readFromStores(key: string) {
  for (const store of allStores()) {
    const value = store.getItem(key);
    if (value) return value;
  }
  return null;
}

export function getBackendAccessToken() {
  return readFromStores(ACCESS_TOKEN_KEY);
}

export function getBackendRefreshToken() {
  return readFromStores(REFRESH_TOKEN_KEY);
}

export function getRememberedEnterpriseName() {
  return readFromStores(ENTERPRISE_NAME_KEY);
}
