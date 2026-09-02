import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BidMarketLibraryPage } from './BidMarketLibraryPage';
import type { BidMarketContent } from './types';

const categories = [{ id: 'policy', label: '政策解读' }, { id: 'case', label: '项目案例' }];
const items: BidMarketContent[] = [
  { id: 'a1', title: '电网投标政策解读', kind: 'article', categoryId: 'policy', categoryLabel: '政策解读', summary: '政策摘要', source: '行业协会', body: '文章正文' },
  { id: 'v1', title: '技术标案例讲解', kind: 'video', categoryId: 'case', categoryLabel: '项目案例', summary: '视频课程' },
  { id: 'd1', title: '投标文档指南', kind: 'document', categoryId: 'policy', categoryLabel: '政策解读', summary: '文档摘要' },
];

describe('BidMarketLibraryPage', () => {
  it('filters prop-provided content and previews the selected item', async () => {
    const user = userEvent.setup();
    render(<BidMarketLibraryPage categories={categories} items={items} state="ready" />);
    expect(screen.getAllByText('电网投标政策解读')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /项目案例/ }));
    expect(screen.getAllByText('技术标案例讲解')).toHaveLength(2);
    expect(screen.queryByText('投标文档指南')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '预览技术标案例讲解' }));
    expect(screen.getByText('技术标案例讲解', { selector: '.bid-market-library__preview-summary h3' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开预览' }));
    expect(screen.getByRole('dialog', { name: '技术标案例讲解预览' })).toHaveTextContent('暂无可预览内容');
  });

  it('searches and paginates without adding fallback data', async () => {
    const user = userEvent.setup();
    render(<BidMarketLibraryPage categories={categories} items={items} pageSize={1} state="ready" />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getAllByText('技术标案例讲解')).toHaveLength(2);
    await user.type(screen.getByRole('textbox', { name: '搜索行情库' }), '文档');
    expect(screen.getAllByText('投标文档指南')).toHaveLength(2);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('keeps the full unavailable layout and explains why upload submission is disabled', async () => {
    const user = userEvent.setup();
    render(<BidMarketLibraryPage categories={[]} items={[]} state="unavailable" />);
    expect(screen.getByText('行情库服务暂未接入')).toBeInTheDocument();
    const uploadButton = screen.getByRole('button', { name: '上传资料' });
    expect(uploadButton).toBeEnabled();
    expect(screen.getByRole('columnheader', { name: '标题' })).toBeInTheDocument();
    expect(screen.queryByText('示例行情')).not.toBeInTheDocument();
    await user.click(uploadButton);
    const dialog = screen.getByRole('dialog', { name: '上传行情资料' });
    expect(within(dialog).getByText('后端上传接口暂未可用。')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认上传' })).toBeDisabled();
  });

  it('submits selected files and category through the provided upload handler', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({ message: '后端已受理' });
    render(<BidMarketLibraryPage categories={categories} items={[]} onUpload={onUpload} state="ready" />);
    await user.click(screen.getByRole('button', { name: '上传资料' }));
    const dialog = screen.getByRole('dialog', { name: '上传行情资料' });
    const file = new File(['content'], 'policy.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText(/\u9009择文章/), file);
    await user.click(within(dialog).getByRole('button', { name: '确认上传' }));
    expect(onUpload).toHaveBeenCalledWith([file], 'policy');
    expect(await within(dialog).findByText('后端已受理')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认上传' })).toBeDisabled();
  });

  it('blocks unsafe preview URLs and restores focus when the dialog closes', async () => {
    const user = userEvent.setup();
    const unsafeItem: BidMarketContent = {
      ...items[0],
      body: undefined,
      id: 'unsafe',
      previewUrl: 'javascript:alert(1)',
      title: '不安全地址资料',
    };
    render(<BidMarketLibraryPage categories={categories} items={[unsafeItem]} state="ready" />);

    const trigger = screen.getByRole('button', { name: '打开预览' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '不安全地址资料预览' });
    expect(within(dialog).queryByTitle('不安全地址资料内容')).not.toBeInTheDocument();
    expect(within(dialog).getByText('服务端返回的预览地址无效。')).toBeInTheDocument();
    const closeButton = within(dialog).getByRole('button', { name: '关闭资料预览' });
    expect(closeButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '不安全地址资料预览' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders loading and error states without content cards', () => {
    const { rerender } = render(<BidMarketLibraryPage categories={[]} items={[]} state="loading" />);
    expect(screen.getByText('正在加载投标行情资料…')).toBeInTheDocument();
    rerender(<BidMarketLibraryPage categories={[]} errorMessage="接口超时" items={[]} state="error" />);
    expect(screen.getByText('接口超时')).toBeInTheDocument();
  });
});
