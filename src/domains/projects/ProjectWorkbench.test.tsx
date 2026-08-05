import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectSourceRail } from './ProjectWorkbench';

describe('ProjectSourceRail', () => {
  it('exposes a clearly read-only control when upload handling is unavailable', () => {
    render(<ProjectSourceRail materials={[]} />);

    expect(screen.getByText('当前招标材料（0项）')).toBeInTheDocument();
    expect(screen.queryByLabelText('招标文件')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '只读 · 请到材料页上传' })).toBeDisabled();
  });

  it('keeps the real upload input when an upload handler is provided', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<ProjectSourceRail materials={[]} onUpload={onUpload} />);

    const file = new File(['project'], '补遗文件.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('补充上传当前项目资料'), file);

    expect(onUpload).toHaveBeenCalledWith([file]);
  });
});
