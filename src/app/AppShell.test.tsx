import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

function renderShell(onLogout = vi.fn()) {
  const result = render(
    <AppShell
      currentRoute="projects"
      eyebrow="测试工作台"
      enterpriseName="测试企业"
      onLogout={onLogout}
      onOpenTasks={vi.fn()}
      taskCount={0}
      title="项目列表"
      user={{ displayName: '测试用户', role: '投标经理' }}
    >
      <button type="button">页面操作</button>
    </AppShell>,
  );
  return { ...result, onLogout };
}

describe('AppShell mobile navigation', () => {
  it('uses the full product name in navigation branding', () => {
    renderShell();

    expect(screen.getAllByText('电网投标助手').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: '电网投标助手首页' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '历史报价' })).not.toBeInTheDocument();
  });

  it('moves focus into the dialog, traps it, hides the background, and restores the trigger on Escape', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const trigger = screen.getByRole('button', { name: '打开导航' });
    const desktopSidebar = container.querySelector<HTMLElement>('.desktop-sidebar')!;
    const pageBody = container.querySelector<HTMLElement>('.app-shell__body')!;
    const skipLink = container.querySelector<HTMLElement>('.skip-link')!;

    expect(within(desktopSidebar).getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(desktopSidebar).not.toHaveAttribute('inert');
    expect(pageBody).not.toHaveAttribute('aria-hidden');

    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '移动端导航' });
    const closeButton = within(dialog).getByRole('button', { name: '关闭导航' });
    expect(closeButton).toHaveFocus();
    expect(desktopSidebar).toHaveAttribute('inert');
    expect(desktopSidebar).toHaveAttribute('aria-hidden', 'true');
    expect(pageBody).toHaveAttribute('inert');
    expect(pageBody).toHaveAttribute('aria-hidden', 'true');
    expect(skipLink).toHaveAttribute('inert');
    expect(skipLink).toHaveAttribute('aria-hidden', 'true');

    const links = within(dialog).getAllByRole('link');
    const firstLink = links[0];
    const lastLink = links.at(-1)!;

    lastLink.focus();
    await user.tab();
    expect(firstLink).toHaveFocus();

    firstLink.focus();
    await user.tab({ shift: true });
    expect(lastLink).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '移动端导航' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(desktopSidebar).not.toHaveAttribute('inert');
    expect(desktopSidebar).not.toHaveAttribute('aria-hidden');
    expect(pageBody).not.toHaveAttribute('inert');
    expect(pageBody).not.toHaveAttribute('aria-hidden');
    expect(within(desktopSidebar).getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  });

  it('restores the mobile navigation trigger when the close button is used', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole('button', { name: '打开导航' });

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '移动端导航' });
    await user.click(within(dialog).getByRole('button', { name: '关闭导航' }));

    expect(screen.queryByRole('dialog', { name: '移动端导航' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens the sidebar account menu and signs out from the current demo session', async () => {
    const user = userEvent.setup();
    const { onLogout } = renderShell();
    const trigger = screen.getByRole('button', {
      name: '侧栏账户菜单，测试用户',
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: '测试用户的账户菜单' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByText('当前登录账户')).toBeInTheDocument();
    expect(within(menu).getByText('测试用户')).toBeInTheDocument();
    expect(within(menu).getByText('投标经理')).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: '退出登录' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: '测试用户的账户菜单' })).not.toBeInTheDocument();
  });

  it('keeps the account entry in the lower-left sidebar only and restores focus on Escape', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole('button', {
      name: '侧栏账户菜单，测试用户',
    });

    expect(screen.queryByRole('button', { name: '顶部账户菜单，测试用户' })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('menu', { name: '测试用户的账户菜单' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: '测试用户的账户菜单' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each(['enterprise-assets'] as const)(
    'removes project task progress and top account context from the %s global page',
    (currentRoute) => {
      render(
        <AppShell
          currentRoute={currentRoute}
          eyebrow="全局页面"
          enterpriseName="测试企业"
          onLogout={vi.fn()}
          onOpenTasks={vi.fn()}
          taskCount={2}
          title="全局页面"
          user={{ displayName: '测试用户', role: '投标经理' }}
        >
          <div>全局页面内容</div>
        </AppShell>,
      );

      expect(screen.queryByRole('button', { name: /查看任务进度/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '顶部账户菜单，测试用户' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '侧栏账户菜单，测试用户' })).toBeInTheDocument();
    },
  );
});
