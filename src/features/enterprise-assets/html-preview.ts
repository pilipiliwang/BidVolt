import type { EnterpriseAssetPreview } from './types';

export async function loadHtmlAssetPreview(
  fileId: string,
  download: (fileId: string) => Promise<Blob>,
): Promise<EnterpriseAssetPreview> {
  const blob = await download(fileId);
  const charset = /(?:^|;)\s*charset\s*=\s*"?([a-z0-9._-]+)"?(?=\s*(?:;|$))/i.exec(blob.type)?.[1];
  const source = await readHtmlSource(blob, charset);
  const unavailableReason = htmlPreviewUnavailableReason(source);

  // Keep the original bytes so the browser can honor a BOM or HTML charset declaration.
  return {
    kind: 'html',
    blob,
    mimeType: charset ? `text/html; charset=${charset}` : 'text/html',
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}

function readHtmlSource(blob: Blob, charset?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('HTML 原文件读取失败，请下载后查看。'));
    reader.readAsText(blob, charset);
  });
}

function htmlPreviewUnavailableReason(source: string): string | undefined {
  // This detached document is only inspected; its scripts are never executed or mounted.
  const document = new DOMParser().parseFromString(source, 'text/html');
  const hasScripts = document.querySelector('script') !== null;
  document.querySelectorAll('script, style, template, head, [hidden], input[type="hidden"]')
    .forEach((element) => element.remove());
  const body = document.body;
  const hasText = Boolean(body.textContent?.replace(/[\s\u200b-\u200d\ufeff]/g, ''));
  const hasVisualContent = Boolean(body.querySelector([
    'img[src]', 'img[srcset]', 'img[alt]', 'svg', 'math',
    'iframe[src]', 'iframe[srcdoc]', 'object[data]', 'embed[src]',
    'video[src]', 'video[poster]', 'video source[src]', 'audio[src]', 'audio source[src]',
    'input:not([type="hidden"])', 'select', 'textarea', 'button', 'progress', 'meter', 'hr',
  ].join(',')));

  if (hasText || hasVisualContent) return undefined;
  if (hasScripts) {
    return '该 HTML 仅保存了动态网页入口，正文需要原网站的脚本和接口加载。请在原网站将页面另存为完整网页，或导出 PDF 后上传。';
  }
  return '该 HTML 文件中没有可展示的正文或图片。请确认保存了完整网页，或导出 PDF 后重新上传。';
}
