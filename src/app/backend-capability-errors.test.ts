import { describe, expect, it } from 'vitest';

import { BackendApiError } from '../shared/backend-api';
import {
  TENDER_NOTICE_IMPORT_UNAVAILABLE_MESSAGE,
  tenderNoticeImportErrorMessage,
} from './backend-capability-errors';

describe('backend capability errors', () => {
  it('turns a missing tender notice endpoint into an actionable message', () => {
    expect(tenderNoticeImportErrorMessage(
      new BackendApiError(404, 'Not Found'),
      '导入失败',
    )).toBe(TENDER_NOTICE_IMPORT_UNAVAILABLE_MESSAGE);
  });

  it('preserves real backend errors and falls back for non-errors', () => {
    expect(tenderNoticeImportErrorMessage(
      new BackendApiError(500, '服务暂不可用'),
      '导入失败',
    )).toBe('服务暂不可用');
    expect(tenderNoticeImportErrorMessage(null, '导入失败')).toBe('导入失败');
  });
});
