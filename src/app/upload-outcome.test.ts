import { describe, expect, it } from 'vitest';

import type { BackendFile, FailedUpload } from '../shared/backend-api';
import { readUploadOutcome, uploadOutcomeError } from './upload-outcome';

const uploadedFile: BackendFile = {
  file_id: 7,
  mime: 'application/pdf',
  name: '招标文件.pdf',
  size: 1024,
  status: 1,
};

describe('upload outcome handling', () => {
  it('keeps successful files and aggregates every backend per-file error', () => {
    const failures: FailedUpload[] = [
      { error: '文件为空', name: '空文件.pdf' },
      { error: '格式不支持', name: '脚本.exe' },
    ];

    const outcome = readUploadOutcome([uploadedFile, ...failures]);

    expect(outcome.uploaded).toEqual([uploadedFile]);
    expect(uploadOutcomeError('当前项目材料', outcome.uploaded.length, outcome.errors)?.message)
      .toBe('已成功上传 1 份；当前项目材料上传失败：空文件.pdf：文件为空；脚本.exe：格式不支持');
  });

  it('treats an empty backend result as a failure instead of reporting zero uploads', () => {
    const outcome = readUploadOutcome([]);

    expect(uploadOutcomeError('企业资料', outcome.uploaded.length, outcome.errors)?.message)
      .toBe('未上传任何企业资料：后端未返回成功文件。');
  });
});
