import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectRequirement } from '../types';
import { RequirementsPanel } from './RequirementsPanel';

const requirements: ProjectRequirement[] = [
  {
    id: 'requirement-1',
    type: 'qualification',
    title: '投标人资质等级',
    content: '投标人须具备电力工程施工总承包一级资质。',
    confidence: 0.64,
    confirmationStatus: 'needs_confirmation',
    revisionNo: 4,
    coordinate: {
      fileName: '招标文件.pdf',
      fileRevisionNo: 3,
      pageNo: 18,
    },
  },
];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('RequirementsPanel', () => {
  it('只读主流程保留原文依据，但不把未确认默认值变成用户审核任务', () => {
    const onConfirmRequirement = vi.fn();
    const onCorrectRequirement = vi.fn();
    render(
      <RequirementsPanel
        projectId="project-1"
        requirements={requirements}
        readOnly
        onConfirmRequirement={onConfirmRequirement}
        onCorrectRequirement={onCorrectRequirement}
      />,
    );
    expect(screen.getByRole('heading', { name: '招标要求' })).toBeInTheDocument();
    expect(screen.getByText('共 1 条要求')).toBeInTheDocument();
    expect(screen.getByText(/无需逐条审核/)).toBeInTheDocument();
    expect(screen.getByText(requirements[0].content)).toBeInTheDocument();
    expect(screen.getByText(/第 18 页/)).toBeInTheDocument();
    expect(screen.queryByText(/条待确认|全部已确认|确认状态未提供/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认原文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '纠正内容' })).not.toBeInTheDocument();
    expect(screen.getByText(requirements[0].title).closest('article')).not.toHaveClass('project-requirement--attention');
    expect(onConfirmRequirement).not.toHaveBeenCalled();
    expect(onCorrectRequirement).not.toHaveBeenCalled();
  });

  it('只读空列表不错误宣称全部已经确认', () => {
    render(<RequirementsPanel projectId="project-1" requirements={[]} readOnly />);
    expect(screen.getByText('共 0 条要求')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '尚未解析出招标要求' })).toBeInTheDocument();
    expect(screen.queryByText('全部已确认')).not.toBeInTheDocument();
  });

  it('等待异步确认并在请求期间防止重复提交', async () => {
    const user = userEvent.setup();
    const confirmation = deferred<void>();
    const onConfirmRequirement = vi.fn(() => confirmation.promise);

    render(
      <RequirementsPanel
        projectId="project-1"
        requirements={requirements}
        onConfirmRequirement={onConfirmRequirement}
      />,
    );

    await user.click(screen.getByRole('button', { name: '确认原文' }));

    const pendingButton = screen.getByRole('button', { name: '确认中…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    await user.click(pendingButton);
    expect(onConfirmRequirement).toHaveBeenCalledTimes(1);

    confirmation.resolve();
    expect(await screen.findByRole('button', { name: '确认原文' })).toBeEnabled();
  });

  it('捕获 CAS 冲突等确认失败、恢复按钮并允许重试', async () => {
    const user = userEvent.setup();
    const onConfirmRequirement = vi.fn()
      .mockRejectedValueOnce(new Error('Requirement 已被其他用户更新，请刷新后重试。'))
      .mockResolvedValueOnce(undefined);

    render(
      <RequirementsPanel
        projectId="project-1"
        requirements={requirements}
        onConfirmRequirement={onConfirmRequirement}
      />,
    );

    await user.click(screen.getByRole('button', { name: '确认原文' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '确认失败：Requirement 已被其他用户更新，请刷新后重试。',
    );
    const retryButton = screen.getByRole('button', { name: '确认原文' });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);
    expect(onConfirmRequirement).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('纠正 Requirement 内容时等待异步保存并防止重复提交', async () => {
    const user = userEvent.setup();
    const correction = deferred<void>();
    const onCorrectRequirement = vi.fn(() => correction.promise);

    render(
      <RequirementsPanel
        projectId="project-1"
        requirements={requirements}
        onCorrectRequirement={onCorrectRequirement}
      />,
    );

    await user.click(screen.getByRole('button', { name: '纠正内容' }));
    const editor = screen.getByRole('textbox', { name: '纠正后内容' });
    expect(editor).toHaveValue(requirements[0].content);
    await user.clear(editor);
    await user.type(editor, '  投标人须具备电力工程施工总承包二级资质。  ');
    await user.click(screen.getByRole('button', { name: '保存纠正' }));

    const pendingButton = screen.getByRole('button', { name: '保存中…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '确认原文' })).toBeDisabled();
    await user.click(pendingButton);
    expect(onCorrectRequirement).toHaveBeenCalledTimes(1);
    expect(onCorrectRequirement).toHaveBeenCalledWith(
      'project-1',
      'requirement-1',
      '投标人须具备电力工程施工总承包二级资质。',
    );

    correction.resolve();
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: '纠正后内容' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '纠正内容' })).toBeEnabled();
  });

  it('保留纠正失败的草稿供重试，并允许用户取消', async () => {
    const user = userEvent.setup();
    const onCorrectRequirement = vi.fn()
      .mockRejectedValueOnce(new Error('Requirement 修订版本已过期。'));

    render(
      <RequirementsPanel
        projectId="project-1"
        requirements={requirements}
        onCorrectRequirement={onCorrectRequirement}
      />,
    );

    await user.click(screen.getByRole('button', { name: '纠正内容' }));
    const editor = screen.getByRole('textbox', { name: '纠正后内容' });
    await user.clear(editor);
    await user.click(screen.getByRole('button', { name: '保存纠正' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请输入纠正后的 Requirement 内容。',
    );
    expect(onCorrectRequirement).not.toHaveBeenCalled();

    await user.type(editor, '修订后的资质要求。');
    await user.click(screen.getByRole('button', { name: '保存纠正' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '纠正失败：Requirement 修订版本已过期。',
    );
    expect(editor).toHaveValue('修订后的资质要求。');

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('textbox', { name: '纠正后内容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
