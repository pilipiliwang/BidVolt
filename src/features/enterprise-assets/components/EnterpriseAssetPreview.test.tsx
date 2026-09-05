import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnterpriseAssetPreview } from './EnterpriseAssetPreview';

describe('EnterpriseAssetPreview', () => {
  it('shows the missing-content reason instead of an empty HTML frame and keeps the original downloadable', async () => {
    const user = userEvent.setup();
    const onLoadPreview = vi.fn().mockResolvedValue({
      kind: 'html' as const,
      blob: new Blob(['<app-root></app-root><script src="app.js"></script>']),
      mimeType: 'text/html',
      unavailableReason: '该 HTML 仅保存了动态网页入口，正文需要原网站的脚本和接口加载。请在原网站将页面另存为完整网页，或导出 PDF 后上传。',
    });
    const onDownloadFile = vi.fn();
    render(<EnterpriseAssetPreview fileId="portal-shell" fileName="portal.html" onLoadPreview={onLoadPreview} onDownloadFile={onDownloadFile} />);

    expect(await screen.findByText('HTML 未包含可直接预览的内容')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正文需要原网站的脚本和接口加载');
    expect(screen.queryByTitle('portal.html HTML 预览')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下载原文件' }));
    expect(onDownloadFile).toHaveBeenCalledWith('portal-shell', 'portal.html');
  });

  it('renders HTML in a script-disabled frame and releases the old URL on replacement and unmount', async () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:http://localhost/first-html')
      .mockReturnValueOnce('blob:http://localhost/second-html');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    const onLoadPreview = vi.fn().mockResolvedValue({
      kind: 'html' as const,
      blob: new Blob(['<h1>采购公告</h1><script>window.parent.alert(1)</script>'], { type: 'application/octet-stream' }),
      mimeType: 'text/html; charset=gbk',
    });
    const { rerender, unmount } = render(
      <EnterpriseAssetPreview fileId="first-html" fileName="portal.html" onLoadPreview={onLoadPreview} />,
    );
    try {
      const frame = await screen.findByTitle('portal.html HTML 预览');
      expect(frame).toHaveAttribute('src', 'blob:http://localhost/first-html');
      expect(frame).toHaveAttribute('sandbox', '');
      expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(createObjectURL.mock.calls[0][0]).toHaveProperty('type', 'text/html; charset=gbk');
      expect(screen.queryByLabelText('解析文本预览')).not.toBeInTheDocument();

      rerender(<EnterpriseAssetPreview fileId="second-html" fileName="notice.htm" onLoadPreview={onLoadPreview} />);
      expect(await screen.findByTitle('notice.htm HTML 预览')).toHaveAttribute('src', 'blob:http://localhost/second-html');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/first-html');
      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/second-html');
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('renders parsed backend blocks and downloads the same source file', async () => {
    const user = userEvent.setup();
    const onLoadPreview = vi.fn().mockResolvedValue({
      kind: 'text' as const,
      blocks: [
        { id: 'block-1', pageNo: 1, text: '营业执照正文' },
        { id: 'block-2', pageNo: 2, text: '统一社会信用代码' },
      ],
    });
    const onDownloadFile = vi.fn().mockResolvedValue(undefined);

    render(
      <EnterpriseAssetPreview
        fileId="88"
        fileName="营业执照.docx"
        onLoadPreview={onLoadPreview}
        onDownloadFile={onDownloadFile}
      />,
    );

    expect(await screen.findByText('营业执照正文')).toBeInTheDocument();
    expect(screen.getByText('第 1 页')).toBeInTheDocument();
    expect(onLoadPreview).toHaveBeenCalledWith('88', '营业执照.docx');

    const previewViewport = screen.getByRole('region', { name: '原件内容' });
    expect(previewViewport).toContainElement(screen.getByLabelText('解析文本预览'));
    expect(previewViewport).not.toContainElement(screen.getByRole('button', { name: '下载原文件' }));

    await user.click(screen.getByRole('button', { name: '下载原文件' }));
    expect(onDownloadFile).toHaveBeenCalledWith('88', '营业执照.docx');
  });

  it('shows why an original cannot be previewed when the backend omits its file id', () => {
    render(<EnterpriseAssetPreview fileName="历史资料.pdf" />);

    expect(screen.getByText('暂无可预览原件')).toBeInTheDocument();
    expect(screen.getByText('后端未返回该资料对应的源文件编号。')).toBeInTheDocument();
  });

  it('retries a failed preview request without hiding the backend error', async () => {
    const user = userEvent.setup();
    const onLoadPreview = vi.fn()
      .mockRejectedValueOnce(new Error('文件下载接口暂不可用'))
      .mockResolvedValueOnce({ kind: 'unsupported' as const, message: '请下载原文件查看。' });

    render(
      <EnterpriseAssetPreview
        fileId="99"
        fileName="资料.zip"
        onLoadPreview={onLoadPreview}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('文件下载接口暂不可用');
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('当前格式暂不支持在线预览')).toBeInTheDocument();
    expect(onLoadPreview).toHaveBeenCalledTimes(2);
  });
});
