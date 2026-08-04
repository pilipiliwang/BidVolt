import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

function renderApp() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App web shell', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/projects');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders and filters the project list', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      screen.getByRole('heading', { name: '把每次投标沉淀成清晰、可追溯的工作流' }),
    ).toBeInTheDocument();
    expect(screen.getByText('海上平台电气设备采购项目')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '搜索项目' }), '风电场');

    expect(screen.getByText('沿海风电场箱式变电站扩容工程')).toBeInTheDocument();
    expect(screen.queryByText('海上平台电气设备采购项目')).not.toBeInTheDocument();
  });

  it('navigates to a project overview without a routing dependency', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    );

    expect(window.location.pathname).toBe('/projects/BV-2026-018/overview');
    expect(screen.getByRole('heading', { name: '海上平台电气设备采购项目' })).toBeInTheDocument();
    expect(screen.getByText('从项目材料到最终交付')).toBeInTheDocument();
  });

  it('shows only public task progress in the task drawer', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /查看任务进度/ }));

    expect(screen.getByRole('dialog', { name: '任务进度' })).toBeInTheDocument();
    expect(screen.getByText('正在核验技术方案中的引用位置')).toBeInTheDocument();
    expect(screen.queryByText(/tool_args/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal error/i)).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '任务进度' })).not.toBeInTheDocument();
  });

  it('opens and closes the mobile navigation accessibly', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: '打开导航' }));
    expect(screen.getByLabelText('移动端导航')).toBeInTheDocument();

    await user.click(
      within(screen.getByLabelText('移动端导航')).getByRole('button', { name: '关闭导航' }),
    );
    expect(screen.queryByLabelText('移动端导航')).not.toBeInTheDocument();
  });
});
