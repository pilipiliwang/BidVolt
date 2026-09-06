import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

vi.mock('./api-test-panel-gate', () => ({
  shouldShowApiTestPanel: () => false,
}));

vi.mock('./local-preview-gate', async (importOriginal) => {
  const original = await importOriginal<typeof import('./local-preview-gate')>();
  return { ...original, isLocalPreviewAvailable: () => true };
});

describe('App API test panel integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/login');
  });

  it('hides the entire test panel without hiding business operation feedback', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '登录电网投标助手' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'API 联调测试框' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '进入本地只读预览' }));
    const previewNavigation = await screen.findByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '企业资料' }));
    await user.click(await screen.findByRole('button', { name: /上传资料/ }));
    await user.upload(
      await screen.findByLabelText(/选择文件或拖拽到此处/),
      new File(['preview'], 'preview.pdf', { type: 'application/pdf' }),
    );

    const feedback = await screen.findAllByText(
      '本地只读预览已阻止“上传企业资料”：没有连接真实后端，也不会伪造成功结果。',
    );
    expect(feedback.some((element) => element.closest('.integration-status')?.getAttribute('role') === 'alert'))
      .toBe(true);
    expect(screen.queryByRole('region', { name: 'API 联调测试框' })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
