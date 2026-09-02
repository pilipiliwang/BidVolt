import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnterpriseAssetPreview } from './EnterpriseAssetPreview';

describe('EnterpriseAssetPreview', () => {
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
