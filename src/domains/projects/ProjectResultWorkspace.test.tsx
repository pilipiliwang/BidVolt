import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { AgentRunViewModel } from '../../shared/task-events';
import { ProjectResultWorkspace } from './ProjectResultWorkspace';

const baseRun: AgentRunViewModel = {
  actionList: [],
  completion: 'active',
  conversation: [],
  errorMessage: null,
  message: '正在生成技术标',
  outcome: null,
  percent: 58,
  phase: '标书制作/审核',
  projectId: '207',
  questions: [],
  reason: null,
  sessionId: 'session-207',
  status: 'running',
  streamState: 'connected',
  taskId: '904',
};

function workspaceContent() {
  return {
    activity: <div>已保留的任务动态</div>,
    composer: <label>向 Agent 发送<input /></label>,
    rail: <nav aria-label="项目资源">成果文件夹</nav>,
  };
}

describe('ProjectResultWorkspace', () => {
  it('未选择文件时保持资源栏与任务上下文的双栏布局', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        resultsReady={false}
        task={{ message: '已创建编制计划', percent: 12, status: 'running', title: '创建计划' }}
      />,
    );

    const workspace = container.firstElementChild;
    expect(workspace).toHaveClass('project-result-workspace');
    expect(workspace).not.toHaveClass('project-result-workspace--preview');
    expect(screen.getByRole('navigation', { name: '项目资源' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'BidVolt 任务上下文' })).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByText('已保留的任务动态')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /BidVolt 上下文/ })).not.toBeInTheDocument();
  });

  it('选中成果文件后插入中间预览区并保留右侧上下文', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileWorkspace={<article>技术实施方案预览</article>}
        resultsReady
        task={{ message: '成果文件已返回', percent: 100, status: 'succeeded', title: '成果生成' }}
      />,
    );

    expect(container.firstElementChild).toHaveClass('project-result-workspace--preview');
    const preview = screen.getByRole('main');
    expect(within(preview).getByText('技术实施方案预览')).toBeInTheDocument();
    const context = screen.getByRole('region', { name: 'BidVolt 任务上下文', hidden: true });
    expect(context).toHaveAttribute('data-collapsed', 'false');
    expect(within(context).getByText('已保留的任务动态')).toBeInTheDocument();
    expect(within(context).getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起 BidVolt 上下文' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'BidVolt 区域' })).toContainElement(context);
  });

  it('预览时左右区域都可独立收起，预览关闭后恢复完整双栏', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileWorkspace={<div>商务文件预览</div>}
        run={baseRun}
      />,
    );

    await user.click(screen.getByRole('button', { name: '收起资料目录' }));
    await user.click(screen.getByRole('button', { name: '收起 BidVolt 上下文' }));
    expect(container.firstElementChild).toHaveClass('project-result-workspace--rail-collapsed');
    expect(container.firstElementChild).toHaveClass('project-result-workspace--context-collapsed');
    expect(screen.getByRole('button', { name: '展开资料目录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开 BidVolt 上下文' })).toBeInTheDocument();

    rerender(<ProjectResultWorkspace {...workspaceContent()} run={baseRun} />);
    expect(container.firstElementChild).not.toHaveClass('project-result-workspace--rail-collapsed');
    expect(container.firstElementChild).not.toHaveClass('project-result-workspace--context-collapsed');
  });

  it('完成态标记固定摘要布局，并把输入区保留在独立滚动区之外', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileCount={3}
        resultsReady
        run={{ ...baseRun, completion: 'complete', percent: 100, status: 'succeeded' }}
        task={{ message: '成果文件已返回', percent: 100, status: 'succeeded', title: '成果生成' }}
      />,
    );

    const context = screen.getByRole('region', { name: 'BidVolt 任务上下文' });
    expect(context).toHaveAttribute('data-layout', 'completion-summary');
    expect(context.querySelector('.project-result-workspace__activity')).toBeInTheDocument();
    expect(context.querySelector('.project-result-workspace__composer')).toContainElement(
      screen.getByRole('textbox'),
    );
    expect(container.firstElementChild).toHaveAttribute('data-result-state', 'complete');
  });

  it('函数摘要将完成状态与评分集成在同一顶部摘要中，不重复渲染状态', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileCount={9}
        resultsReady
        run={{ ...baseRun, completion: 'complete', percent: 100, status: 'succeeded' }}
        summary={(status) => <section aria-label="紧凑成果摘要">{status}<h2>评分结果</h2></section>}
      />,
    );

    expect(container.firstElementChild).toHaveClass('project-result-workspace--integrated-summary');
    expect(screen.getAllByRole('heading', { name: '成果生成已完成' })).toHaveLength(1);
    expect(screen.getAllByRole('progressbar', { name: '成果生成进度' })).toHaveLength(1);
    const summary = container.querySelector('.project-result-workspace__summary');
    expect(summary).toContainElement(screen.getByRole('status'));
    expect(summary).toContainElement(screen.getByRole('heading', { name: '评分结果' }));
    expect(screen.getByRole('status')).toHaveTextContent('9 份');
    expect(container.querySelector('.project-result-workspace__agent > .project-result-workspace__status'))
      .not.toBeInTheDocument();
  });

  it('上拉集成摘要时同时隐藏状态与评分，恢复后保持动态和输入 DOM 及草稿', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        resultsReady
        run={{ ...baseRun, completion: 'complete', percent: 100, status: 'succeeded' }}
        summary={(status) => <section>{status}<h2>评分结果</h2><p>响应记录文件</p></section>}
      />,
    );
    const activity = screen.getByText('已保留的任务动态');
    const textbox = screen.getByRole('textbox');
    const status = screen.getByRole('heading', { name: '成果生成已完成' });
    const score = screen.getByRole('heading', { name: '评分结果' });
    const record = screen.getByText('响应记录文件');
    await user.type(textbox, '仍在编辑的草稿');

    await user.click(screen.getByRole('button', { name: '将上下文记录上拉到顶部' }));
    expect(container.firstElementChild).toHaveClass('project-result-workspace--summary-collapsed');
    expect(status).not.toBeVisible();
    expect(score).not.toBeVisible();
    expect(record).not.toBeVisible();
    expect(screen.getByText('已保留的任务动态')).toBe(activity);
    expect(screen.getByRole('textbox')).toBe(textbox);
    expect(textbox).toHaveValue('仍在编辑的草稿');

    await user.click(screen.getByRole('button', { name: '恢复 BidVolt 状态与成果摘要' }));
    expect(status).toBeVisible();
    expect(score).toBeVisible();
    expect(record).toBeVisible();
    expect(screen.getByText('已保留的任务动态')).toBe(activity);
    expect(screen.getByRole('textbox')).toBe(textbox);
    expect(textbox).toHaveValue('仍在编辑的草稿');
  });

  it('保留普通 ReactNode 摘要的独立状态栏兼容用法', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        resultsReady
        run={{ ...baseRun, completion: 'complete', percent: 100, status: 'succeeded' }}
        summary={<h2>原有成果摘要</h2>}
      />,
    );

    expect(container.firstElementChild).not.toHaveClass('project-result-workspace--integrated-summary');
    expect(container.querySelector('.project-result-workspace__agent > .project-result-workspace__status'))
      .toContainElement(screen.getByRole('heading', { name: '成果生成已完成' }));
    expect(container.querySelector('.project-result-workspace__summary'))
      .toContainElement(screen.getByRole('heading', { name: '原有成果摘要' }));
  });

  it('可将上下文记录上拉到顶部并恢复状态与成果摘要', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        resultsReady
        run={{ ...baseRun, completion: 'complete', percent: 100, status: 'succeeded' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '将上下文记录上拉到顶部' }));
    expect(container.firstElementChild).toHaveClass('project-result-workspace--summary-collapsed');
    expect(screen.getByRole('region', { name: 'BidVolt 任务上下文' })).toHaveAttribute(
      'data-summary-collapsed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '恢复 BidVolt 状态与成果摘要' }));
    expect(container.firstElementChild).not.toHaveClass('project-result-workspace--summary-collapsed');
    expect(screen.getByRole('region', { name: 'BidVolt 任务上下文' })).toHaveAttribute(
      'data-summary-collapsed',
      'false',
    );
  });

  it('可收起右侧上下文，但不卸载原有动态和输入内容', async () => {
    const user = userEvent.setup();
    const run: AgentRunViewModel = {
      ...baseRun,
      questions: [{
        answer: null,
        answered: false,
        askId: 'ask-1',
        createdAt: '2026-09-04T10:00:00Z',
        items: [{ checked: '', need: '补充授权信息', question: '被授权人姓名是什么？' }],
        legacy: false,
        timeoutNotified: false,
        windowMinutes: 20,
      }],
    };
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileWorkspace={<div>商务文件预览</div>}
        run={run}
      />,
    );

    const textbox = screen.getByRole('textbox');
    await user.type(textbox, '我正在检查这份文件');
    await user.click(screen.getByRole('button', { name: '收起 BidVolt 上下文' }));

    const context = container.querySelector<HTMLElement>('.project-result-workspace__context');
    expect(context).toHaveAttribute('data-collapsed', 'true');
    expect(container.firstElementChild).toHaveClass('project-result-workspace--context-collapsed');
    expect(screen.getByText('已保留的任务动态')).toBeInTheDocument();
    expect(textbox).toHaveValue('我正在检查这份文件');
    const expand = screen.getByRole('button', { name: '展开 BidVolt 上下文' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(within(expand).getByText('1')).toBeInTheDocument();

    await user.click(expand);
    expect(context).toHaveAttribute('data-collapsed', 'false');
    expect(textbox).toHaveValue('我正在检查这份文件');
  });

  it('拖拽左右分隔条时遵守扩大的最小与最大宽度', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileWorkspace={<div>商务文件预览</div>}
        run={baseRun}
      />,
    );
    const workspace = container.firstElementChild as HTMLElement;
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 2_400 });

    const railResizer = screen.getByRole('separator', { name: '调整资料目录宽度' });
    Object.defineProperty(railResizer, 'setPointerCapture', { configurable: true, value: () => undefined });
    fireEvent.pointerDown(railResizer, { clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 2_000, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(workspace.style.getPropertyValue('--result-rail-width')).toBe('640px');

    Object.defineProperty(railResizer, 'setPointerCapture', { configurable: true, value: () => undefined });
    fireEvent.pointerDown(railResizer, { clientX: 640, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 0, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(workspace.style.getPropertyValue('--result-rail-width')).toBe('250px');

    const contextResizer = screen.getByRole('separator', { name: '调整 BidVolt 区域宽度' });
    Object.defineProperty(contextResizer, 'setPointerCapture', { configurable: true, value: () => undefined });
    fireEvent.pointerDown(contextResizer, { clientX: 1_800, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: 0, pointerId: 3 });
    fireEvent.pointerUp(window, { pointerId: 3 });
    expect(workspace.style.getPropertyValue('--result-context-width')).toBe('900px');

    Object.defineProperty(contextResizer, 'setPointerCapture', { configurable: true, value: () => undefined });
    fireEvent.pointerDown(contextResizer, { clientX: 900, pointerId: 4 });
    fireEvent.pointerMove(window, { clientX: 2_000, pointerId: 4 });
    fireEvent.pointerUp(window, { pointerId: 4 });
    expect(workspace.style.getPropertyValue('--result-context-width')).toBe('440px');
  });

  it('优先展示后端 run 返回的阶段、当前工作和进度', () => {
    const { container } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileCount={9}
        run={baseRun}
        task={{ message: '旧任务摘要', percent: 14, status: 'running', title: '旧阶段' }}
      />,
    );

    expect(screen.getByRole('heading', { name: '成果生成正在执行' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '成果生成进度' })).toHaveAttribute('aria-valuenow', '58');
    expect(screen.getByText('当前阶段').parentElement).toHaveTextContent('标书制作/审核');
    expect(screen.getByText('执行状态').parentElement).toHaveTextContent('执行中');
    expect(screen.getByText('成果文件').parentElement).toHaveTextContent('9 份');
    expect(screen.getByRole('status')).toHaveTextContent('正在生成技术标');
    expect(screen.getByRole('status')).not.toHaveTextContent('旧任务摘要');
    expect(container.firstElementChild).not.toHaveClass('project-result-workspace--integrated-summary');
    expect(container.querySelector('.project-result-workspace__summary')).not.toBeVisible();
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('任务已完成但成果尚未同步时保持 finalizing 状态', () => {
    const { container, rerender } = render(
      <ProjectResultWorkspace
        {...workspaceContent()}
        resultsReady={false}
        task={{ message: '生成任务已结束', percent: 100, status: 'succeeded', title: '成果生成' }}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute('data-result-state', 'finalizing');
    expect(screen.getByRole('heading', { name: '正在整理标书成果' })).toBeInTheDocument();
    expect(screen.getByText('执行状态').parentElement).toHaveTextContent('同步成果');
    expect(screen.getByText('成果文件').parentElement).toHaveTextContent('待同步');
    expect(screen.getByRole('status')).toHaveTextContent('正在等待后端同步可预览的成果文件');

    rerender(
      <ProjectResultWorkspace
        {...workspaceContent()}
        fileCount={4}
        resultsReady
        task={{ message: '成果文件已返回', percent: 100, status: 'succeeded', title: '成果生成' }}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-result-state', 'complete');
    expect(screen.getByRole('heading', { name: '成果生成已完成' })).toBeInTheDocument();
    expect(screen.getByText('成果文件').parentElement).toHaveTextContent('4 份');
  });
});
