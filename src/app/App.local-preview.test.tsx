import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

vi.mock('./local-preview-gate', async (importOriginal) => {
  const original = await importOriginal<typeof import('./local-preview-gate')>();
  return { ...original, isLocalPreviewAvailable: () => true };
});

vi.mock('./local-preview', async (importOriginal) => {
  const original = await importOriginal<typeof import('./local-preview')>();
  const baseTask = original.localPreviewTasks[0];
  return {
    ...original,
    localPreviewTasks: [
      {
        ...baseTask,
        event_id: 'preview-bid-task-event',
        sequence: 2,
        task_id: 'preview-bid-task',
        task_type: 'bid_generate',
        phase: 'generate_sections',
        status: 'queued',
        percent: 0,
        public_message: '已有成果编制任务正在排队',
      },
      {
        ...baseTask,
        event_id: 'preview-parse-task-event',
        sequence: 3,
        task_id: 'preview-parse-task',
        task_type: 'tender_parse',
        phase: 'tender_parse',
        status: 'failed',
        percent: 100,
        public_message: '较新的材料解析任务不应控制成果提交区',
      },
    ],
  };
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
    const testPanel = screen.getByRole('region', { name: 'API 联调测试框' });
    expect(testPanel).toHaveTextContent('仅测试环境');
    const appShell = document.querySelector('.app-shell');
    expect(appShell).not.toBeNull();
    expect(testPanel.compareDocumentPosition(appShell!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const apiPanel = testPanel.querySelector('[data-status="preview"]');
    expect(apiPanel).toBeInTheDocument();
    expect(apiPanel).toHaveTextContent('/auth/me');
    expect(apiPanel).toHaveTextContent('/projects');
    expect(fetchSpy).not.toHaveBeenCalled();

    const previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '评审中心' }));
    await user.click(await screen.findByRole('button', { name: '基于冻结快照运行评审' }));

    const writeAlerts = await screen.findAllByRole('alert');
    expect(writeAlerts.some((alert) => alert.textContent?.includes('不会伪造成功结果'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes the latest generation task into the materials page and prevents duplicate submission', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '进入本地只读预览' }));

    const previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '招标材料' }));

    const taskCard = await screen.findByRole('status', { name: '本次任务状态：任务已提交' });
    expect(taskCard).toHaveAttribute('data-task-status', 'queued');
    expect(taskCard).toHaveTextContent('已有成果编制任务正在排队');
    expect(screen.queryByLabelText(/选择或拖拽招标材料/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '生成标书' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('补充上传当前项目资料')).toBeInTheDocument();

    await user.click(within(taskCard).getByRole('button', { name: '查看任务进度' }));
    expect(screen.getByRole('dialog', { name: '任务进度' })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
