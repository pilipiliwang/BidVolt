import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BidMarketLibraryPage } from './BidMarketLibraryPage';
import type { BidMarketContent } from './types';

const items: BidMarketContent[] = [
  { id: 'a1', title: '电网投标政策解读', kind: 'article', categoryId: 'wechat-article', categoryLabel: '公众号文章', summary: '政策摘要', source: '行业协会', body: '文章正文' },
  { id: 'v1', title: '技术标案例讲解', kind: 'video', categoryId: 'wechat-video', categoryLabel: '公众号视频', summary: '视频课程' },
  { id: 'd1', title: '投标文档指南', kind: 'document', categoryId: 'document', categoryLabel: '文档', summary: '文档摘要' },
];

describe('BidMarketLibraryPage', () => {
  it('filters prop-provided content and previews the selected item', async () => {
    const user = userEvent.setup();
    render(<BidMarketLibraryPage items={items} state="ready" />);
    expect(screen.getAllByText('电网投标政策解读')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /公众号视频/ }));
    expect(screen.getAllByText('技术标案例讲解')).toHaveLength(1);
    expect(screen.queryByText('投标文档指南')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '预览技术标案例讲解' }));
    expect(screen.getByText('技术标案例讲解', { selector: '.bid-market-library__inline-preview-heading h2' }))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭资料预览' }));
    expect(screen.queryByText('技术标案例讲解', { selector: '.bid-market-library__inline-preview-heading h2' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /资料预览/ })).not.toBeInTheDocument();
  });

  it('searches and paginates without adding fallback data', async () => {
    const user = userEvent.setup();
    render(<BidMarketLibraryPage items={items} pageSize={1} state="ready" />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getAllByText('技术标案例讲解')).toHaveLength(1);
    await user.type(screen.getByRole('textbox', { name: '搜索行情库' }), '文档');
    expect(screen.getAllByText('投标文档指南')).toHaveLength(1);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('仅向管理员显示上传入口，且切换提交方式时使用固定内容区域', async () => {
    const user = userEvent.setup();
    const view = render(<BidMarketLibraryPage items={[]} state="unavailable" />);
    expect(screen.getByText('行情库服务暂未接入')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上传资料' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '资料标题' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '所属分类' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '录入时间' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '操作' })).toBeInTheDocument();

    view.rerender(<BidMarketLibraryPage canManage items={[]} state="unavailable" />);
    const uploadButton = screen.getByRole('button', { name: '上传资料' });
    expect(uploadButton).toBeEnabled();
    await user.click(uploadButton);
    const dialog = screen.getByRole('dialog', { name: '上传行情资料' });
    expect(within(dialog).getByRole('combobox', { name: '资料分类' })).toHaveValue('wechat-article');
    expect(within(dialog).getByRole('button', { name: '导入并解析' })).toBeDisabled();
    const modePanel = dialog.querySelector('.bid-market-upload__mode-panel');
    expect(modePanel).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: '文章或视频地址' }), 'https://example.com/article');
    expect(within(dialog).getByRole('button', { name: '导入并解析' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: '上传文件' }));
    expect(dialog.querySelector('.bid-market-upload__mode-panel')).toBe(modePanel);
    expect(within(dialog).getByRole('button', { name: '确认上传' })).toBeDisabled();
    expect(within(dialog).queryByText(/后端.*接口待接入/)).not.toBeInTheDocument();
  });

  it('submits selected files and fixed category through the provided upload handler', async () => {
    const user = userEvent.setup();
    const onUploadFiles = vi.fn().mockResolvedValue({ message: '后端已受理' });
    render(<BidMarketLibraryPage canManage items={[]} onUploadFiles={onUploadFiles} state="ready" />);
    await user.click(screen.getByRole('button', { name: '上传资料' }));
    const dialog = screen.getByRole('dialog', { name: '上传行情资料' });
    await user.click(within(dialog).getByRole('button', { name: '上传文件' }));
    const file = new File(['content'], 'policy.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText(/\u9009择文章/), file);
    await user.click(within(dialog).getByRole('button', { name: '确认上传' }));
    expect(onUploadFiles).toHaveBeenCalledWith([file], 'wechat-article');
    expect(await within(dialog).findByText('后端已受理')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认上传' })).toBeDisabled();
  });

  it('validates and submits an HTTP URL with the selected category', async () => {
    const user = userEvent.setup();
    const onImportUrl = vi.fn().mockResolvedValue({ message: '解析任务已创建' });
    render(<BidMarketLibraryPage canManage items={[]} onImportUrl={onImportUrl} state="ready" />);
    await user.click(screen.getByRole('button', { name: '上传资料' }));
    const dialog = screen.getByRole('dialog', { name: '上传行情资料' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '资料分类' }), 'wechat-video');
    await user.type(within(dialog).getByRole('textbox', { name: '文章或视频地址' }), 'https://example.com/post/1');
    await user.click(within(dialog).getByRole('button', { name: '导入并解析' }));
    expect(onImportUrl).toHaveBeenCalledWith({
      categoryId: 'wechat-video',
      url: 'https://example.com/post/1',
    });
    expect(await within(dialog).findByText('解析任务已创建')).toBeInTheDocument();
  });

  it('rejects unsafe URL protocols before calling the backend handler', async () => {
    const user = userEvent.setup();
    const onImportUrl = vi.fn();
    render(<BidMarketLibraryPage canManage items={[]} onImportUrl={onImportUrl} state="ready" />);
    await user.click(screen.getByRole('button', { name: '上传资料' }));
    const dialog = screen.getByRole('dialog', { name: '上传行情资料' });
    await user.type(within(dialog).getByRole('textbox', { name: '文章或视频地址' }), 'javascript:alert(1)');
    await user.click(within(dialog).getByRole('button', { name: '导入并解析' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('请输入有效的 HTTP 或 HTTPS 地址');
    expect(onImportUrl).not.toHaveBeenCalled();
  });

  it('clearly identifies mock data without changing its interaction behavior', () => {
    render(<BidMarketLibraryPage dataSource="mock" items={items} state="ready" />);
    expect(screen.getByText(/当前为 Mock 演示数据/)).toBeInTheDocument();
    expect(screen.getAllByText('电网投标政策解读')).toHaveLength(1);
  });

  it('在右侧预览区拦截不安全的预览地址', async () => {
    const user = userEvent.setup();
    const unsafeItem: BidMarketContent = {
      ...items[0],
      body: undefined,
      id: 'unsafe',
      previewUrl: 'javascript:alert(1)',
      title: '不安全地址资料',
    };
    render(<BidMarketLibraryPage items={[unsafeItem]} state="ready" />);

    await user.click(screen.getByRole('button', { name: '预览不安全地址资料' }));
    expect(screen.queryByTitle('不安全地址资料内容')).not.toBeInTheDocument();
    expect(screen.getByText('预览地址无效。')).toBeInTheDocument();
  });

  it('管理员可以看到删除操作，普通账号看不到', async () => {
    const user = userEvent.setup();
    const onDeleteContent = vi.fn().mockResolvedValue(undefined);
    const view = render(<BidMarketLibraryPage items={items} state="ready" />);
    expect(screen.queryByRole('button', { name: '删除电网投标政策解读' })).not.toBeInTheDocument();

    view.rerender(
      <BidMarketLibraryPage canManage items={items} onDeleteContent={onDeleteContent} state="ready" />,
    );
    await user.click(screen.getByRole('button', { name: '删除电网投标政策解读' }));
    const dialog = screen.getByRole('dialog', { name: '删除行情资料' });
    expect(within(dialog).getByText(/电网投标政策解读/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }));
    expect(onDeleteContent).toHaveBeenCalledWith('a1');
  });

  it('renders loading and error states without content cards', () => {
    const { rerender } = render(<BidMarketLibraryPage items={[]} state="loading" />);
    expect(screen.getByText('正在加载投标行情资料…')).toBeInTheDocument();
    rerender(<BidMarketLibraryPage errorMessage="接口超时" items={[]} state="error" />);
    expect(screen.getByText('接口超时')).toBeInTheDocument();
  });
});
