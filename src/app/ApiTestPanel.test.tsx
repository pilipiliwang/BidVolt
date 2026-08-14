import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ApiTestPanel } from './ApiTestPanel';

describe('ApiTestPanel', () => {
  it('presents API diagnostics as an explicit test-only region', () => {
    render(
      <ApiTestPanel>
        <div>接口调用目录</div>
      </ApiTestPanel>,
    );

    expect(screen.getByRole('region', { name: 'API 联调测试框' })).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(screen.getByText('仅测试环境')).toBeInTheDocument();
    expect(screen.getByText('接口目录、调用结果与请求耗时，仅用于前后端联调')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起 API 联调测试框' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('接口调用目录')).toBeVisible();
  });

  it('collapses without unmounting or resetting the diagnostic controls', async () => {
    const user = userEvent.setup();
    render(
      <ApiTestPanel>
        <label>
          接口筛选
          <input type="search" />
        </label>
      </ApiTestPanel>,
    );

    const search = screen.getByRole('searchbox', { name: '接口筛选' });
    await user.type(search, 'tasks');
    await user.click(screen.getByRole('button', { name: '收起 API 联调测试框' }));

    expect(screen.getByRole('region', { name: 'API 联调测试框' })).toHaveAttribute(
      'data-expanded',
      'false',
    );
    expect(search).not.toBeVisible();
    expect(screen.getByRole('button', { name: '展开 API 联调测试框' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: '展开 API 联调测试框' }));
    expect(search).toBeVisible();
    expect(search).toHaveValue('tasks');
  });

  it('supports an initially collapsed shell', () => {
    render(
      <ApiTestPanel defaultExpanded={false}>
        <div>调用状态</div>
      </ApiTestPanel>,
    );

    expect(screen.getByText('调用状态')).not.toBeVisible();
    expect(screen.getByRole('button', { name: '展开 API 联调测试框' })).toBeInTheDocument();
  });
});
