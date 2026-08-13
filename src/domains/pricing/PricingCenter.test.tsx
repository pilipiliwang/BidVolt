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
      amount: '30200.00',
      currency: 'CNY',
      confidenceLow: '28800.00',
      confidenceHigh: '31600.00',
      predictedScore: '88.2',
      grossMargin: '11.26%',
      riskLevel: 'medium',
      recommended: true,
    },
  ],
};

describe('PricingCenter', () => {
  it('exposes a read-only history experience without CRUD or AI quote actions', () => {
    render(<PricingCenter calculation={calculated} materials={[]} samples={samples} />);

    expect(screen.getByText('外部历史库只读')).toBeInTheDocument();
    expect(screen.getByText('算法建议报价（元）')).toBeInTheDocument();
    expect(screen.getAllByText('30,200.00')).toHaveLength(2);
    expect(screen.getByText('28,800.00 ~ 31,600.00')).toBeInTheDocument();
    expect(screen.getByText('测算依据明细')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '历史样本价格趋势折线图' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新增历史/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除历史/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/AI 报价建议/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('已排除')).toBeInTheDocument();
  });

  it('requires explicit confirmation before applying a strategy', () => {
    const onApply = vi.fn();
    render(<PricingCenter calculation={calculated} materials={[]} onApply={onApply} samples={samples} />);

    fireEvent.click(screen.getByRole('button', { name: '应用到报价单并生成新版本' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('CNY 30,200.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认生成新版本' }));
    expect(onApply).toHaveBeenCalledWith('balanced');
  });

  it('derives the main quote, range, strategy card, and confirmation from the recommended strategy', () => {
    const calculationFromModel: QuoteCalculationView = {
      ...calculated,
      strategies: [
        {
          ...calculated.strategies[0],
          amount: '30345.67',
          confidenceLow: '29111.11',
          confidenceHigh: '32222.22',
        },
      ],
    };

    render(<PricingCenter calculation={calculationFromModel} materials={[]} samples={samples} />);

    expect(screen.getAllByText('30,345.67')).toHaveLength(2);
    expect(screen.getByText('29,111.11 ~ 32,222.22')).toBeInTheDocument();
    expect(screen.queryByText('30,200.00')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '应用到报价单并生成新版本' }));
    expect(screen.getByText('CNY 30,345.67')).toBeInTheDocument();
  });

  it('traps focus in the confirmation dialog and restores it after Escape or cancel', async () => {
    const user = userEvent.setup();
    render(<PricingCenter calculation={calculated} materials={[]} samples={samples} />);

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
    render(<PricingCenter calculation={calculated} materials={[]} samples={samples} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'IP42' } });

    expect(screen.getByText('IP42 / 380V')).toBeInTheDocument();
    expect(screen.queryAllByText('IP55 / 400V')).toHaveLength(1);
  });

  it.each([
    ['needs_input', '测算条件未满足'],
    ['insufficient_data', '无法可靠测算'],
  ] as const)(
    'withholds every calculated price and numeric metric while status is %s',
    (status, stateTitle) => {
      const unavailable: QuoteCalculationView = {
        ...calculated,
        status,
        message: '当前输入不足，暂不生成任何报价结果。',
      };

      render(<PricingCenter calculation={unavailable} materials={[]} samples={samples.slice(1)} />);

      expect(screen.getByText(stateTitle)).toBeInTheDocument();
      expect(screen.getByText('系统不会使用 AI 猜测任何报价数字。')).toBeInTheDocument();
      expect(screen.queryByText('当前材料（已选中）')).not.toBeInTheDocument();
      expect(screen.queryByText('高压开关柜（KYN28A-12）')).not.toBeInTheDocument();
      expect(screen.queryByText('10GY-DZ-006')).not.toBeInTheDocument();
      expect(screen.queryByText('KYN28A-12/1250A 31.5kA')).not.toBeInTheDocument();
      expect(screen.queryByText('当前报价（元）')).not.toBeInTheDocument();
      expect(screen.queryByText('30,000.00')).not.toBeInTheDocument();
      expect(screen.queryByText('算法建议报价（元）')).not.toBeInTheDocument();
      expect(screen.queryByText('30,200.00')).not.toBeInTheDocument();
      expect(screen.queryByText('建议范围（元）')).not.toBeInTheDocument();
      expect(screen.queryByText('28,800.00 ~ 31,600.00')).not.toBeInTheDocument();
      expect(screen.queryByText('测算依据明细')).not.toBeInTheDocument();
      expect(screen.queryByText('29,600.00')).not.toBeInTheDocument();
      expect(screen.queryByText('+1.20%')).not.toBeInTheDocument();
      expect(screen.queryByText('报价评分公式')).not.toBeInTheDocument();
      expect(screen.queryByText('88.2 / 100')).not.toBeInTheDocument();
      expect(screen.queryByText('11.26%')).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: '历史样本价格趋势折线图' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '应用到报价单并生成新版本' })).not.toBeInTheDocument();
    },
  );

  it('withholds the default material summary when a calculated result has no recommended strategy', () => {
    const withoutRecommendation: QuoteCalculationView = {
      ...calculated,
      strategies: calculated.strategies.map((strategy) => ({
        ...strategy,
        recommended: false,
      })),
    };

    render(<PricingCenter calculation={withoutRecommendation} materials={[]} samples={samples} />);

    expect(screen.getByText('测算条件未满足')).toBeInTheDocument();
    expect(screen.getByText('系统不会使用 AI 猜测任何报价数字。')).toBeInTheDocument();
    expect(screen.queryByText('当前材料（已选中）')).not.toBeInTheDocument();
    expect(screen.queryByText('高压开关柜（KYN28A-12）')).not.toBeInTheDocument();
    expect(screen.queryByText('10GY-DZ-006')).not.toBeInTheDocument();
    expect(screen.queryByText('KYN28A-12/1250A 31.5kA')).not.toBeInTheDocument();
    expect(screen.queryByText('当前报价（元）')).not.toBeInTheDocument();
    expect(screen.queryByText('30,000.00')).not.toBeInTheDocument();
    expect(screen.queryByText('算法建议报价（元）')).not.toBeInTheDocument();
    expect(screen.queryByText('测算依据明细')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '应用到报价单并生成新版本' })).not.toBeInTheDocument();
  });
});
