import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('presents the real product workflow and routes every trial entry to login', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /从招标材料到标书成果.*让每一步都有依据/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '企业资料自动归类' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '本次材料严格隔离' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '评审机制不一定是文档' })).toBeInTheDocument();
    expect(screen.getByText(/外部历史数据库保持只读/)).toBeInTheDocument();

    const trialLinks = screen.getAllByRole('link', { name: /立即试用/ });
    expect(trialLinks.length).toBeGreaterThanOrEqual(3);
    trialLinks.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('offers accessible in-page navigation for the main product sections', () => {
    render(<LandingPage />);

    const navigation = screen.getByRole('navigation', { name: '产品导航' });
    expect(navigation).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: '产品能力' })).toHaveAttribute(
      'href',
      '#capabilities',
    );
    expect(within(navigation).getByRole('link', { name: '工作流程' })).toHaveAttribute(
      'href',
      '#workflow',
    );
    expect(within(navigation).getByRole('link', { name: '在线编辑' })).toHaveAttribute(
      'href',
      '#editor',
    );
    expect(within(navigation).getByRole('link', { name: '数据边界' })).toHaveAttribute(
      'href',
      '#boundaries',
    );
  });
});
