import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

function renderShell() {
  return render(
    <AppShell
      currentRoute="projects"
      eyebrow="测试工作台"
      enterpriseName="测试企业"
      onOpenTasks={vi.fn()}
      taskCount={0}
      title="项目列表"
      user={{ displayName: '测试用户', role: '投标经理' }}
    >
      <button type="button">页面操作</button>
    </AppShell>,
  );
}

describe('AppShell mobile navigation', () => {
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
});
