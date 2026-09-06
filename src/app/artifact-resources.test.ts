import { describe, expect, it } from 'vitest';
import { adaptArtifactResources, artifactIdentityFromResourceId, artifactResourceId, artifactResourcesRevision } from './artifact-resources';
import type { AgentArtifactSummary } from '../shared/backend-api/artifacts';

const artifact = (overrides: Partial<AgentArtifactSummary> = {}): AgentArtifactSummary => ({
  artifact_id: 91, project_id: 7, task_id: 8, kind: 'item_docx',
  name: '商务文件/响应文件.docx', group: '商务文件', filename: '响应文件.docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  bytes: 1024, version_no: 1, is_internal: false, status: 'ready',
  created_at: '2026-09-06T10:00:00Z', updated_at: '2026-09-06T10:00:00Z',
  download_url: '/api/v1/projects/7/agent-artifact/91/download', ...overrides,
});

describe('formal artifact resource adapters', () => {
  it('keeps IDs separate from legacy uploaded files and structured deliverables', () => {
    const { resultFiles, deliverables } = adaptArtifactResources(7, [artifact()]);
    expect(resultFiles).toEqual([expect.objectContaining({
      id: 'artifact:7:91', artifactId: 91, projectId: 7, source: 'backend-artifact',
      name: '响应文件.docx', category: 'business', versionNo: 1, versionLabel: 'v1', sizeLabel: '1.0 KB',
    })]);
    expect(resultFiles[0]).not.toHaveProperty('fileId');
    expect(resultFiles[0]).not.toHaveProperty('versions');
    expect(resultFiles[0]).not.toHaveProperty('selectedVersionId');
    expect(deliverables).toEqual([{ id: 'business', tone: 'business', title: '商务文件', lift: '—', score: '—', words: '—' }]);
    expect(artifactIdentityFromResourceId(7, 'artifact:7:91')).toEqual({ projectId: '7', artifactId: '91' });
    for (const id of ['91', 'business', '响应文件.docx', 'artifact:8:91', 'artifact:7:91:2']) {
      expect(artifactIdentityFromResourceId(7, id)).toBeNull();
    }
  });

  it('preserves same-name artifacts as separate files without inventing a version chain', () => {
    const { resultFiles } = adaptArtifactResources(7, [artifact(), artifact({ artifact_id: 92 })]);
    expect(resultFiles.map((file) => file.id)).toEqual(['artifact:7:91', 'artifact:7:92']);
    expect(resultFiles.map((file) => file.versionLabel)).toEqual(['v1', 'v1']);
    expect(resultFiles.every((file) => file.versions === undefined)).toBe(true);
  });

  it('uses backend group metadata, preserves unknown groups and separates ZIP packages', () => {
    const unknown = artifact({ artifact_id: 92, group: '', filename: '技术文件.docx' });
    const packaged = artifact({ artifact_id: 93, group: '', filename: '全部成果.zip', kind: 'zip' });
    const internal = artifact({ artifact_id: 94, group: '内部管理文件_说明', is_internal: true });
    const price = artifact({ artifact_id: 95, group: '价格文件', kind: 'xlsx' });
    const output = adaptArtifactResources(7, [unknown, packaged, internal, price]);
    expect(output.unclassifiedArtifacts).toEqual([unknown]);
    expect(output.packageArtifacts).toEqual([packaged]);
    expect(output.resultFiles.map((file) => file.category)).toEqual(['unclassified', 'internal', 'price']);
    expect(output.deliverables.map((view) => view.id)).toEqual(['quote', 'internal']);
  });

  it('refuses another project or duplicate IDs instead of merging with local resources', () => {
    expect(() => adaptArtifactResources(7, [artifact({ project_id: 8 })])).toThrow('其他项目');
    expect(() => adaptArtifactResources(7, [artifact(), artifact()])).toThrow('重复标识');
    expect(() => artifactResourceId(7, 'business')).toThrow('标识无效');
  });

  it('revision changes after overwrite/new save but does not depend on listing order', () => {
    const first = artifact();
    const second = artifact({ artifact_id: 92 });
    const original = artifactResourcesRevision([first]);
    expect(artifactResourcesRevision([artifact({ version_no: 2 })])).not.toBe(original);
    expect(artifactResourcesRevision([artifact({ updated_at: '2026-09-06T11:00:00Z' })])).not.toBe(original);
    expect(artifactResourcesRevision([first, second])).not.toBe(original);
    expect(artifactResourcesRevision([first, second])).toBe(artifactResourcesRevision([second, first]));
  });
});
