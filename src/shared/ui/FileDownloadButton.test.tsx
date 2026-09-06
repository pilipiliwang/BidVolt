import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFileUrl, FileDownloadButton } from './FileDownloadButton';

describe('FileDownloadButton', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('supports a short visible label with a descriptive accessible name', () => {
    render(<FileDownloadButton onDownload={vi.fn()} label="下载" ariaLabel="下载 评分响应记录.docx" />);
    expect(screen.getByRole('button', { name: '下载 评分响应记录.docx' })).toHaveTextContent(/^下载$/);
  });
  it('shows loading immediately and accepts only one request until the promise settles', async () => {
    let resolve!: () => void;
    const onDownload = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<FileDownloadButton onDownload={onDownload} label="下载全部标书成果" pendingLabel="正在打包下载…" />);
    const button = screen.getByRole('button', { name: '下载全部标书成果' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在打包下载…');
    await act(async () => resolve());
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('下载全部标书成果');
  });
  it('shows failures and allows an intentional retry', async () => {
    const onDownload = vi.fn().mockRejectedValueOnce(new Error('网络中断')).mockResolvedValue(undefined);
    render(<FileDownloadButton onDownload={onDownload} />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('网络中断');
    fireEvent.click(screen.getByRole('button'));
    await act(async () => {});
    expect(onDownload).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('downloads the fetched revision with the display name and cleans up its object URL', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['doc'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) }));
    const createObjectURL = vi.fn(() => 'blob:download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    await downloadFileUrl('http://localhost/files/file/versions/2', '补充文件.doc');
    expect(fetch).toHaveBeenCalledWith('http://localhost/files/file/versions/2', { cache: 'no-store' });
    expect(names).toEqual(['补充文件.docx']);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
  it('does not create an empty download for an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(downloadFileUrl('/files/f/versions/0', 'a.docx')).rejects.toThrow('503');
  });
});
