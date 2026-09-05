import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalPackagePreview,
  loadLocalPackageModel,
  parseLocalPackage,
  type LocalPackageManifest,
} from './LocalPackagePreview';
import { ProjectMaterialsPage } from '../ProjectMaterialsPage';

const manifest: LocalPackageManifest = {
  projectId: '207', taskId: '3499', source: '项目-207-最终响应文件包.zip',
  files: [
    { id: 'file-1', name: '授权委托书.docx', category: 'business', extension: '.docx', size: 25067 },
    { id: 'file-5', name: '技术偏差表.docx', category: 'technical', extension: '.docx', size: 25182 },
    { id: 'file-9', name: '报价单.xlsx', category: 'price', extension: '.xlsx', size: 7950 },
  ],
};
afterEach(() => vi.unstubAllGlobals());

describe('local response package preview', () => {
  it('requires exact project/task identity and rejects unsafe file descriptors', () => {
    expect(parseLocalPackage(manifest, '207', '3499')).toEqual(manifest);
    expect(parseLocalPackage(manifest, '206', '3499')).toBeNull();
    expect(parseLocalPackage(manifest, '207', '3500')).toBeNull();
    expect(parseLocalPackage(manifest, '207')).toBeNull();
    expect(parseLocalPackage({ ...manifest, files: [{ ...manifest.files[0], id: '../secret' }] }, '207', '3499')).toBeNull();
    expect(parseLocalPackage({ ...manifest, files: [{ ...manifest.files[0], category: 'internal' }] }, '207', '3499'))
      .toEqual(expect.objectContaining({ files: [expect.objectContaining({ category: 'internal' })] }));
    expect(parseLocalPackage({ ...manifest, files: [{ ...manifest.files[0], category: 'unknown' }] }, '207', '3499')).toBeNull();
    expect(parseLocalPackage({ ...manifest, files: [manifest.files[0], manifest.files[0]] }, '207', '3499')).toBeNull();
  });

  it('shows only the chosen categories and switches a sandboxed preview plus original download', () => {
    render(<LocalPackagePreview manifest={manifest} />);
    expect(screen.getByRole('heading', { name: /商务文件/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /技术文件/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /价格文件/ })).toBeInTheDocument();
    expect(screen.getByTitle('文件预览：授权委托书.docx')).toHaveAttribute('sandbox', '');
    fireEvent.click(screen.getByRole('button', { name: /报价单.xlsx/ }));
    expect(screen.getByTitle('文件预览：报价单.xlsx')).toHaveAttribute('src', '/__local-package/207/file-9/preview');
    expect(screen.getByRole('link', { name: '下载原件' })).toHaveAttribute('href', '/__local-package/207/file-9/download');
    expect(screen.getByText(/正式成果版本仍待同步/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编辑|评分/ })).not.toBeInTheDocument();
  });

  it('switches between preview and the previous sync status without starting a task or changing workflow state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }));
    const onStartTask = vi.fn();
    const onOpenTasks = vi.fn();
    render(<ProjectMaterialsPage projectId="207" projectName="44" generationTaskId="3499"
      materials={[]} requirements={[]} snapshots={[]} onStartTask={onStartTask} onOpenTasks={onOpenTasks}
      taskSummary={{ status: 'sync_error', percent: 100, title: '成果同步', message: '成果待同步' }}
      workflowFacts={{ currentTenderMaterialCount: 11, enterpriseMaterialCount: 1440, hasDeliverables: false,
        task: { status: 'sync_error', percent: 100, title: '成果同步', message: '成果待同步' } }} />);
    expect(await screen.findByRole('region', { name: '本地成果文件包预览' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '成果版本同步超时' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/请输入您的问题/)).not.toBeInTheDocument();
    expect(screen.getByText(/正式成果版本仍待同步/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回状态页' }));
    expect(screen.getByRole('heading', { name: '成果版本同步超时' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '本地成果文件包预览' })).not.toBeInTheDocument();
    expect(onOpenTasks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '查看本地成果' }));
    expect(screen.getByRole('region', { name: '本地成果文件包预览' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '成果版本同步超时' })).not.toBeInTheDocument();
    expect(onStartTask).not.toHaveBeenCalled();
  });

  it('does not request local artifacts for another project', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<ProjectMaterialsPage projectId="206" projectName="33" generationTaskId="3499"
      materials={[]} requirements={[]} snapshots={[]} onStartTask={vi.fn()} />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads only a project-scoped structured Office model', async () => {
    const model = { workbook: { sheets: [{ id: 'sheet-1', name: '报价表', rows: [] }] } };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => model });
    vi.stubGlobal('fetch', fetch);

    await expect(loadLocalPackageModel('207', 'file-9')).resolves.toEqual(model);
    expect(fetch).toHaveBeenCalledWith(
      '/__local-package/207/file-9/model',
      expect.objectContaining({ cache: 'no-store' }),
    );
    await expect(loadLocalPackageModel('206', 'file-9')).rejects.toThrow('标识无效');
    await expect(loadLocalPackageModel('207', '../file-9')).rejects.toThrow('标识无效');
  });
});
