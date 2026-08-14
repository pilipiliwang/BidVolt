import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

vi.mock('./local-preview-gate', async (importOriginal) => {
  const original = await importOriginal<typeof import('./local-preview-gate')>();
  return { ...original, isLocalPreviewAvailable: () => true };
});

describe('App local read-only preview', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/login');
  });

  it('loads the isolated UI snapshot and blocks writes without making a fetch request', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '进入本地只读预览' }));

    expect(await screen.findByText('接口联调界面预览项目（非真实数据）')).toBeInTheDocument();
    expect(screen.getByLabelText('本地只读预览状态')).toHaveTextContent('无真实后端');
    expect(fetchSpy).not.toHaveBeenCalled();

    const previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '评审中心' }));
    await user.click(await screen.findByRole('button', { name: '基于冻结快照运行评审' }));

    const writeAlerts = await screen.findAllByRole('alert');
    expect(writeAlerts.some((alert) => alert.textContent?.includes('不会伪造成功结果'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
