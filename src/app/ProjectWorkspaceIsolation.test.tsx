import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

function renderAppAt(pathname: string) {
  window.history.replaceState(null, '', pathname);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

function navigateTo(pathname: string) {
  act(() => {
    window.history.pushState(null, '', pathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

describe('project workspace isolation', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the 0802 workspace materials and overview result on its owning project', () => {
    renderAppAt('/projects/BV-2026-018/overview');

    const sourceRail = screen.getByRole('complementary', { name: '项目资料' });
    expect(within(sourceRail).getByText('当前招标材料（12项）')).toBeInTheDocument();
    expect(within(sourceRail).getByLabelText('招标文件')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '综合得分 91.4 分' })).toBeInTheDocument();
  });

  it.each(['overview', 'review', 'pricing'] as const)(
    'does not leak default-project materials into BV-2026-015 %s',
    (section) => {
      renderAppAt(`/projects/BV-2026-015/${section}`);

      const sourceRail = screen.getByRole('complementary', { name: '项目资料' });
      expect(within(sourceRail).getByText('当前招标材料（0项）')).toBeInTheDocument();
      expect(within(sourceRail).queryByLabelText('招标文件')).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: '综合得分 91.4 分' })).not.toBeInTheDocument();

      if (section === 'overview') {
        expect(screen.getByText('项目成果尚未生成')).toBeInTheDocument();
        expect(screen.getByText('暂无模拟得分')).toBeInTheDocument();
      }
    },
  );

  it('keeps a default-project upload across its workspace without leaking it to another project', async () => {
    const user = userEvent.setup();
    renderAppAt('/projects/BV-2026-018/materials');

    const upload = new File(['scope-isolated'], '跨页隔离测试附件.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText(/选择或拖拽招标材料/), upload);

    for (const section of ['overview', 'review', 'pricing'] as const) {
      navigateTo(`/projects/BV-2026-018/${section}`);

      const sourceRail = screen.getByRole('complementary', { name: '项目资料' });
      expect(within(sourceRail).getByText('当前招标材料（13项）')).toBeInTheDocument();
      expect(within(sourceRail).getByLabelText('跨页隔离测试附件.pdf')).toBeInTheDocument();
    }

    navigateTo('/projects/BV-2026-015/overview');
    const otherProjectRail = screen.getByRole('complementary', { name: '项目资料' });
    expect(within(otherProjectRail).getByText('当前招标材料（0项）')).toBeInTheDocument();
    expect(
      within(otherProjectRail).queryByLabelText('跨页隔离测试附件.pdf'),
    ).not.toBeInTheDocument();
  });
});
