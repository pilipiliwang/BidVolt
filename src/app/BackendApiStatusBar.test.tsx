import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BackendApiStatusBar } from './BackendApiStatusBar';

describe('BackendApiStatusBar', () => {
  it('clearly identifies a successful call to the real backend', () => {
    render(
      <BackendApiStatusBar
        checkedAt="2026-08-14T02:42:11.000Z"
        endpointLabel="GET /api/v1/projects"
        latencyMs={87.4}
        status="connected"
      />,
    );

    const status = screen.getByRole('status', { name: '后端 API 调用测试状态' });
    expect(status).toHaveAttribute('data-status', 'connected');
    expect(screen.getByText('真实后端已连接')).toBeInTheDocument();
    expect(screen.getByText('真实 API')).toBeInTheDocument();
    expect(screen.getByText('最近一次 API 测试成功，当前页面将读取真实后端数据。')).toBeInTheDocument();
    expect(screen.getByText('GET /api/v1/projects')).toBeInTheDocument();
    expect(screen.getByText('87 ms')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('does not present preview fixtures as a successful backend connection', () => {
    render(<BackendApiStatusBar status="preview" />);

    expect(screen.getByText('本地只读预览')).toBeInTheDocument();
    expect(screen.getByText('预览数据')).toBeInTheDocument();
    expect(screen.getByText('当前显示本地预览数据，不代表真实后端接口已经连通。')).toBeInTheDocument();
    expect(screen.getByText('尚未检测')).toBeInTheDocument();
    expect(screen.queryByText('真实 API')).not.toBeInTheDocument();
  });

  it('runs a manual retest and reports the checking state accessibly', async () => {
    const user = userEvent.setup();
    const onRetest = vi.fn();
    const { rerender } = render(
      <BackendApiStatusBar onRetest={onRetest} status="disconnected" />,
    );

    await user.click(screen.getByRole('button', { name: '重新测试' }));
    expect(onRetest).toHaveBeenCalledOnce();

    rerender(
      <BackendApiStatusBar isRetesting onRetest={onRetest} status="checking" />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: '检测中…' })).toBeDisabled();
    expect(screen.getByText('正在向后端发送真实请求，请稍候。')).toBeInTheDocument();
  });

  it('supports a custom diagnostic message and ignores invalid latency values', () => {
    render(
      <BackendApiStatusBar
        className="page-api-status"
        latencyMs={Number.NaN}
        message="项目列表接口返回 503，请稍后重试。"
        status="degraded"
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('page-api-status');
    expect(screen.getByText('项目列表接口返回 503，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
