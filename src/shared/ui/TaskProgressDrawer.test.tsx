import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PublicTaskEvent } from '../task-events';
import { TaskProgressDrawer } from './TaskProgressDrawer';

const publicEvents: PublicTaskEvent[] = [
  {
    schema_version: '1',
    event_id: 'event-private-1',
    sequence: 1,
    task_id: 'task-private-1',
    project_id: 'project-private-1',
    phase: 'checking',
    status: 'running',
    percent: 72,
    public_message: '正在核验技术方案中的引用位置',
    error_code: null,
    occurred_at: '2026-08-05T14:32:00+08:00',
    result_refs: { deliverable_ids: ['internal-result-1'] },
  },
];

function DrawerHarness({ events = publicEvents }: { events?: PublicTaskEvent[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        查看任务进度
      </button>
      <TaskProgressDrawer
        events={events}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectTitle="海上平台电气设备采购项目"
      />
    </>
  );
}

describe('TaskProgressDrawer', () => {
  it('renders only the public event display fields without the active project summary card', () => {
    render(
      <TaskProgressDrawer
        events={publicEvents}
        isOpen
        onClose={() => undefined}
        projectTitle="海上平台电气设备采购项目"
      />,
    );

    expect(screen.queryByText('海上平台电气设备采购项目')).not.toBeInTheDocument();
    expect(screen.getByText('checking')).toBeInTheDocument();
    expect(screen.getByText('正在核验技术方案中的引用位置')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.tagName === 'SMALL' && element.textContent?.includes('72%') === true),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-08-05T14:32:00+08:00')).toBeInTheDocument();
    expect(screen.queryByText('task-private-1')).not.toBeInTheDocument();
    expect(screen.queryByText('project-private-1')).not.toBeInTheDocument();
    expect(screen.queryByText('event-private-1')).not.toBeInTheDocument();
    expect(screen.queryByText('internal-result-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: '任务进度' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '关闭任务进度' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '任务当前状态' })).toBeInTheDocument();
    expect(screen.getByText(/每一行代表一个独立任务/)).toBeInTheDocument();
  });

  it('shows an empty state when no public events are available', () => {
    render(
      <TaskProgressDrawer
        events={[]}
        isOpen
        onClose={() => undefined}
        projectTitle="空任务项目"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('暂无公开进度');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('traps focus, closes with Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: '查看任务进度' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '任务进度' });
    const closeButton = within(dialog).getByRole('button', { name: '关闭任务进度' });
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '任务进度' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
