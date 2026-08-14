import type { BackendFile, FailedUpload } from '../shared/backend-api';

export type UploadOutcome = {
  errors: string[];
  uploaded: BackendFile[];
};

export function readUploadOutcome(files: Array<BackendFile | FailedUpload>): UploadOutcome {
  return files.reduce<UploadOutcome>((outcome, file) => {
    if ('file_id' in file) {
      outcome.uploaded.push(file);
      return outcome;
    }

    const name = file.name?.trim() || '未命名文件';
    const message = file.error.trim() || '上传失败';
    outcome.errors.push(`${name}：${message}`);
    return outcome;
  }, { errors: [], uploaded: [] });
}

export function uploadOutcomeError(
  label: string,
  successfulCount: number,
  errors: string[],
): Error | null {
  if (errors.length > 0) {
    const successPrefix = successfulCount > 0 ? `已成功上传 ${successfulCount} 份；` : '';
    return new Error(`${successPrefix}${label}上传失败：${errors.join('；')}`);
  }
  if (successfulCount === 0) {
    return new Error(`未上传任何${label}：后端未返回成功文件。`);
  }
  return null;
}
