import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HistoryPricesPage } from './HistoryPricesPage';

describe('HistoryPricesPage', () => {
  it('renders a read-only query overview with statistics and records', () => {
    render(<HistoryPricesPage />);

    expect(screen.getByRole('heading', { name: '历史报价｜数据查询总览' })).toBeInTheDocument();
    expect(screen.getByLabelText('历史报价统计')).toHaveTextContent('1,268');
    expect(screen.getByRole('table')).toHaveTextContent('2024年配网设备协议库存招标');
    expect(screen.getByRole('table')).toHaveTextContent('12,850.00');
    expect(screen.queryByRole('button', { name: /新增|编辑|删除/ })).not.toBeInTheDocument();
  });

  it('filters records and switches to a trend detail without mutating history', async () => {
    const user = userEvent.setup();
    render(<HistoryPricesPage />);

    await user.type(screen.getByLabelText('招标人'), '浙江');
    await user.click(screen.getByRole('button', { name: '查询' }));

    const overviewTable = screen.getByRole('table');
    expect(within(overviewTable).getByText('国网浙江省电力')).toBeInTheDocument();
    expect(within(overviewTable).queryByText('国网江苏省电力')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2024年第二批配网设备采购' }));
    expect(screen.getByRole('heading', { name: '历史报价｜物料价格详情' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /10kV高压开关柜历史中标价趋势/ })).toBeInTheDocument();
    expect(screen.getByText('相似度说明')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '返回数据查询总览' }));
    expect(screen.getByRole('heading', { name: '历史报价｜数据查询总览' })).toBeInTheDocument();
  });

  it('applies the year filter and resets filtered queries to the first page', async () => {
    const user = userEvent.setup();
    render(<HistoryPricesPage />);

    await user.clear(screen.getByLabelText('年份'));
    await user.type(screen.getByLabelText('年份'), '2024');
    await user.click(screen.getByRole('button', { name: '查询' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('国网江苏省电力')).toBeInTheDocument();
    expect(within(table).getByText('国网浙江省电力')).toBeInTheDocument();
    expect(within(table).queryByText('国网山东省电力')).not.toBeInTheDocument();
    expect(screen.getByText('第 1 / 1 页')).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByLabelText('年份')).toHaveValue('2021—2024');
    expect(screen.getByText('第 1 / 2 页')).toHaveAttribute('aria-current', 'page');
  });

  it('paginates loaded records and returns to page one after querying', async () => {
    const user = userEvent.setup();
    render(<HistoryPricesPage />);

    const table = screen.getByRole('table');
    expect(screen.getByText('第 1 / 2 页')).toHaveAttribute('aria-current', 'page');
    expect(within(table).getByText('2024年配网设备协议库存招标')).toBeInTheDocument();
    expect(within(table).queryByText('2022年城市配网升级工程')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 2 / 2 页')).toHaveAttribute('aria-current', 'page');
    expect(within(table).getByText('2022年城市配网升级工程')).toBeInTheDocument();
    expect(within(table).queryByText('2024年配网设备协议库存招标')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('招标人'), '浙江');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(screen.getByText('第 1 / 1 页')).toHaveAttribute('aria-current', 'page');
    expect(within(table).getByText('国网浙江省电力')).toBeInTheDocument();
  });
});
