import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectMaterialUpload } from './ProjectMaterialUpload';

const baseProps = {
  projectId: 'BV-2026-018',
  projectName: '虚拟电厂数据融合系统',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('ProjectMaterialUpload tender notice URL import', () => {
  it('在 generation 模式合并招标文件和网址入口，并在右侧展示材料列表', () => {
    render(
      <ProjectMaterialUpload
        {...baseProps}
        mode="generation"
        onSupplementalUpload={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    const fileCard = screen.getByRole('heading', { name: /上传招标材料/ }).closest('article');
    const urlCard = screen.getByRole('region', { name: '粘贴招标公告地址' });
    const layout = fileCard?.closest('.project-generation-upload-layout');
    expect(fileCard).toContainElement(urlCard);
    expect(within(layout as HTMLElement).getByLabelText('材料列表')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /上传补充材料/ })).toBeInTheDocument();
    expect(screen.getByText('必填')).toHaveClass('is-required');
    expect(screen.getAllByText('可选').every((label) => label.classList.contains('is-optional')))
      .toBe(true);
    expect(urlCard.querySelector('.project-tender-url-import__heading > span')).toBeNull();
  });

  it('将网址导入文件放在右侧材料列表并允许调用真实删除回调', async () => {
    const user = userEvent.setup();
    const onRemoveMaterial = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectMaterialUpload
        {...baseProps}
        mode="generation"
        onRemoveMaterial={onRemoveMaterial}
        onSupplementalUpload={vi.fn()}
        onUpload={vi.fn()}
        urlImportedFiles={[{ id: '91', name: 'portal.html' }]}
      />,
    );

    const urlCard = screen.getByRole('region', { name: '粘贴招标公告地址' });
    expect(within(urlCard).queryByRole('list', { name: '公告地址导入文件' }))
      .not.toBeInTheDocument();
    const tenderList = screen.getByRole('list', { name: '招标材料列表' });
    expect(within(tenderList).getByText('portal.html')).toBeInTheDocument();
    expect(within(urlCard).queryByText('请输入以 http:// 或 https:// 开头的公开招标公告链接。'))
      .not.toBeInTheDocument();

    await user.click(within(tenderList).getByRole('button', { name: '删除portal.html' }));
    const dialog = screen.getByRole('dialog', { name: '删除项目材料' });
    expect(within(dialog).getByText(/portal\.html/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }));
    expect(onRemoveMaterial).toHaveBeenCalledWith('BV-2026-018', '91');
  });

  it('generation 模式仍把两个入口分别交给原有真实回调', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    const onImportTenderNoticeUrl = vi.fn().mockResolvedValue({ status: 'queued' });
    render(
      <ProjectMaterialUpload
        {...baseProps}
        mode="generation"
        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
        onSupplementalUpload={vi.fn()}
        onUpload={onUpload}
      />,
    );

    const file = new File(['notice'], '招标文件.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择或拖拽招标材料'), file);
    expect(screen.getByRole('button', { name: '导入并解析' })).toBeDisabled();
    await user.type(screen.getByLabelText('招标公告网址'), 'https://notice.example.gov.cn/42');
    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    expect(onUpload).toHaveBeenCalledWith('BV-2026-018', [file]);
    expect(onImportTenderNoticeUrl).toHaveBeenCalledWith(
      'BV-2026-018',
      'https://notice.example.gov.cn/42',
    );
  });

  it('选择招标材料和补充资料后立即逐文件展示真实上传状态', async () => {
    const user = userEvent.setup();
    const tenderUpload = deferred<void>();
    const supplementalUpload = deferred<void>();
    render(
      <ProjectMaterialUpload
        {...baseProps}
        mode="generation"
        onSupplementalUpload={() => supplementalUpload.promise}
        onUpload={() => tenderUpload.promise}
      />,
    );

    const tenderFile = new File(['notice'], '招标文件.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择或拖拽招标材料'), tenderFile);

    const tenderList = screen.getByRole('list', { name: '招标材料列表' });
    expect(within(tenderList).getByText('招标文件.pdf')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '招标文件.pdf上传中' }))
      .toHaveClass('project-upload-card__selected-status--uploading');

    await act(async () => tenderUpload.resolve());
    expect(await screen.findByRole('img', { name: '招标文件.pdf上传成功' }))
      .toHaveClass('project-upload-card__selected-status--success');

    const supplementalFile = new File(['appendix'], '补充说明.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText('选择或拖拽补充资料'), supplementalFile);

    const supplementalList = screen.getByRole('list', { name: '补充材料列表' });
    expect(within(supplementalList).getByText('补充说明.docx')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '补充说明.docx上传中' }))
      .toHaveClass('project-upload-card__selected-status--uploading');

    await act(async () => supplementalUpload.resolve());
    expect(await screen.findByRole('img', { name: '补充说明.docx上传成功' }))
      .toHaveClass('project-upload-card__selected-status--success');
  });

  it('保留手动上传招标公告文件功能', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<ProjectMaterialUpload {...baseProps} onUpload={onUpload} />);

    const file = new File(['notice'], '招标公告.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择或拖拽招标材料'), file);

    expect(onUpload).toHaveBeenCalledWith('BV-2026-018', [file]);
  });

  it('按最新后端能力在调用接口前拦截 RAR 格式', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onUpload = vi.fn();
    render(<ProjectMaterialUpload {...baseProps} onUpload={onUpload} />);

    const file = new File(
      ['rar-test'],
      '【招标公告文件】虚拟电厂数据融合系统_完整采购文件_95307793016393648.rar',
      { type: 'application/vnd.rar' },
    );
    await user.upload(screen.getByLabelText('选择或拖拽招标材料'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '【招标公告文件】虚拟电厂数据融合系统_完整采购文件_95307793016393648.rar：不支持该文件格式',
    );
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('拖拽不支持的格式时在调用接口前拦截', async () => {
    const onUpload = vi.fn();
    render(<ProjectMaterialUpload {...baseProps} onUpload={onUpload} />);

    const file = new File(['unsafe'], '脚本.exe', { type: 'application/octet-stream' });
    fireEvent.drop(screen.getAllByText('点击或拖拽文件到此处上传')[0].closest('label')!, {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('脚本.exe：不支持该文件格式');
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('单个文件超过后端 500MB 限制时在调用接口前拦截', async () => {
    const onUpload = vi.fn();
    render(<ProjectMaterialUpload {...baseProps} onUpload={onUpload} />);

    const file = new File(['large'], '超大招标公告.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 500 * 1024 * 1024 + 1 });
    fireEvent.drop(screen.getAllByText('点击或拖拽文件到此处上传')[0].closest('label')!, {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('超大招标公告.zip：单个文件不能超过 500MB');
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('在手动上传失败时展示上层返回的错误', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new Error('招标公告.pdf：文件为空'));
    render(<ProjectMaterialUpload {...baseProps} onUpload={onUpload} />);

    const file = new File([''], '招标公告.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择或拖拽招标材料'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent('招标公告.pdf：文件为空');
    expect(screen.getByRole('img', { name: '招标公告.pdf上传失败' }))
      .toHaveClass('project-upload-card__selected-status--error');
    expect(screen.queryByText('文件上传完成，解析状态将从服务端刷新。')).not.toBeInTheDocument();
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
    expect(screen.queryByText('请输入以 http:// 或 https:// 开头的公开招标公告链接。'))
      .not.toBeInTheDocument();
  });

  it('识别复制链接首尾的不可见字符，并明确显示公开 HTTPS 地址可导入', async () => {
    const user = userEvent.setup();
    const onImportTenderNoticeUrl = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectMaterialUpload
        {...baseProps}
        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
      />,
    );

    const input = screen.getByLabelText('招标公告网址');
    fireEvent.change(input, {
      target: { value: '\u200Bhttps://notice.example.gov.cn/tender/42\u2060' },
    });

    expect(screen.getByText('网址格式正确，可提交服务端检查并导入。')).toBeInTheDocument();
    expect(screen.queryByText('仅支持可公开访问的 HTTP/HTTPS 地址。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入并解析' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    expect(onImportTenderNoticeUrl).toHaveBeenCalledWith(
      'BV-2026-018',
      'https://notice.example.gov.cn/tender/42',
    );
  });

  it('未输入完整协议时展示真实校验错误并禁用导入按钮', () => {
    const onImportTenderNoticeUrl = vi.fn();
    render(
      <ProjectMaterialUpload
        {...baseProps}
        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
      />,
    );

    fireEvent.change(screen.getByLabelText('招标公告网址'), {
      target: { value: 'notice.example.gov.cn/tender/42' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '网址格式不正确，请输入完整的 http:// 或 https:// 地址。',
    );
    expect(screen.getByRole('button', { name: '导入并解析' })).toBeDisabled();
    expect(onImportTenderNoticeUrl).not.toHaveBeenCalled();
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
