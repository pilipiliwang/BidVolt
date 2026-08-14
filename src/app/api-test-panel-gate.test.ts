import { describe, expect, it } from 'vitest';

import { shouldShowApiTestPanel } from './api-test-panel-gate';

describe('shouldShowApiTestPanel', () => {
  it('shows in development and hides in production when no override is provided', () => {
    expect(shouldShowApiTestPanel({ DEV: true })).toBe(true);
    expect(shouldShowApiTestPanel({ DEV: false })).toBe(false);
  });

  it('honors an explicit true override in production', () => {
    expect(shouldShowApiTestPanel({
      DEV: false,
      VITE_SHOW_API_TEST_PANEL: 'true',
    })).toBe(true);
  });

  it('honors an explicit false override in development', () => {
    expect(shouldShowApiTestPanel({
      DEV: true,
      VITE_SHOW_API_TEST_PANEL: 'false',
    })).toBe(false);
  });

  it('normalizes override whitespace and falls back to the environment for invalid values', () => {
    expect(shouldShowApiTestPanel({
      DEV: false,
      VITE_SHOW_API_TEST_PANEL: ' TRUE ',
    })).toBe(true);
    expect(shouldShowApiTestPanel({
      DEV: false,
      VITE_SHOW_API_TEST_PANEL: 'yes',
    })).toBe(false);
  });
});
