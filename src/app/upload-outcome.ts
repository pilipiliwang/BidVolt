import type { BackendFile, FailedUpload } from '../shared/backend-api';

export type UploadOutcome = {
  errors: string[];
  expanded: { duplicates: number; imported: number };
  uploaded: BackendFile[];
};

export function readUploadOutcome(files: Array<BackendFile | FailedUpload>): UploadOutcome {
  return files.reduce<UploadOutcome>((outcome, file) => {
    if ('file_id' in file) {
      outcome.uploaded.push(file);
      outcome.expanded.imported += file.expanded?.imported ?? 0;
      outcome.expanded.duplicates += file.expanded?.duplicates ?? 0;
      if (file.expanded?.error) {
        outcome.errors.push(`${file.name}：ZIP 自动解包失败：${file.expanded.error}`);
      } else if ((file.expanded?.failed ?? 0) > 0) {
        outcome.errors.push(`${file.name}：ZIP 自动解包有 ${file.expanded?.failed} 个条目失败`);
      }
      return outcome;
    }

    const name = file.name?.trim() || '未命名文件';
    const message = file.error.trim() || '上传失败';
    outcome.errors.push(`${name}：${message}`);
    return outcome;
  }, { errors: [], expanded: { duplicates: 0, imported: 0 }, uploaded: [] });
}

export function uploadExpansionMessage(outcome: UploadOutcome) {
  const parts = [
    outcome.expanded.imported > 0 ? `自动解包导入 ${outcome.expanded.imported} 个文件` : '',
    outcome.expanded.duplicates > 0 ? `跳过 ${outcome.expanded.duplicates} 个重复文件` : '',
  ].filter(Boolean);
  return parts.length > 0 ? `；ZIP ${parts.join('，')}` : '';
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
