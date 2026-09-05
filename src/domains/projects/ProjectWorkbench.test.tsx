import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseAssetCategoryFolder } from '../../features/enterprise-assets';
import {
  ProjectChatBar,
  ProjectSourceRail,
  ProjectWorkbench,
  type WorkspaceMaterial,
} from './ProjectWorkbench';
import projectWorkbenchCss from './project-workbench.css?raw';

afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

const projectMaterials: WorkspaceMaterial[] = [
  { id: 'project-1', name: '当前招标文件.pdf', status: '已识别', tone: 'blue' },
];

const enterpriseMaterials: WorkspaceMaterial[] = [
  {
    categoryId: 'license',
    id: 'enterprise-1',
    name: '企业营业执照.pdf',
    status: '可复用',
    tone: 'green',
  },
  {
    categoryId: 'performance',
    id: 'enterprise-2',
    name: '近三年业绩.xlsx',
    status: '可复用',
    tone: 'green',
  },
  {
    categoryId: 'removed-backend-category',
    id: 'enterprise-uncategorized',
    name: '待归类资料.pdf',
    status: '待确认',
    tone: 'orange',
  },
];

const enterpriseCategories: EnterpriseAssetCategoryFolder[] = [
  { id: 'license', label: '企业证照', parentId: null },
  { id: 'performance', label: '企业业绩', parentId: null },
  { id: 'inspection', label: '检测报告', parentId: null },
];

describe('ProjectWorkbench', () => {
  it('previews the source file and preserves the upload form when returning', async () => {
    const onLoadEnterprisePreview = vi.fn().mockResolvedValue({ kind: 'text', blocks: [{ id: '1', text: '原件正文' }] });
    render(<ProjectWorkbench enterpriseCategories={enterpriseCategories}
      enterpriseMaterials={[{ ...enterpriseMaterials[0], fileId: 'source-2133' }]}
      onLoadEnterprisePreview={onLoadEnterprisePreview} showChat={false}>
      <input aria-label="上传网址" defaultValue="" />
    </ProjectWorkbench>);
    fireEvent.change(screen.getByRole('textbox', { name: '上传网址' }), { target: { value: 'https://example.com/tender' } });
    fireEvent.click(screen.getByRole('button', { name: '企业证照，1项' }));
    fireEvent.click(screen.getByRole('button', { name: '企业营业执照.pdf' }));
    expect(await screen.findByText('原件正文')).toBeInTheDocument();
    expect(onLoadEnterprisePreview).toHaveBeenCalledWith('source-2133', '企业营业执照.pdf');
    expect(screen.queryByRole('textbox', { name: '上传网址' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开上传材料' }));
    expect(screen.getByRole('region', { name: '企业资料预览' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '上传网址' })).toHaveValue('https://example.com/tender');
    fireEvent.click(screen.getByRole('button', { name: '收起上传材料' }));
    expect(screen.queryByRole('textbox', { name: '上传网址' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回上传材料' }));
    expect(screen.getByRole('textbox', { name: '上传网址' })).toHaveValue('https://example.com/tender');
  });
  it('keeps the viewport-filling layout by default for editor pages', () => {
    render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={[]}
        materials={[]}
        rightRail={<div>Review</div>}
      >
        <div>Editor</div>
      </ProjectWorkbench>,
    );

    expect(screen.getByRole('main').closest('.bv-project-workspace')).toHaveClass(
      'bv-project-workspace--fill',
    );
  });

  it('keeps both side rails bounded while the center workspace grows on wide screens', () => {
    expect(projectWorkbenchCss).toMatch(
      /grid-template-columns:\s*clamp\(250px, 16vw, 290px\) minmax\(560px, 1fr\) clamp\(300px, 19vw, 350px\)/,
    );
  });

  it('routes enterprise-rail and bottom-assistant uploads to their dedicated handlers', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn();
    const onAssistantAddFiles = vi.fn();
    render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={[]}
        materials={projectMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAssistantAddFiles={onAssistantAddFiles}
        rightRail={<div>Review</div>}
      >
        <div>Editor</div>
      </ProjectWorkbench>,
    );

    const railFile = new File(['rail'], '企业资质.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('上传企业资料并同步资料库'), railFile);
    expect(onAddEnterpriseFiles).toHaveBeenCalledWith([railFile]);
    expect(onAssistantAddFiles).not.toHaveBeenCalled();

    const assistantFile = new File(['assistant'], '助手补充资料.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await user.upload(screen.getByLabelText('添加当前项目文件'), assistantFile);
    expect(onAssistantAddFiles).toHaveBeenCalledWith([assistantFile]);
    expect(onAddEnterpriseFiles).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectSourceRail', () => {
  it('uses the same heading scale as the review card and removes tab styling', () => {
    expect(projectWorkbenchCss).toMatch(
      /\.bv-source-rail__header h2\s*\{[^}]*font-size:\s*21px/,
    );
    expect(projectWorkbenchCss).not.toContain('.bv-source-rail__tabs');
  });

  it('renders the real enterprise category mapping with counts and no project materials', () => {
    render(
      <ProjectSourceRail
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
      />,
    );

    const rail = screen.getByRole('complementary', { name: '企业资料' });
    expect(within(rail).getByRole('heading', { level: 2, name: /企业资料/ })).toBeInTheDocument();
    expect(within(rail).queryByRole('tablist')).not.toBeInTheDocument();
    expect(within(rail).queryByRole('tab')).not.toBeInTheDocument();
    expect(within(rail).queryByText('系统视图')).not.toBeInTheDocument();
    expect(within(rail).queryByText('业务分类')).not.toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: '全部资料，3项' })).not.toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(rail).getByRole('button', { name: '企业业绩，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(rail).getByRole('button', { name: '检测报告，0项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(rail).getByRole('button', { name: '未分类资料，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(rail).getByRole('button', { name: '检测报告，0项' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '未分类资料，1项' })).toBeInTheDocument();
    expect(within(rail).queryByLabelText('企业营业执照.pdf')).not.toBeInTheDocument();
    expect(within(rail).queryByText('当前招标材料')).not.toBeInTheDocument();
    expect(within(rail).queryByLabelText('当前招标文件.pdf')).not.toBeInTheDocument();
    expect(within(rail).queryByLabelText('补充上传当前项目资料')).not.toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '企业资料上传不可用' })).toBeDisabled();
  });

  it('keeps archives in their backend category like the results sidebar', async () => {
    const user = userEvent.setup();
    const sourceArchive: WorkspaceMaterial = {
      categoryId: 'license',
      id: 'enterprise-source-archive',
      name: '企业资料原件.zip',
      status: '已上传',
      tone: 'orange',
    };
    render(
      <ProjectSourceRail
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={[...enterpriseMaterials, sourceArchive]}
      />,
    );

    expect(screen.queryByRole('button', { name: '源文件，1项' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '企业证照，2项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText('企业资料原件.zip')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '企业证照，2项' }));
    expect(screen.getByLabelText('企业资料原件.zip')).toBeInTheDocument();
    expect(screen.getByLabelText('企业营业执照.pdf')).toBeInTheDocument();
  });

  it('expands one real folder at a time and reports an empty backend folder honestly', async () => {
    const user = userEvent.setup();
    render(
      <ProjectSourceRail
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
      />,
    );

    const allFolder = screen.getByRole('button', { name: '企业业绩，1项' });
    const licenseFolder = screen.getByRole('button', { name: '企业证照，1项' });
    expect(allFolder).toHaveAttribute('aria-expanded', 'false');
    expect(licenseFolder).toHaveAttribute('aria-expanded', 'false');
    await user.click(licenseFolder);

    expect(allFolder).toHaveAttribute('aria-expanded', 'false');
    expect(licenseFolder).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('企业营业执照.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('近三年业绩.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('待归类资料.pdf')).not.toBeInTheDocument();

    await user.click(licenseFolder);
    expect(licenseFolder).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('企业营业执照.pdf')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '检测报告，0项' }));
    expect(screen.getByRole('status')).toHaveTextContent('该文件夹暂无企业资料');
  });

  it('resets the open folder when the enterprise tenant key changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseLibraryKey="enterprise-a"
        enterpriseMaterials={enterpriseMaterials}
        rightRail={<div>Review</div>}
      >
        <div>Workspace</div>
      </ProjectWorkbench>,
    );

    await user.click(screen.getByRole('button', { name: '企业证照，1项' }));
    expect(screen.getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    rerender(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseLibraryKey="enterprise-b"
        enterpriseMaterials={enterpriseMaterials}
        rightRail={<div>Review</div>}
      >
        <div>Workspace</div>
      </ProjectWorkbench>,
    );

    expect(screen.getByRole('button', { name: '企业业绩，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: '企业证照，1项' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('dispatches the left upload only to the enterprise callback', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn();
    const onAddFiles = vi.fn();
    render(
      <ProjectWorkbench
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
        materials={projectMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
        rightRail={<div>Review</div>}
      >
        <div>Workspace</div>
      </ProjectWorkbench>,
    );

    const file = new File(['enterprise'], '新企业资质.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(screen.getByText('上传企业资料')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('上传企业资料并同步资料库'), file);

    expect(onAddEnterpriseFiles).toHaveBeenCalledWith([file]);
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('当前招标文件.pdf')).not.toBeInTheDocument();
  });

  it('opens the enterprise file chooser from an explicit button', () => {
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('上传企业资料并同步资料库') as HTMLInputElement;
    const inputClick = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: '上传企业资料' }));

    expect(inputClick).toHaveBeenCalledTimes(1);
  });

  it('can delegate enterprise upload to a reusable dialog without opening the file chooser', () => {
    const onOpenEnterpriseUpload = vi.fn();
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onOpenEnterpriseUpload={onOpenEnterpriseUpload}
      />,
    );

    const button = screen.getByRole('button', { name: '上传企业资料' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);

    expect(onOpenEnterpriseUpload).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('上传企业资料并同步资料库')).not.toBeInTheDocument();
  });

  it('uses the same quiet file appearance as results, keeping status only in the hover title', async () => {
    const user = userEvent.setup();
    render(
      <ProjectSourceRail
        enterpriseCategories={enterpriseCategories}
        enterpriseMaterials={enterpriseMaterials}
      />,
    );

    await user.click(screen.getByRole('button', { name: '未分类资料，1项' }));

    expect(screen.queryByText('待确认')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '资料状态：待确认' })).not.toBeInTheDocument();
    const files = screen.getByRole('list', { name: '未分类资料文件' });
    expect(files.querySelector('.bv-source-rail__file-icon')).toBeInTheDocument();
    expect(files.querySelector('button')).toHaveAttribute('title', expect.stringContaining('待确认'));
  });

  it('shows enterprise upload pending and failure states without an unhandled rejection', async () => {
    const user = userEvent.setup();
    const upload = deferred<void>();
    const onAddEnterpriseFiles = vi.fn(() => upload.promise);
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    const input = screen.getByLabelText('上传企业资料并同步资料库');
    await user.upload(input, new File(['enterprise'], '失败资质.pdf', { type: 'application/pdf' }));

    expect(screen.getByText('正在上传企业资料…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在上传');
    expect(screen.getByRole('status')).toHaveTextContent('正在上传 1 个文件');
    expect(input).toBeDisabled();

    upload.reject(new Error('企业资料上传接口不可用'));

    expect(await screen.findByRole('alert')).toHaveTextContent('企业资料上传接口不可用');
    expect(screen.getByLabelText('上传企业资料并同步资料库')).toBeEnabled();
  });

  it('shows backend processing and completes only after the real enterprise list changes', async () => {
    const user = userEvent.setup();
    const upload = deferred<{
      assetIds: string[];
      message: string;
      status: 'processing';
    }>();
    const onAddEnterpriseFiles = vi.fn(() => upload.promise);
    const { rerender } = render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    await user.upload(
      screen.getByLabelText('上传企业资料并同步资料库'),
      new File(['enterprise'], '新增资质.pdf', { type: 'application/pdf' }),
    );
    upload.resolve({
      assetIds: ['new-enterprise-asset'],
      message: '后端已受理，正在解析。',
      status: 'processing',
    });

    expect(await screen.findByRole('status')).toHaveTextContent('后台处理中');
    expect(screen.getByRole('status')).toHaveTextContent('后端已受理，正在解析。');

    rerender(
      <ProjectSourceRail
        enterpriseMaterials={[
          ...enterpriseMaterials,
          {
            id: 'enterprise:new-enterprise-asset',
            name: '新增资质.pdf',
            status: '处理中',
            tone: 'blue',
          },
        ]}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    expect(await screen.findByText('列表同步完成')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('识别与归类进度请以各文件的后端状态为准');
  });

  it('waits for every returned asset id before reporting that the list is synchronized', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn().mockResolvedValue({
      assetIds: ['new-enterprise-a', 'new-enterprise-b'],
      status: 'processing' as const,
    });
    const { rerender } = render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    await user.upload(
      screen.getByLabelText('上传企业资料并同步资料库'),
      [
        new File(['a'], '资质-a.pdf', { type: 'application/pdf' }),
        new File(['b'], '资质-b.pdf', { type: 'application/pdf' }),
      ],
    );

    expect(await screen.findByText('后台处理中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '企业资料后台处理中…' })).toBeDisabled();

    rerender(
      <ProjectSourceRail
        enterpriseMaterials={[
          ...enterpriseMaterials,
          { id: 'enterprise:new-enterprise-a', name: '资质-a.pdf', status: '处理中', tone: 'blue' },
        ]}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    expect(screen.getByText('后台处理中')).toBeInTheDocument();
    expect(screen.queryByText('列表同步完成')).not.toBeInTheDocument();

    rerender(
      <ProjectSourceRail
        enterpriseMaterials={[
          ...enterpriseMaterials,
          { id: 'enterprise:new-enterprise-a', name: '资质-a.pdf', status: '处理中', tone: 'blue' },
          { id: 'enterprise:new-enterprise-b', name: '资质-b.pdf', status: '待确认', tone: 'orange' },
        ]}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    expect(await screen.findByText('列表同步完成')).toBeInTheDocument();
  });

  it('uses the selected batch size when the upload response has no asset ids', async () => {
    const user = userEvent.setup();
    const onAddEnterpriseFiles = vi.fn().mockResolvedValue({ status: 'processing' as const });
    const { rerender } = render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    await user.upload(
      screen.getByLabelText('上传企业资料并同步资料库'),
      [
        new File(['a'], '无编号-a.pdf', { type: 'application/pdf' }),
        new File(['b'], '无编号-b.pdf', { type: 'application/pdf' }),
      ],
    );
    expect(await screen.findByText('后台处理中')).toBeInTheDocument();

    rerender(
      <ProjectSourceRail
        enterpriseMaterials={[
          ...enterpriseMaterials,
          { id: 'enterprise:new-without-id-a', name: '无编号-a.pdf', status: '处理中', tone: 'blue' },
        ]}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );
    expect(screen.queryByText('列表同步完成')).not.toBeInTheDocument();

    rerender(
      <ProjectSourceRail
        enterpriseMaterials={[
          ...enterpriseMaterials,
          { id: 'enterprise:new-without-id-a', name: '无编号-a.pdf', status: '处理中', tone: 'blue' },
          { id: 'enterprise:new-without-id-b', name: '无编号-b.pdf', status: '待确认', tone: 'orange' },
        ]}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );
    expect(await screen.findByText('列表同步完成')).toBeInTheDocument();
  });

  it('releases the upload control when a receipt has no observable list item after a minute', async () => {
    vi.useFakeTimers();
    const onAddEnterpriseFiles = vi.fn().mockResolvedValue({
      expectedNewAssetCount: 1,
      status: 'processing' as const,
    });
    render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('上传企业资料并同步资料库'), {
        target: { files: [new File(['duplicate'], '重复资料.pdf', { type: 'application/pdf' })] },
      });
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: '企业资料后台处理中…' })).toBeDisabled();

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText('后台已受理')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('资料列表仍在后台同步');
    expect(screen.getByRole('button', { name: '上传企业资料' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('polls without overlapping refreshes, keeps processing on refresh failure, and cleans up', async () => {
    vi.useFakeTimers();
    const firstRefresh = deferred<void>();
    const secondRefresh = deferred<void>();
    const onRefreshEnterpriseMaterials = vi.fn()
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockImplementationOnce(() => secondRefresh.promise);
    const onAddEnterpriseFiles = vi.fn().mockResolvedValue({
      assetIds: ['still-processing'],
      status: 'processing' as const,
    });
    const { unmount } = render(
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onRefreshEnterpriseMaterials={onRefreshEnterpriseMaterials}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('上传企业资料并同步资料库'), {
        target: { files: [new File(['asset'], '待同步.pdf', { type: 'application/pdf' })] },
      });
      await Promise.resolve();
    });
    expect(screen.getByText('后台处理中')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2_000));
    expect(onRefreshEnterpriseMaterials).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(6_000));
    expect(onRefreshEnterpriseMaterials).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRefresh.reject(new Error('企业资料列表暂时不可用'));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('列表刷新暂时失败，系统将继续重试');
    expect(screen.queryByText('列表同步完成')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2_000));
    expect(onRefreshEnterpriseMaterials).toHaveBeenCalledTimes(2);
    unmount();
    act(() => vi.advanceTimersByTime(6_000));
    expect(onRefreshEnterpriseMaterials).toHaveBeenCalledTimes(2);
    await act(async () => {
      secondRefresh.resolve();
      await Promise.resolve();
    });
  });

  it('shows a dedicated empty state for enterprise data', () => {
    render(<ProjectSourceRail enterpriseMaterials={[]} />);

    expect(screen.getByText('企业资料库暂无可展示资料')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '发送' })).toHaveAttribute(
      'title',
      '项目助手接口尚未接入',
    );
  });

  it('fills and focuses the controlled assistant draft, while keeping it editable', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <ProjectChatBar
        focusRequest={0}
        hint="提问"
        onValueChange={onValueChange}
        value=""
      />,
    );

    rerender(
      <ProjectChatBar
        focusRequest={1}
        hint="提问"
        onValueChange={onValueChange}
        value={'请针对以下选中内容进行修改：\n设备供货方案\n\n修改要求：'}
      />,
    );

    const assistantInput = screen.getByRole('textbox', { name: '向项目助手提问' });
    expect(assistantInput).toHaveFocus();
    expect(assistantInput).toHaveValue(
      '请针对以下选中内容进行修改：\n设备供货方案\n\n修改要求：',
    );
    fireEvent.change(assistantInput, { target: { value: '补充风险控制' } });
    expect(onValueChange).toHaveBeenCalledWith('补充风险控制');
  });

  it('only enables sending when a handler and non-empty message are available', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ProjectChatBar hint="提问" onSend={onSend} value="请优化选中内容" />);

    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(onSend).toHaveBeenCalledWith('请优化选中内容');
  });

  it('keeps a question until the assistant request succeeds', async () => {
    const user = userEvent.setup();
    const send = deferred<void>();
    render(<ProjectChatBar hint="提问" onSend={() => send.promise} />);

    const input = screen.getByRole('textbox', { name: '向项目助手提问' });
    await user.type(input, '请检查资格条件');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(input).toHaveValue('请检查资格条件');
    expect(screen.getByRole('button', { name: '发送中…' })).toBeDisabled();

    send.resolve();

    expect(await screen.findByRole('button', { name: '发送' })).toBeDisabled();
    expect(input).toHaveValue('');
  });

  it('retains a failed assistant question and displays the request error', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => Promise.reject(new Error('助手服务暂不可用')));
    render(<ProjectChatBar hint="提问" onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: '向项目助手提问' });
    await user.type(input, '解释第二条评审建议');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('助手服务暂不可用');
    expect(input).toHaveValue('解释第二条评审建议');
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled();
    expect(onSend).toHaveBeenCalledWith('解释第二条评审建议');
  });

  it('does not erase text entered while the previous question is still sending', async () => {
    const user = userEvent.setup();
    const send = deferred<void>();
    render(<ProjectChatBar hint="提问" onSend={() => send.promise} />);

    const input = screen.getByRole('textbox', { name: '向项目助手提问' });
    await user.type(input, '第一个问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await user.type(input, '，以及补充问题');

    send.resolve();

    expect(await screen.findByRole('button', { name: '发送' })).toBeEnabled();
    expect(input).toHaveValue('第一个问题，以及补充问题');
  });

  it('shows attachment pending and failure states in the bottom bar', async () => {
    const user = userEvent.setup();
    const upload = deferred<void>();
    render(<ProjectChatBar hint="提问" onAddFiles={() => upload.promise} />);

    const input = screen.getByLabelText('添加当前项目文件');
    await user.upload(input, new File(['attachment'], '失败附件.docx'));

    expect(screen.getByRole('button', { name: '添加中…' })).toBeDisabled();
    upload.reject(new Error('附件上传失败'));

    expect(await screen.findByRole('alert')).toHaveTextContent('附件上传失败');
    expect(screen.getByRole('button', { name: '添加文件' })).toBeEnabled();
  });
});
