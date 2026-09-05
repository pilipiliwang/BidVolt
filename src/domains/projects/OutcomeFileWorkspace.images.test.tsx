import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutcomeFileWorkspace, type OutcomeWorkspaceFile } from './OutcomeFileWorkspace';

const file: OutcomeWorkspaceFile = {
  id: 'image-fixture', categoryId: 'business', categoryLabel: '商务文件', name: '证照.docx', kind: 'word', readOnly: true,
  wordDocument: { pages: [{ id: 'p1', blocks: [
    { id: 'i1', type: 'image', text: '证照图注', image: { src: 'https://example.test/license.png', alt: '营业执照', width: 600, height: 800 } },
  ] }] },
};

describe('Word preview images', () => {
  it('renders actual image resources and captions without an editable text wrapper', () => {
    render(<OutcomeFileWorkspace file={file} onClose={vi.fn()} />);
    const image = screen.getByRole('img', { name: '营业执照' });
    expect(image).toHaveAttribute('src', 'https://example.test/license.png');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(image.closest('figure')).not.toHaveAttribute('contenteditable');
    expect(screen.getByText('证照图注')).toBeVisible();
  });
  it('shows a clear failure where an image could not be loaded, instead of silently hiding it', () => {
    render(<OutcomeFileWorkspace file={file} onClose={vi.fn()} />);
    fireEvent.error(screen.getByRole('img', { name: '营业执照' }));
    expect(screen.getByText('图片加载失败，请下载原文件核对。')).toBeVisible();
    expect(screen.queryByRole('img', { name: '营业执照' })).not.toBeInTheDocument();
  });
  it('does not render unsafe image URLs even when a caller bypasses the adapter', () => {
    render(<OutcomeFileWorkspace file={{ ...file, id: 'bad-image', wordDocument: { pages: [{ id: 'p', blocks: [
      { id: 'bad', type: 'image', text: '', image: { src: 'javascript:alert(1)', alt: '非法图片' } },
    ] }] } }} onClose={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('预览未提供可访问的图片资源，请下载原文件核对。')).toBeVisible();
  });
});
