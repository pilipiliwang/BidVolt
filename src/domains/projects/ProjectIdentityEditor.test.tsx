import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectIdentityEditor } from './ProjectIdentityEditor';

describe('ProjectIdentityEditor', () => {
  it('keeps name, package number and deadline distinct, updating with parsed server props', () => {
    const { rerender } = render(<ProjectIdentityEditor projectTitle="电网采购项目" />);
    expect(screen.getByText('电网采购项目')).toBeInTheDocument();
    expect(screen.getAllByText('待解析')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<ProjectIdentityEditor projectTitle="电网采购项目" projectPackageNo="包 03" projectDeadline="2099-08-21 10:30" />);
    expect(screen.getByText('包 03')).toBeInTheDocument();
    expect(screen.getByText('2099-08-21 10:30')).toBeInTheDocument();
    expect(screen.queryByText('待解析')).not.toBeInTheDocument();
  });

  it('renames with one clear edit click and only announces success after the save promise resolves', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { rerender } = render(<ProjectIdentityEditor projectTitle="旧名称" onUpdateProjectDetails={save} />);
    await user.click(screen.getByRole('button', { name: '编辑项目名称' }));
    const input = screen.getByRole('textbox', { name: '项目名称' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, ' 新名称 ');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(save).toHaveBeenCalledWith({ title: '新名称' });
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '项目名称' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '编辑项目名称' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('form', { name: '修改项目名称' })).toBeInTheDocument();
    await act(async () => finish());
    rerender(<ProjectIdentityEditor projectTitle="新名称" onUpdateProjectDetails={save} />);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('项目名称已保存');
    expect(screen.getByRole('button', { name: '编辑项目名称' })).toHaveTextContent('新名称');
    expect(screen.getByRole('button', { name: '编辑项目名称' })).toHaveFocus();
  });

  it('keeps the editor in the header flow instead of rendering a floating dialog', async () => {
    const user = userEvent.setup();
    render(<ProjectIdentityEditor projectTitle="原名称" onUpdateProjectDetails={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '编辑项目名称' }));
    const form = screen.getByRole('form', { name: '修改项目名称' });
    expect(form).toHaveClass('project-identity__inline-editor');
    expect(form).not.toHaveClass('project-identity__editor');
  });

  it('provides a keyboard path for editing the package number without changing the tender number', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ProjectIdentityEditor projectTitle="项目" projectPackageNo="包 1" onUpdateProjectDetails={save} />);
    screen.getByRole('button', { name: '编辑包号' }).focus();
    await user.keyboard('{Enter}');
    const input = screen.getByRole('textbox', { name: '包号' });
    await user.clear(input);
    await user.type(input, '包 2');
    await user.keyboard('{Enter}');
    expect(save).toHaveBeenCalledWith({ packageNo: '包 2' });
  });

  it('allows a historical deadline correction and preserves the time on save', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ProjectIdentityEditor projectDeadline="2020-01-01 10:00" onUpdateProjectDetails={save} />);
    screen.getByRole('button', { name: '编辑截止时间' }).focus();
    await user.keyboard('{F2}');
    const editor = screen.getByRole('form', { name: '修改截止时间' });
    fireEvent.change(within(editor).getByLabelText('截止时间'), { target: { value: '2020-01-02T10:30' } });
    await user.click(within(editor).getByRole('button', { name: '保存修改' }));
    expect(save).toHaveBeenCalledWith({ deadline: '2020-01-02 10:30' });
  });

  it('retains failed edits for retry and never replaces the persisted display with an unsaved value', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue(new Error('保存未成功，请稍后重试'));
    render(<ProjectIdentityEditor projectTitle="原名称" onUpdateProjectDetails={save} />);
    await user.click(screen.getByRole('button', { name: '编辑项目名称' }));
    await user.clear(screen.getByRole('textbox', { name: '项目名称' }));
    await user.type(screen.getByRole('textbox', { name: '项目名称' }), '修改名称');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存未成功');
    expect(screen.queryByRole('button', { name: '编辑项目名称' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('修改名称');
    expect(screen.getByRole('button', { name: '保存修改' })).toBeEnabled();
  });

  it('cancels with Escape and restores focus without a backend request', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<ProjectIdentityEditor projectTitle="原名称" onUpdateProjectDetails={save} />);
    await user.click(screen.getByRole('button', { name: '编辑项目名称' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑项目名称' })).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });
});
