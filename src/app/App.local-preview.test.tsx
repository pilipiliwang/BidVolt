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
    localPreviewDeliverables: original.localPreviewDeliverables.map((deliverable) =>
      deliverable.deliverable_type === 2
        ? { ...deliverable, current_version_no: 0 }
        : deliverable),
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
    expect(testPanel).toHaveAttribute('data-expanded', 'false');
    const main = screen.getByRole('main');
    const diagnostics = screen.getByRole('region', { name: '页面联调诊断' });
    expect(main).toContainElement(testPanel);
    expect(main.lastElementChild).toBe(diagnostics);
    expect(diagnostics).toContainElement(testPanel);
    expect(screen.getByRole('button', { name: '展开 API 联调测试框' })).toBeInTheDocument();
    const apiPanel = testPanel.querySelector('[data-status="preview"]');
    expect(apiPanel).toBeInTheDocument();
    expect(apiPanel).toHaveTextContent('/auth/me');
    expect(apiPanel).toHaveTextContent('/projects');
    expect(fetchSpy).not.toHaveBeenCalled();

    const previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '企业资料' }));
    await user.click(await screen.findByRole('button', { name: /上传资料/ }));
    await user.upload(
      await screen.findByLabelText(/选择文件或拖拽到此处/),
      new File(['preview'], 'preview.pdf', { type: 'application/pdf' }),
    );

    const writeAlerts = await screen.findAllByRole('alert');
    expect(writeAlerts.some((alert) => alert.textContent?.includes('不会伪造成功结果'))).toBe(true);
    await user.click(screen.getByRole('button', { name: '关闭上传资料窗口' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15_000);

  it('keeps outcome scoring separate from the materials status metrics', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '进入本地只读预览' }));

    let previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '项目概览' }));

    expect(await screen.findByRole('heading', { name: '等待标书成果生成完成' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '模拟评标六项指标' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看任务进度，当前 0%' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看任务进度，当前 100%' }))
      .not.toBeInTheDocument();

    previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '招标材料' }));

    expect(await screen.findByRole('heading', { name: '成果生成正在执行' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '补充资料' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '当前招标材料' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/选择或拖拽招标材料/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '生成标书' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('添加当前项目文件')).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: '企业资料' }))
      .getByText('上传企业资料')).toBeInTheDocument();
    expect(screen.getByLabelText('上传企业资料并同步资料库')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('已有成果编制任务正在排队')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看任务进度' })).toBeInTheDocument();

    const reviewMetrics = screen.getByRole('list', { name: '模拟评标六项指标' });
    expect(within(reviewMetrics).getAllByRole('listitem')).toHaveLength(6);
    expect(within(reviewMetrics).getByText('已识别评分项').closest('[role="listitem"]'))
      .toHaveTextContent('0项');
    expect(within(reviewMetrics).getByText('商务标状态').closest('[role="listitem"]'))
      .toHaveTextContent('已生成当前版本 V2');
    expect(within(reviewMetrics).getByText('技术标状态').closest('[role="listitem"]'))
      .toHaveTextContent('执行中后端生成任务处理中');
    expect(within(reviewMetrics).getByText('技术标状态').closest('[role="listitem"]'))
      .toHaveAttribute('data-metric-state', 'in-progress');
    expect(within(reviewMetrics).getByText('报价单状态').closest('[role="listitem"]'))
      .toHaveTextContent('已生成当前版本 V1');
    expect(within(reviewMetrics).getAllByText('接口待提供')).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15_000);

  it('opens the bid market library with explicitly labelled mock data while APIs are missing', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '进入本地只读预览' }));

    const previewNavigation = screen.getByRole('navigation', { name: '预览页面快速导航' });
    await user.click(within(previewNavigation).getByRole('link', { name: '投标行情库' }));

    expect(await screen.findByRole('heading', { name: '投标行情库' })).toBeInTheDocument();
    expect(screen.getByText(/当前为 Mock 演示数据/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '标题' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /公众号文章/ })).toBeInTheDocument();
    expect(screen.getAllByText('电网投标政策重点解读')).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
