import type { EnterpriseUploadRecord } from '../features/enterprise-assets';
import type { BackendFile, FailedUpload } from '../shared/backend-api';

export function buildEnterpriseUploadRecords(
  files: Array<BackendFile | FailedUpload>,
  createdAt = new Date().toISOString(),
): EnterpriseUploadRecord[] {
  return files.map((file, index) => {
    if ('file_id' in file) {
      return {
        id: `${createdAt}-${index}-${file.file_id}`,
        fileName: file.name,
        status: 'accepted',
        createdAt,
        fileId: String(file.file_id),
        assetId: file.asset_id == null ? undefined : String(file.asset_id),
        duplicate: file.duplicate,
        message: file.message,
        expanded: file.expanded ? {
          imported: file.expanded.imported ?? 0,
          duplicates: file.expanded.duplicates ?? 0,
          failed: file.expanded.failed ?? 0,
          error: file.expanded.error,
        } : undefined,
      };
    }

    return {
      id: `${createdAt}-${index}-failed`,
      fileName: file.name?.trim() || '未命名文件',
      status: 'failed',
      createdAt,
      message: file.error.trim() || '上传失败',
    };
  });
}
