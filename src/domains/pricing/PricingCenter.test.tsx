import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PricingCenter } from './PricingCenter';
import type { HistoryPriceSample, QuoteCalculationView } from './types';

const samples: HistoryPriceSample[] = [
  {
    id: 'sample-1',
    materialName: '智能控制柜',
    specification: 'IP55 / 400V',
    price: '126800.00',
    currency: 'CNY',
    taxIncluded: true,
    occurredAt: '2026-04-02',
    sourceLabel: '华东项目历史成交',
    usable: true,
  },
  {
    id: 'sample-2',
    materialName: '智能控制柜',
    specification: 'IP42 / 380V',
    price: '83000.00',
    currency: 'CNY',
    taxIncluded: false,
    occurredAt: '2023-01-12',
    sourceLabel: '历史样本',
    usable: false,
    excludedReason: '规格、税口径与时间差异过大',
  },
];

const calculated: QuoteCalculationView = {
  id: 'calc-01',
  status: 'calculated',
  algorithmVersion: 'quote-engine-2.4.0',
  sampleSnapshotId: 'sample-snapshot-08',
  querySnapshotId: 'query-snapshot-15',
  strategies: [
    {
      id: 'balanced',
      name: '均衡策略',
      description: '兼顾中标概率和目标毛利。',
      amount: '129600.00',
      currency: 'CNY',
      confidenceLow: '125000',
      confidenceHigh: '134200',
      recommended: true,
    },
  ],
};

describe('PricingCenter', () => {
  it('exposes a read-only history experience without CRUD or AI quote actions', () => {
    render(<PricingCenter calculation={calculated} samples={samples} />);

    expect(screen.getByText('外部历史库只读')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新增历史/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除历史/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/AI 报价建议/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('已排除')).toBeInTheDocument();
  });

  it('requires explicit confirmation before applying a strategy', () => {
    const onApply = vi.fn();
    render(<PricingCenter calculation={calculated} onApply={onApply} samples={samples} />);

    fireEvent.click(screen.getByRole('button', { name: '应用到报价单并生成新版本' }));
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认生成新版本' }));
    expect(onApply).toHaveBeenCalledWith('balanced');
  });

  it('traps focus in the confirmation dialog and restores it after Escape or cancel', async () => {
    const user = userEvent.setup();
    render(<PricingCenter calculation={calculated} samples={samples} />);

    const trigger = screen.getByRole('button', { name: '应用到报价单并生成新版本' });
    await user.click(trigger);

    let dialog = screen.getByRole('dialog', { name: '确认应用“均衡策略”' });
    const closeButton = within(dialog).getByRole('button', { name: '关闭确认' });
    const confirmButton = within(dialog).getByRole('button', { name: '确认生成新版本' });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = screen.getByRole('dialog', { name: '确认应用“均衡策略”' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('filters the read-only sample list without mutating it', () => {
    render(<PricingCenter calculation={calculated} samples={samples} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'IP42' } });

    expect(screen.getByText('IP42 / 380V')).toBeInTheDocument();
    expect(screen.queryByText('IP55 / 400V')).not.toBeInTheDocument();
  });

  it('does not render a price when reliable calculation is impossible', () => {
    const insufficient: QuoteCalculationView = {
      ...calculated,
      status: 'insufficient_data',
      message: '合格样本少于算法最低要求，请补充数据。',
      strategies: [],
    };

    render(<PricingCenter calculation={insufficient} samples={samples.slice(1)} />);

    expect(screen.getByText('无法可靠测算')).toBeInTheDocument();
    expect(screen.getByText('系统不会使用 AI 猜测任何报价数字。')).toBeInTheDocument();
    expect(screen.queryByText('129600.00')).not.toBeInTheDocument();
  });
});
