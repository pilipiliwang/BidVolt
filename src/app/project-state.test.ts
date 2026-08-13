import { describe, expect, it } from 'vitest';

import type { ProjectSummary } from '../domains/projects/project-view-model';
import { mergeProjectPage, upsertProjectSummary } from './project-state';

const summary = (id: string, title = `项目 ${id}`): ProjectSummary => ({
  buyer: '招标人待补充',
  code: `NO-${id}`,
  deadline: '截止时间待补充',
  id,
  materialCount: 0,
  progress: 0,
  riskCount: 0,
  stage: '材料解析',
  title,
  updatedAt: '2026-08-14T00:00:00Z',
});

describe('project state merging', () => {
  it('keeps a deep-linked project that is outside the first project page', () => {
    expect(mergeProjectPage([summary('1')], [summary('404', '深链项目')], '404'))
      .toEqual([summary('1'), summary('404', '深链项目')]);
  });

  it('uses the fresh page record when the preserved project is present', () => {
    expect(mergeProjectPage([summary('1', '后端最新名称')], [summary('1', '旧名称')], '1'))
      .toEqual([summary('1', '后端最新名称')]);
  });

  it('replaces a project with its fetched detail without duplicating it', () => {
    expect(upsertProjectSummary([summary('1'), summary('2')], summary('2', '详情名称')))
      .toEqual([summary('2', '详情名称'), summary('1')]);
  });
});
