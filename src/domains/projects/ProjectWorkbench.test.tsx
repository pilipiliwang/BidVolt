import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectChatBar, ProjectSourceRail, type WorkspaceMaterial } from './ProjectWorkbench';

const projectMaterials: WorkspaceMaterial[] = [
  { id: 'project-1', name: '当前招标文件.pdf', status: '已识别', tone: 'blue' },
];

const enterpriseMaterials: WorkspaceMaterial[] = [
  { id: 'enterprise-1', name: '企业营业执照.pdf', status: '可复用', tone: 'green' },
];

describe('ProjectSourceRail', () => {
  it('exposes a clearly read-only control when upload handling is unavailable', () => {
    render(<ProjectSourceRail enterpriseMaterials={[]} materials={[]} />);

    expect(screen.getByText('当前招标材料（0项）')).toBeInTheDocument();
    expect(screen.queryByLabelText('招标文件')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加项目文件不可用' })).toBeDisabled();
  });

  it('keeps the real upload input when an upload handler is provided', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddFiles={onAddFiles}
      />,
    );

    const file = new File(['project'], '补遗文件.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('补充上传当前项目资料'), file);

    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('switches enterprise data in place without mixing it into project materials', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/projects/BV-2026-018/review');

    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddFiles={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: '当前招标材料' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('当前招标文件.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '企业资料' }));

    expect(window.location.pathname).toBe('/projects/BV-2026-018/review');
    expect(screen.getByRole('tab', { name: '企业资料' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('企业资料（1项）')).toBeInTheDocument();
    expect(screen.getByLabelText('企业营业执照.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('当前招标文件.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('缺失材料：')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '企业资料只读' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: '当前招标材料' }));
    expect(screen.getByLabelText('当前招标文件.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('企业营业执照.pdf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('补充上传当前项目资料')).toBeInTheDocument();
  });

  it('shows a dedicated empty state for the read-only enterprise source', async () => {
    const user = userEvent.setup();
    render(<ProjectSourceRail enterpriseMaterials={[]} materials={projectMaterials} />);

    await user.click(screen.getByRole('tab', { name: '企业资料' }));

    expect(screen.getByRole('status')).toHaveTextContent('企业资料库暂无可展示资料');
  });
});

describe('ProjectChatBar', () => {
  it('opens a project file input and dispatches selected files', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(<ProjectChatBar hint="提问" onAddFiles={onAddFiles} />);

    const input = screen.getByLabelText('添加当前项目文件') as HTMLInputElement;
    const inputClick = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: '添加文件' }));
    expect(inputClick).toHaveBeenCalledTimes(1);

    const file = new File(['attachment'], '任务附件.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(input, file);

    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('clearly disables file attachment without a project callback', () => {
    render(<ProjectChatBar hint="提问" />);

    expect(screen.getByRole('button', { name: '添加文件' })).toBeDisabled();
    expect(screen.queryByLabelText('添加当前项目文件')).not.toBeInTheDocument();
  });
});
