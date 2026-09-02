import { describe, expect, it } from 'vitest';

import { deliverableEditorPath, matchRoute } from './router';

describe('matchRoute', () => {
  it('keeps the public product landing page separate from the project workspace', () => {
    expect(matchRoute('/')).toEqual({ name: 'landing' });
    expect(matchRoute('/projects')).toEqual({ name: 'projects' });
  });

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
    expect(matchRoute('/history-prices')).toEqual({ name: 'not-found' });
    expect(matchRoute('/history')).toEqual({ name: 'not-found' });
  });

  it.each(['business', 'technical', 'quote'] as const)(
    'routes the %s deliverable to its project-scoped version editor',
    (deliverableId) => {
      expect(
        matchRoute(`/projects/BV-2026-018/deliverables/${deliverableId}/versions/v3.2`),
      ).toEqual({
        name: 'deliverable-editor',
        projectId: 'BV-2026-018',
        deliverableId,
        versionId: 'v3.2',
      });
    },
  );

  it('encodes and decodes project and version identifiers in editor paths', () => {
    const path = deliverableEditorPath('项目 018', 'technical', '技术标 v6');

    expect(path).toBe(
      '/projects/%E9%A1%B9%E7%9B%AE%20018/deliverables/technical/versions/%E6%8A%80%E6%9C%AF%E6%A0%87%20v6',
    );
    expect(matchRoute(path)).toEqual({
      name: 'deliverable-editor',
      projectId: '项目 018',
      deliverableId: 'technical',
      versionId: '技术标 v6',
    });
  });

  it('does not treat unknown subpaths as a project overview', () => {
    expect(matchRoute('/projects/BV-2026-018/enterprise-assets')).toEqual({
      name: 'not-found',
    });
    expect(
      matchRoute('/projects/BV-2026-018/deliverables/unknown/versions/v1'),
    ).toEqual({ name: 'not-found' });
    expect(matchRoute('/projects/BV-2026-018/deliverables/quote')).toEqual({
      name: 'not-found',
    });
  });
});
