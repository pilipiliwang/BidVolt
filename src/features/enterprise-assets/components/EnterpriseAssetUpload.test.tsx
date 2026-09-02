import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnterpriseAssetUpload } from './EnterpriseAssetUpload';

describe('EnterpriseAssetUpload', () => {
  it('展示可用的普通上传和真实禁用的历史标书提取模式', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();

    render(
      <EnterpriseAssetUpload
        enterpriseName="华东电气设备有限公司"
        onUpload={onUpload}
      />,
    );

    const modes = screen.getByRole('group', { name: '企业资料上传方式' });
    const ordinaryMode = within(modes).getByRole('button', { name: /上传企业资料/ });
    const historicalMode = within(modes).getByRole('button', { name: /从历史标书成果提取/ });

    expect(ordinaryMode).toBeEnabled();
    expect(ordinaryMode).toHaveAttribute('aria-pressed', 'true');
    expect(historicalMode).toBeDisabled();
    expect(historicalMode).toHaveTextContent('待测试');

    await user.click(historicalMode);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('仅在普通上传入口声明后端已支持的格式和大小限制', () => {
    render(<EnterpriseAssetUpload enterpriseName="华东电气设备有限公司" />);

    const input = screen.getByLabelText(/选择文件或拖拽到此处/);
    const acceptedExtensions = input.getAttribute('accept')?.split(',') ?? [];

    expect(acceptedExtensions).toContain('.zip');
    expect(acceptedExtensions).not.toContain('.rar');
    expect(acceptedExtensions).not.toContain('.7z');
    expect(screen.getByText(/PDF、OFD、Word、Excel、PPT、文本、图片和 ZIP/))
      .toHaveTextContent('单个文件不超过 500MB');
    expect(screen.queryByText(/上传后由服务端自动分类/)).not.toBeInTheDocument();
  });

  it.each([
    ['RAR', '历史资料.RAR', 'application/vnd.rar'],
    ['7Z', '历史资料.7z', 'application/x-7z-compressed'],
  ])('在运行时拦截 %s 并不发起上传', async (_label, fileName, type) => {
    const onUpload = vi.fn();
    render(
      <EnterpriseAssetUpload
        enterpriseName="华东电气设备有限公司"
        onUpload={onUpload}
      />,
    );

    const input = screen.getByLabelText(/选择文件或拖拽到此处/);
    const archive = new File(['archive'], fileName, { type });
    fireEvent.change(input, { target: { files: [archive] } });

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('后端暂不支持 RAR/7Z，请转换为 ZIP 后上传');
    expect(onUpload).not.toHaveBeenCalled();
  });
});
