import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HistoryPricesPage } from './HistoryPricesPage';
import type { HistoricalQuoteRecord } from './types';

const records: HistoricalQuoteRecord[] = [
  {
    id: 'record-1', projectName: '2024年配网设备协议库存招标', tenderer: '国网江苏省电力', year: 2024,
    packageName: '开关柜 / 包1', materialName: '10kV高压开关柜', materialCode: '03010101',
    specification: 'KYN28A-12', region: '江苏', quantity: 120, supplier: '江苏华成电气',
    unitPrice: 12850, taxRate: '13%', awardedAt: '2024-05-18', source: '公开公告',
    parameterDifference: '完全一致', similarity: 'high',
  },
  {
    id: 'record-2', projectName: '2024年第二批配网设备采购', tenderer: '国网浙江省电力', year: 2024,
    packageName: '开关柜 / 包2', materialName: '10kV高压开关柜', materialCode: '03010101',
    specification: 'KYN28A-12', region: '浙江', quantity: 80, supplier: '浙江森源电气',
    unitPrice: 12600, taxRate: '13%', awardedAt: '2024-04-20', source: '公开公告',
    parameterDifference: '完全一致', similarity: 'high',
  },
  {
    id: 'record-3', projectName: '2023年配网物资框架项目', tenderer: '国网山东省电力', year: 2023,
    packageName: '开关柜 / 包1', materialName: '10kV高压开关柜', materialCode: '03010101',
    specification: 'KYN28A-12', region: '山东', quantity: 100, supplier: '山东鲁能电气',
    unitPrice: 12300, taxRate: '13%', awardedAt: '2023-11-15', source: '企业历史',
    parameterDifference: '额定电流差异', similarity: 'partial',
  },
  {
    id: 'record-4', projectName: '2023年配网自动化改造项目', tenderer: '国网安徽省电力', year: 2023,
    packageName: '开关柜 / 包1', materialName: '10kV高压开关柜', materialCode: '03010101',
    specification: 'KYN28A-12', region: '安徽', quantity: 60, supplier: '安徽合众电气',
    unitPrice: 11980, taxRate: '13%', awardedAt: '2023-09-26', source: '公开公告',
    parameterDifference: '短路参数差异', similarity: 'partial',
  },
  {
    id: 'record-5', projectName: '2023年配电站房建设项目', tenderer: '国网湖北省电力', year: 2023,
    packageName: '开关柜 / 包1', materialName: '10kV高压开关柜', materialCode: '03010101',
    specification: 'KYN28A-12', region: '湖北', quantity: 90, supplier: '湖北长江电气',
    unitPrice: 12190, taxRate: '13%', awardedAt: '2023-08-10', source: '公开公告',
    parameterDifference: '完全一致', similarity: 'high',
  },
  {
    id: 'record-6', projectName: '2022年城市配网升级工程', tenderer: '国网上海市电力', year: 2022,
    packageName: '开关柜 / 包1', materialName: '10kV高压开关柜', materialCode: '03010101',
    specification: 'KYN28A-12', region: '上海', quantity: 45, supplier: '上海华通电气',
    unitPrice: 12420, taxRate: '13%', awardedAt: '2022-12-08', source: '企业历史',
    parameterDifference: '应用场景差异', similarity: 'reference',
  },
];

function renderHistory() {
  return render(<HistoryPricesPage records={records} totalCount={1268} />);
}

describe('HistoryPricesPage', () => {
  it('renders a read-only query overview with statistics and records', () => {
    renderHistory();

    expect(screen.getByRole('heading', { name: '历史报价｜数据查询总览' })).toBeInTheDocument();
    expect(screen.getByLabelText('历史报价统计')).toHaveTextContent('历史样本数量6');
    expect(screen.getByRole('table')).toHaveTextContent('2024年配网设备协议库存招标');
    expect(screen.getByRole('table')).toHaveTextContent('12,850.00');
    expect(screen.queryByRole('button', { name: /新增|编辑|删除/ })).not.toBeInTheDocument();
  });

  it('filters records and switches to a trend detail without mutating history', async () => {
    const user = userEvent.setup();
    renderHistory();

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
    renderHistory();

    await user.clear(screen.getByLabelText('年份'));
    await user.type(screen.getByLabelText('年份'), '2024');
    await user.click(screen.getByRole('button', { name: '查询' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('国网江苏省电力')).toBeInTheDocument();
    expect(within(table).getByText('国网浙江省电力')).toBeInTheDocument();
    expect(within(table).queryByText('国网山东省电力')).not.toBeInTheDocument();
    expect(screen.getByText('第 1 / 1 页')).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByLabelText('年份')).toHaveValue('');
    expect(screen.getByText('第 1 / 2 页')).toHaveAttribute('aria-current', 'page');
  });

  it('paginates loaded records and returns to page one after querying', async () => {
    const user = userEvent.setup();
    renderHistory();

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
