import { describe, expect, it } from 'vitest';
import { projectMetadataFields, readProjectMetadata, updateProjectMetadata } from './project-metadata';

describe('project metadata compatibility', () => {
  it('persists author and package independently while preserving remarks', () => {
    const note = updateProjectMetadata('人工备注\n不要覆盖', { authorName: ' 王工 ', packageNo: '包 2' });
    expect(note.startsWith('人工备注\n不要覆盖\n\n')).toBe(true);
    expect(readProjectMetadata(note)).toEqual({ authorName: '王工', packageNo: '包 2' });
    const updated = updateProjectMetadata(note, { packageNo: '包 3' });
    expect(readProjectMetadata(updated)).toEqual({ authorName: '王工', packageNo: '包 3' });
    expect(updated.match(/\[BidVolt 项目扩展信息 v1\]/g)).toHaveLength(1);
  });
  it('prefers actual native fields without confusing package and tender numbers', () => {
    expect(projectMetadataFields({ note: updateProjectMetadata('', { packageNo: '2' }), package_no: '3' }).packageNo).toBe('3');
    expect(projectMetadataFields({ note: '招标编号：ABC' }).packageNo).toBeUndefined();
  });
  it('does not erase malformed or unknown data', () => {
    const note = '[BidVolt 项目扩展信息 v1]\n{"authorName":"A","extra":"保留"}\n[/BidVolt 项目扩展信息]\n后记';
    expect(updateProjectMetadata(note, { packageNo: '1' })).toContain('"extra":"保留"');
    expect(updateProjectMetadata(note, { packageNo: '1' })).toMatch(/后记$/);
    expect(() => updateProjectMetadata('[BidVolt 项目扩展信息 v1]broken', { packageNo: '1' })).toThrow();
  });
});
