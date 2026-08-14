import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BackendApiStatusBar } from './BackendApiStatusBar';

describe('BackendApiStatusBar', () => {
  it('clearly identifies a successful call to the real backend', () => {
    render(
      <BackendApiStatusBar
        checkedAt="2026-08-14T02:42:11.000Z"
        checks={[
          {
            callCount: 3,
            feature: '项目列表',
            id: 'projects-list',
            lastCalledAt: '2026-08-14T02:40:00.000Z',
            method: 'GET',
            path: '/api/v1/projects',
            status: 'success',
            latencyMs: 42.2,
            trigger: '进入投标工作台',
          },
          {
            callCount: 1,
            detail: '服务返回 503',
            feature: '新增项目',
            id: 'projects-create',
            lastCalledAt: '2026-08-14T02:41:00.000Z',
            method: 'POST',
            path: '/api/v1/projects',
            status: 'failed',
            latencyMs: 121,
            trigger: '点击“创建并进入材料页”',
          },
          {
            callCount: 0,
            feature: '启动评审',
            id: 'reviews-list',
            method: 'GET',
            path: '/api/v1/reviews',
            status: 'not-run',
            trigger: '点击“创建模拟评审”',
          },
          {
            callCount: 0,
            feature: '需求确认',
            id: 'requirements-confirm',
            method: 'POST',
            path: '/api/v1/projects/{projectId}/requirements/confirm',
            status: 'unavailable',
            trigger: '点击“确认需求”',
          },
        ]}
        endpointLabel="GET /api/v1/projects"
        latencyMs={87.4}
        status="connected"
      />,
    );

    const status = screen.getByRole('status', { name: '后端 API 调用测试状态' });
    expect(status).toHaveAttribute('data-status', 'connected');
    expect(screen.getByText('API 调用测试')).toBeInTheDocument();
    expect(screen.getByText('API 调用成功')).toBeInTheDocument();
    expect(screen.getByText('真实 API')).toBeInTheDocument();
    expect(screen.getByText('测试请求已由真实后端成功响应，当前页面将读取真实后端数据。')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'API 接口调用明细' })).toBeInTheDocument();
    expect(screen.getByLabelText('接口调用状态汇总')).toBeInTheDocument();
    expect(screen.getByText('页面接口监控')).toBeInTheDocument();
    expect(screen.getByText('成功 1')).toBeInTheDocument();
    expect(screen.getByText('失败 1')).toBeInTheDocument();
    expect(screen.getByText('调用中 0')).toBeInTheDocument();
    expect(screen.getByText('未触发 1')).toBeInTheDocument();
    expect(screen.getByText('后端未提供 1')).toBeInTheDocument();
    expect(screen.getAllByText('/api/v1/projects')).toHaveLength(2);
    expect(screen.getByText('/api/v1/reviews')).toBeInTheDocument();
    expect(screen.getByText('调用成功')).toBeInTheDocument();
    expect(screen.getByText('调用失败')).toBeInTheDocument();
    expect(screen.getByText('未触发')).toBeInTheDocument();
    expect(screen.getByText('项目列表')).toBeInTheDocument();
    expect(screen.getByText('进入投标工作台')).toBeInTheDocument();
    expect(screen.getByText('3 次')).toBeInTheDocument();
    expect(screen.getByText('1 次')).toBeInTheDocument();
    expect(screen.getAllByText('0 次')).toHaveLength(2);
    expect(screen.getByText('未调用')).toBeInTheDocument();
    expect(screen.getByText('后端未提供')).toBeInTheDocument();
    expect(screen.getByText('无可用接口')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText('121 ms')).toBeInTheDocument();
    expect(screen.getByText('服务返回 503')).toBeInTheDocument();
    expect(screen.getByText('87 ms')).toBeInTheDocument();
    expect(screen.getAllByText(/2026/)).toHaveLength(3);
  });

  it('does not present preview fixtures as a successful backend connection', () => {
    render(<BackendApiStatusBar status="preview" />);

    expect(screen.getByText('API 未执行（本地预览）')).toBeInTheDocument();
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

  it('keeps the previous check shape renderable while monitoring fields migrate', () => {
    render(
      <BackendApiStatusBar
        checks={[
          {
            actualPath: '/api/v1/legacy?tenant=tenant-1',
            id: 'legacy-check',
            method: 'GET',
            path: '/api/v1/legacy',
            status: 'success',
          },
        ]}
        status="connected"
      />,
    );

    expect(screen.getByText('接口调用')).toBeInTheDocument();
    expect(screen.getByText('触发方式未标注')).toBeInTheDocument();
    expect(screen.getByText('1 次')).toBeInTheDocument();
    expect(screen.getByText('未记录')).toBeInTheDocument();
    expect(screen.getByText('/api/v1/legacy?tenant=tenant-1')).toBeInTheDocument();
    expect(screen.getByText('模板：/api/v1/legacy')).toBeInTheDocument();
  });
});
