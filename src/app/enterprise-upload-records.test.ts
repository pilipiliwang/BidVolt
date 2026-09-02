import { describe, expect, it } from 'vitest';

import { buildEnterpriseUploadRecords } from './enterprise-upload-records';

describe('enterprise upload records', () => {
  it('keeps accepted, duplicate, expanded, asset and failed receipt details', () => {
    expect(buildEnterpriseUploadRecords([
      {
        asset_id: 7,
        duplicate: true,
        expanded: { imported: 3, duplicates: 1, failed: 0 },
        file_id: 11,
        name: '企业资料.zip',
        size: 120,
      },
      { name: '损坏.pdf', error: '病毒扫描失败' },
    ], '2026-09-02T10:00:00.000Z')).toEqual([
      expect.objectContaining({
        assetId: '7',
        duplicate: true,
        fileId: '11',
        fileName: '企业资料.zip',
        status: 'accepted',
        expanded: { imported: 3, duplicates: 1, failed: 0 },
      }),
      expect.objectContaining({
        fileName: '损坏.pdf',
        message: '病毒扫描失败',
        status: 'failed',
      }),
    ]);
  });
});
