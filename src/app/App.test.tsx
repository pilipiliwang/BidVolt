import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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

    await user.click(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    );
    await user.click(screen.getByRole('button', { name: /查看任务进度/ }));

    const taskDialog = screen.getByRole('dialog', { name: '任务进度' });
    expect(taskDialog).toBeInTheDocument();
    expect(within(taskDialog).getByText('正在核验技术方案中的引用位置')).toBeInTheDocument();
    expect(screen.queryByText(/tool_args/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal error/i)).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '任务进度' })).not.toBeInTheDocument();
  });

  it('does not carry an open task drawer into another project', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    );
    await user.click(screen.getByRole('button', { name: /查看任务进度/ }));
    expect(screen.getByRole('dialog', { name: '任务进度' })).toBeInTheDocument();

    act(() => {
      window.history.pushState(null, '', '/projects/BV-2026-015/overview');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.queryByRole('dialog', { name: '任务进度' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '当前页面没有项目任务' })).toBeDisabled();
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

  it('does not invent a default project context on global pages', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.queryByRole('link', { name: /评审中心/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /报价分析/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '当前页面没有项目任务' })).toBeDisabled();

    await user.click(screen.getByRole('link', { name: /企业资料/ }));
    expect(window.location.pathname).toBe('/enterprise-assets');
    expect(screen.queryByRole('link', { name: /评审中心/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /报价分析/ })).not.toBeInTheDocument();
  });

  it('keeps a project upload inside the current project and out of enterprise assets', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    );
    await user.click(screen.getByRole('link', { name: /打开项目材料/ }));

    expect(window.location.pathname).toBe('/projects/BV-2026-018/materials');
    const projectOnlyFile = new File(['project only'], '项目附件营业执照.pdf', {
      type: 'application/pdf',
    });
    await user.upload(
      screen.getByLabelText(/选择或拖拽招标材料/),
      projectOnlyFile,
    );
    expect(screen.getByText('项目附件营业执照.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /企业资料/ }));
    expect(window.location.pathname).toBe('/enterprise-assets');
    expect(screen.getByText(/此处上传的资料归企业所有/)).toBeInTheDocument();
    expect(screen.queryByText('项目附件营业执照.pdf')).not.toBeInTheDocument();
  });

  it('resets project-material view state when the route changes projects', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/projects/BV-2026-018/materials');
    renderApp();

    await user.click(screen.getByRole('button', { name: /Requirement/ }));
    expect(screen.getByRole('button', { name: /Requirement/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    act(() => {
      window.history.pushState(null, '', '/projects/BV-2026-015/materials');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.getByRole('button', { name: /材料与解析/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /Requirement/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('opens review and pricing as project-scoped web routes', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    );
    await user.click(screen.getByRole('link', { name: /评审中心/ }));
    expect(window.location.pathname).toBe('/projects/BV-2026-018/review');
    expect(screen.getByText('评审结果不会直接修改成果')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /受限规则代码/ }));
    await user.click(screen.getByRole('button', { name: '基于冻结快照运行评审' }));
    expect(screen.getByText('Provider 正在处理冻结快照，旧评审结果已从当前视图移除。')).toBeInTheDocument();
    expect(screen.queryByText('资质证书有效期覆盖不足')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /报价分析/ }));
    expect(window.location.pathname).toBe('/projects/BV-2026-018/pricing');
    expect(screen.getByText('外部历史库只读')).toBeInTheDocument();
  });

  it('does not carry a confirmed quote into another project', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole('link', { name: '进入海上平台电气设备采购项目工作台' }),
    );
    await user.click(screen.getByRole('link', { name: '查看报价测算' }));
    await user.click(screen.getByRole('button', { name: '应用到报价单并生成新版本' }));
    await user.click(screen.getByRole('button', { name: '确认生成新版本' }));
    expect(screen.getByRole('status')).toHaveTextContent('均衡策略');

    await user.click(screen.getByRole('link', { name: /投标项目/ }));
    await user.click(
      screen.getByRole('link', { name: '进入华南基地智能配电柜年度框架采购工作台' }),
    );
    await user.click(screen.getByRole('link', { name: /报价分析/ }));

    expect(window.location.pathname).toBe('/projects/BV-2026-015/pricing');
    expect(screen.queryByText(/已确认“均衡策略”/)).not.toBeInTheDocument();
    expect(screen.getByText('当前项目尚未查询历史样本或执行报价测算。')).toBeInTheDocument();
    expect(screen.queryByText('history-query-20260805-08')).not.toBeInTheDocument();
    expect(screen.queryByText('129600.00')).not.toBeInTheDocument();
  });

  it('does not expose or run another project review without a frozen snapshot', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole('link', { name: '进入华南基地智能配电柜年度框架采购工作台' }),
    );
    await user.click(screen.getByRole('link', { name: /评审中心/ }));

    expect(window.location.pathname).toBe('/projects/BV-2026-015/review');
    expect(screen.getByRole('button', { name: '基于冻结快照运行评审' })).toBeDisabled();
    expect(screen.getByText('请先冻结项目快照并生成至少一个成果版本。')).toBeInTheDocument();
    expect(screen.queryByText('资质证书有效期覆盖不足')).not.toBeInTheDocument();
  });
});
