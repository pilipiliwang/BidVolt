import { describe, expect, it } from 'vitest';

import {
  getCompletedBidMaterialIds,
  getSupplementalMaterialIds,
  recordCompletedBidMaterialFiles,
  recordSupplementalMaterialFiles,
} from './supplemental-material-state';

describe('supplemental material session state', () => {
  it('records only real uploaded file ids and deduplicates repeated results', () => {
    const first = recordSupplementalMaterialFiles({}, 'enterprise-1', 'project-7', [
      { file_id: 101, name: '设备清单.xlsx' },
      { file_id: 102, name: '答疑附件.pdf' },
    ]);
    const second = recordSupplementalMaterialFiles(first, 'enterprise-1', 'project-7', [
      { file_id: 102, name: '答疑附件.pdf' },
    ]);

    expect(getSupplementalMaterialIds(second, 'enterprise-1', 'project-7')).toEqual(['101', '102']);
  });

  it('isolates ids by tenant and project without browser persistence', () => {
    const state = recordSupplementalMaterialFiles({}, 'enterprise-1', 'project-7', [
      { file_id: 101, name: '设备清单.xlsx' },
    ]);

    expect(getSupplementalMaterialIds(state, 'enterprise-1', 'project-8')).toEqual([]);
    expect(getSupplementalMaterialIds(state, 'enterprise-2', 'project-7')).toEqual([]);
    expect(getSupplementalMaterialIds({}, 'enterprise-1', 'project-7')).toEqual([]);
  });

  it('keeps completed bid ids separate from supplemental material ids', () => {
    const completed = recordCompletedBidMaterialFiles({}, 'enterprise-1', 'project-7', [
      { file_id: 203, name: '商务标.docx' },
    ]);

    expect(getCompletedBidMaterialIds(completed, 'enterprise-1', 'project-7')).toEqual(['203']);
    expect(getCompletedBidMaterialIds(completed, 'enterprise-1', 'project-8')).toEqual([]);
    expect(getSupplementalMaterialIds({}, 'enterprise-1', 'project-7')).toEqual([]);
  });
});
