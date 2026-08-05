import { describe, expect, it } from 'vitest';

import { matchRoute } from './router';

describe('matchRoute', () => {
  it('separates enterprise and project-scoped domains', () => {
    expect(matchRoute('/enterprise-assets')).toEqual({ name: 'enterprise-assets' });
    expect(matchRoute('/projects/BV-2026-018/materials')).toEqual({
      name: 'project-materials',
      projectId: 'BV-2026-018',
    });
    expect(matchRoute('/projects/BV-2026-018/review')).toEqual({
      name: 'review-center',
      projectId: 'BV-2026-018',
    });
    expect(matchRoute('/projects/BV-2026-018/pricing')).toEqual({
      name: 'pricing-center',
      projectId: 'BV-2026-018',
    });
  });

  it('routes login and global read-only history outside project scope', () => {
    expect(matchRoute('/login')).toEqual({ name: 'login' });
    expect(matchRoute('/history-prices')).toEqual({ name: 'history-prices' });
    expect(matchRoute('/history')).toEqual({ name: 'history-prices' });
  });

  it('does not treat unknown subpaths as a project overview', () => {
    expect(matchRoute('/projects/BV-2026-018/enterprise-assets')).toEqual({
      name: 'not-found',
    });
  });
});
