import { BackendApiError } from '../shared/backend-api';

export const TENDER_NOTICE_IMPORT_UNAVAILABLE_MESSAGE =
  '当前后端版本尚未提供招标公告网址导入接口，请先使用手动上传招标公告文件。';

export function tenderNoticeImportErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BackendApiError && error.status === 404) {
    return TENDER_NOTICE_IMPORT_UNAVAILABLE_MESSAGE;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
