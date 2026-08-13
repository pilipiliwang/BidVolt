import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectMaterialUpload } from './ProjectMaterialUpload';

const baseProps = {
  projectId: 'BV-2026-018',
  projectName: '虚拟电厂数据融合系统',
};

describe('ProjectMaterialUpload tender notice URL import', () => {
  it('保留手动上传招标公告文件功能', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<ProjectMaterialUpload {...baseProps} onUpload={onUpload} />);

    const file = new File(['notice'], '招标公告.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择或拖拽招标材料'), file);

    expect(onUpload).toHaveBeenCalledWith('BV-2026-018', [file]);
  });

  it('trim 后将公开 HTTP/HTTPS 地址交给上层接口，并在成功后清空', async () => {
    const user = userEvent.setup();
    const onImportTenderNoticeUrl = vi.fn().mockResolvedValue({
      message: '公告与附件已进入解析队列',
      status: 'queued',
    });
    render(
      <ProjectMaterialUpload
        {...baseProps}
        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
      />,
    );

    const input = screen.getByLabelText('招标公告网址');
    await user.type(input, '  https://notice.example.gov.cn/tender?id=42  ');
    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    expect(onImportTenderNoticeUrl).toHaveBeenCalledWith(
      'BV-2026-018',
      'https://notice.example.gov.cn/tender?id=42',
    );
    expect(await screen.findByText('公告与附件已进入解析队列')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it.each([
    'ftp://notice.example.gov.cn/file',
    'http://localhost:8080/notice',
    'http://127.0.0.1/notice',
    'http://10.10.2.3/notice',
    'http://172.20.1.8/notice',
    'http://192.168.0.20/notice',
    'http://[::1]/notice',
  ])('拒绝不安全地址：%s', async (url) => {
    const user = userEvent.setup();
    const onImportTenderNoticeUrl = vi.fn();
    render(
      <ProjectMaterialUpload
        {...baseProps}
        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
      />,
    );

    fireEvent.change(screen.getByLabelText('招标公告网址'), { target: { value: url } });
    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onImportTenderNoticeUrl).not.toHaveBeenCalled();
  });

  it('导入期间禁用输入和按钮，并展示接口错误', async () => {
    const user = userEvent.setup();
    let rejectImport: (reason: Error) => void = () => undefined;
    const onImportTenderNoticeUrl = vi.fn().mockImplementation(
      () => new Promise<void>((_resolve, reject) => { rejectImport = reject; }),
    );
    render(
      <ProjectMaterialUpload
        {...baseProps}
        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
      />,
    );

    const input = screen.getByLabelText('招标公告网址');
    await user.type(input, 'https://notice.example.gov.cn/123');
    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: '正在导入…' })).toBeDisabled();

    rejectImport(new Error('该页面未发现可下载的招标公告'));
    expect(await screen.findByRole('alert')).toHaveTextContent('该页面未发现可下载的招标公告');
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue('https://notice.example.gov.cn/123');
  });
});
