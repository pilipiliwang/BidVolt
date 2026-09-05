import { describe, expect, it, vi } from 'vitest';

import { loadHtmlAssetPreview } from './html-preview';

describe('loadHtmlAssetPreview', () => {
  it('downloads original HTML bytes instead of relying on parsed text blocks', async () => {
    const blob = new Blob(['<!doctype html><meta charset="gbk"><h1>采购公告</h1>'], {
      type: 'application/octet-stream',
    });
    const download = vi.fn().mockResolvedValue(blob);

    const preview = await loadHtmlAssetPreview('portal-31', download);

    expect(download).toHaveBeenCalledWith('portal-31');
    expect(preview).toEqual({ kind: 'html', blob, mimeType: 'text/html' });
    expect('blob' in preview && preview.blob).toBe(blob);
  });

  it.each([
    ['text/html; charset=gbk', 'text/html; charset=gbk'],
    ['text/plain; charset="utf-8"', 'text/html; charset=utf-8'],
    ['application/octet-stream; charset=windows-1252; name=portal.htm', 'text/html; charset=windows-1252'],
    ['application/octet-stream', 'text/html'],
    ['', 'text/html'],
  ])('preserves an explicit encoding from %s without changing the source bytes', async (sourceType, mimeType) => {
    const blob = new Blob([new Uint8Array([0xb2, 0xc9, 0xb9, 0xba])], { type: sourceType });
    const preview = await loadHtmlAssetPreview('portal-32', vi.fn().mockResolvedValue(blob));

    expect(preview).toEqual({ kind: 'html', blob, mimeType });
  });

  it('propagates download failures so the preview can show its retry state', async () => {
    await expect(loadHtmlAssetPreview('missing', vi.fn().mockRejectedValue(new Error('文件不存在'))))
      .rejects.toThrow('文件不存在');
  });

  it('explains when an Angular portal only contains an empty application mount and scripts', async () => {
    const blob = new Blob([
      '<!doctype html><html><head><title>采购门户</title><style>app-root {display: block}</style></head>'
      + '<body><app-root></app-root><script src="/ecp2.0/customService/index.js"></script>'
      + '<script>window.dynamicHtmlWasExecuted = true</script><template>稍后显示的内容</template></body></html>',
    ]);
    const preview = await loadHtmlAssetPreview('portal-shell', vi.fn().mockResolvedValue(blob));

    expect(preview).toMatchObject({
      kind: 'html',
      blob,
      unavailableReason: '该 HTML 仅保存了动态网页入口，正文需要原网站的脚本和接口加载。请在原网站将页面另存为完整网页，或导出 PDF 后上传。',
    });
    expect(window).not.toHaveProperty('dynamicHtmlWasExecuted');
  });

  it.each([
    '<h1>采购公告</h1><script src="analytics.js"></script>',
    '<p>&lt;script src="app.js"&gt; 是示例代码</p>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="80" height="40" fill="green"/></svg>',
    '<img src="data:image/png;base64,aGVsbG8=">',
    '<object data="data:application/pdf;base64,aGVsbG8="></object>',
  ])('does not misclassify static text or visual content as an empty dynamic page: %s', async (source) => {
    const blob = new Blob([source]);
    const preview = await loadHtmlAssetPreview('static-html', vi.fn().mockResolvedValue(blob));

    expect(preview).toEqual({ kind: 'html', blob, mimeType: 'text/html' });
  });

  it.each(['', ' \n\t ', '<html><head><title>只有标题</title></head><body></body></html>', '<div hidden>隐藏内容</div>'])(
    'explains when the original HTML has no visible content: %s', async (source) => {
      const blob = new Blob([source]);
      const preview = await loadHtmlAssetPreview('empty-html', vi.fn().mockResolvedValue(blob));

      expect(preview).toMatchObject({
        kind: 'html',
        blob,
        unavailableReason: '该 HTML 文件中没有可展示的正文或图片。请确认保存了完整网页，或导出 PDF 后重新上传。',
      });
    },
  );
});
