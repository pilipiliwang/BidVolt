import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnterpriseAssetsPage } from './EnterpriseAssetsPage';
import type { EnterpriseAsset, EnterpriseAssetCategoryFolder } from './types';

const categories: EnterpriseAssetCategoryFolder[] = [
  { id: 'category-license', label: '企业证照', parentId: null },
  { id: 'category-empty', label: '检测报告', parentId: null },
];

const assets: EnterpriseAsset[] = [
  {
    id: 'asset-license-1',
    name: '华东电气营业执照.pdf',
    category: 'license',
    categoryId: 'category-license',
    categoryLabel: '企业证照',
    classificationConfidence: 0.96,
    status: 'needs_review',
    updatedAt: '2026-08-05 09:20',
    expiresAt: '长期',
    facts: [
      {
        key: 'enterprise_name',
        label: '企业名称',
        value: '华东电气设备有限公司',
        confidence: 0.99,
        sourceLabel: '营业执照原件',
        sourcePage: 1,
      },
      {
        key: 'credit_code',
        label: '统一社会信用代码',
        value: '91310000OLD',
        confidence: 0.66,
        sourceLabel: '营业执照原件',
        sourcePage: 1,
        needsReview: true,
      },
    ],
    revisions: [
      {
        id: 'revision-2',
        revisionNo: 2,
        createdAt: '2026-08-05 09:20',
        createdBy: '资料归档 Agent',
        changeNote: '自动识别为企业证照并抽取字段',
        isCurrent: true,
      },
      {
        id: 'revision-1',
        revisionNo: 1,
        createdAt: '2026-08-05 09:18',
        createdBy: '张经理',
        changeNote: '上传原始文件',
        isCurrent: false,
      },
    ],
  },
];

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('EnterpriseAssetsPage', () => {
  it('shows the backend second-pass identifier readings without hiding conflicts', async () => {
    const user = userEvent.setup();
    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={[{
          ...assets[0],
          imageDescription: {
            doc_type: '营业执照',
            numbers_pass1: ['91310000O'],
            numbers_verified: ['913100000'],
            numbers_conflict: ['91310000O'],
            verify_mode: 'pillow_tiles',
          },
        }]}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole('button', { name: /查看.*详情/ }));

    expect(screen.getByRole('heading', { name: '图片识别与编号复核' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('两次编号识别不一致');
    expect(screen.getByText('913100000')).toBeInTheDocument();
  });

  it('shows screenshot-aligned library browsing and opens traceable details', async () => {
    const user = userEvent.setup();
    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
      />,
    );

    expect(screen.queryByRole('heading', { name: '企业资料库', level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '资料分类', level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/此处资料仅归属当前企业/)).toHaveTextContent('项目材料不会进入企业资料库');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('华东电气营业执照.pdf');
    expect(screen.getByRole('table')).not.toHaveTextContent('识别状态');
    expect(screen.getByText('系统视图')).toBeInTheDocument();
    expect(screen.getByText('业务分类')).toBeInTheDocument();
    const allAssetsButton = screen.getByRole('button', { name: /全部资料/ });
    const sourceAssetsButton = screen.getByRole('button', { name: /源文件/ });
    const licenseButton = screen.getByRole('button', { name: /企业证照/ });
    expect(allAssetsButton).toHaveTextContent('1');
    expect(sourceAssetsButton).toHaveTextContent('0');
    expect(allAssetsButton).toHaveClass('enterprise-folder--system');
    expect(sourceAssetsButton).toHaveClass('enterprise-folder--system');
    expect(licenseButton).not.toHaveClass('enterprise-folder--system');
    expect(licenseButton).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /检测报告/ })).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: '查看华东电气营业执照.pdf详情' }));

    const detailDialog = screen.getByRole('dialog', { name: '华东电气营业执照.pdf详情' });
    expect(detailDialog).toBeInTheDocument();
    expect(detailDialog.parentElement?.parentElement).toBe(document.body);
    expect(detailDialog).not.toHaveTextContent('资料状态：待复核');
    expect(detailDialog).not.toHaveTextContent('其他');
    expect(screen.getByRole('heading', { name: '资料关键信息' })).toBeInTheDocument();
    expect(screen.getByText('统一社会信用代码')).toBeInTheDocument();
    expect(screen.getAllByText('来源：营业执照原件 · 第 1 页')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '版本记录' }));
    expect(screen.getByText('自动识别为企业证照并抽取字段')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭资料详情' }));
    expect(screen.queryByText(/资料归类任务/)).not.toBeInTheDocument();
    expect(screen.queryByText(/待用户核对/)).not.toBeInTheDocument();
  });

  it('separates archive source files from business and backend category folders', async () => {
    const user = userEvent.setup();
    const archive: EnterpriseAsset = {
      ...assets[0],
      id: 'asset-archive-1',
      name: '企业资料原件.ZIP',
      category: 'other',
      categoryId: 'category-license',
      categoryLabel: '企业证照',
    };
    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={[...assets, archive]}
        categories={categories}
      />,
    );

    expect(screen.getByRole('table')).toHaveTextContent('企业资料原件.ZIP');
    expect(screen.getByRole('table')).toHaveTextContent('源文件');
    await user.click(screen.getByRole('button', { name: /企业证照/ }));
    expect(screen.getByRole('table')).not.toHaveTextContent('企业资料原件.ZIP');
    await user.click(screen.getByRole('button', { name: /源文件/ }));
    expect(screen.getByRole('table')).toHaveTextContent('企业资料原件.ZIP');
    expect(screen.getByRole('table')).not.toHaveTextContent('华东电气营业执照.pdf');
    expect(screen.getByRole('table')).toHaveTextContent('源文件');
    expect(screen.getByRole('table')).not.toHaveTextContent('企业证照');
  });

  it('paginates ten rows by default and supports 20 or 50 rows per page', async () => {
    const user = userEvent.setup();
    const manyAssets: EnterpriseAsset[] = Array.from({ length: 45 }, (_, index) => ({
      ...assets[0],
      id: `asset-${index + 1}`,
      name: `企业资料-${String(index + 1).padStart(2, '0')}.pdf`,
    }));
    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={manyAssets}
        categories={categories}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('显示 1–10 条，共 45 条');
    expect(screen.getByRole('table')).toHaveTextContent('企业资料-10.pdf');
    expect(screen.getByRole('table')).not.toHaveTextContent('企业资料-11.pdf');

    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByRole('status')).toHaveTextContent('显示 11–20 条，共 45 条');
    expect(screen.getByRole('table')).toHaveTextContent('企业资料-11.pdf');
    expect(screen.getByRole('table')).not.toHaveTextContent('企业资料-01.pdf');

    await user.selectOptions(screen.getByRole('combobox', { name: '每页显示数量' }), '20');
    expect(screen.getByRole('status')).toHaveTextContent('显示 1–20 条，共 45 条');

    await user.selectOptions(screen.getByRole('combobox', { name: '每页显示数量' }), '50');
    expect(screen.getByRole('status')).toHaveTextContent('显示 1–45 条，共 45 条');
    expect(screen.getByRole('table')).toHaveTextContent('企业资料-45.pdf');
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('resets pagination for search and safely clamps after the result set shrinks', async () => {
    const user = userEvent.setup();
    const manyAssets: EnterpriseAsset[] = Array.from({ length: 45 }, (_, index) => ({
      ...assets[0],
      id: `asset-${index + 1}`,
      name: `企业资料-${String(index + 1).padStart(2, '0')}.pdf`,
    }));
    const { rerender } = render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={manyAssets}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole('button', { name: '第 5 页' }));
    expect(screen.getByRole('status')).toHaveTextContent('显示 41–45 条，共 45 条');
    await user.type(screen.getByRole('searchbox', { name: '搜索企业资料' }), '企业资料-02');
    expect(screen.getByRole('status')).toHaveTextContent('显示 1–1 条，共 1 条');
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute('aria-current', 'page');

    await user.clear(screen.getByRole('searchbox', { name: '搜索企业资料' }));
    await user.click(screen.getByRole('button', { name: '第 5 页' }));
    rerender(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={manyAssets.slice(0, 5)}
        categories={categories}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('显示 1–5 条，共 5 条');
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute('aria-current', 'page');
  });

  it('uploads through the enterprise entry and submits a fact correction', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    const onCorrectFact = vi.fn();

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onUpload={onUpload}
        onCorrectFact={onCorrectFact}
      />,
    );

    await user.click(screen.getByRole('button', { name: /上传资料/ }));
    const upload = screen.getByLabelText(/选择文件或拖拽到此处/);
    const file = new File(['qualification'], '承装资质.pdf', { type: 'application/pdf' });
    await user.upload(upload, file);

    expect(onUpload).toHaveBeenCalledWith([file]);

    await user.click(screen.getByRole('button', { name: '关闭上传资料窗口' }));
    await user.click(screen.getByRole('button', { name: '查看华东电气营业执照.pdf详情' }));
    const creditCodeFact = screen.getByText('统一社会信用代码').closest('article');
    expect(creditCodeFact).not.toBeNull();
    await user.click(within(creditCodeFact!).getByRole('button', { name: '纠正字段' }));
    const correctionInput = screen.getByLabelText('修正统一社会信用代码');
    await user.clear(correctionInput);
    await user.type(correctionInput, '91310000NEW');
    await user.click(within(creditCodeFact!).getByRole('button', { name: '保存' }));

    expect(onCorrectFact).toHaveBeenCalledWith(
      'asset-license-1',
      'credit_code',
      '91310000NEW',
    );
    expect(screen.getByText('91310000NEW')).toBeInTheDocument();
    expect(screen.getByText('如有误差，可对照原件人工纠正。')).toBeInTheDocument();
  });

  it('replaces the open detail with the complete refreshed asset after a fact correction', async () => {
    const user = userEvent.setup();
    const refreshedAsset: EnterpriseAsset = {
      ...assets[0],
      classificationConfidence: 0.98,
      status: 'ready',
      updatedAt: '2026-08-05 10:30',
      facts: assets[0].facts.map((fact) => fact.key === 'credit_code'
        ? {
            ...fact,
            value: '91310000NEW',
            confidence: 0.99,
            sourceLabel: '人工确认',
            sourcePage: undefined,
            needsReview: false,
          }
        : fact),
      revisions: [
        {
          id: 'revision-3',
          revisionNo: 3,
          createdAt: '2026-08-05 10:30',
          createdBy: '张经理',
          changeNote: '人工纠正统一社会信用代码',
          isCurrent: true,
        },
        ...assets[0].revisions.map((revision) => ({ ...revision, isCurrent: false })),
      ],
    };
    const onCorrectFact = vi.fn().mockResolvedValue(refreshedAsset);

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onCorrectFact={onCorrectFact}
      />,
    );

    await user.click(screen.getByRole('button', { name: '查看华东电气营业执照.pdf详情' }));
    const creditCodeFact = screen.getByText('统一社会信用代码').closest('article');
    expect(creditCodeFact).not.toBeNull();
    await user.click(within(creditCodeFact!).getByRole('button', { name: '纠正字段' }));
    const correctionInput = screen.getByLabelText('修正统一社会信用代码');
    await user.clear(correctionInput);
    await user.type(correctionInput, '91310000NEW');
    await user.click(within(creditCodeFact!).getByRole('button', { name: '保存' }));

    expect(within(creditCodeFact!).getByText('置信度 99%')).toBeInTheDocument();
    expect(within(creditCodeFact!).getByText('来源：人工确认')).toBeInTheDocument();
    expect(within(creditCodeFact!).queryByText('待确认')).not.toBeInTheDocument();
    expect(screen.queryByText('资料状态：可复用')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '版本记录' }));
    expect(await screen.findByText('版本 3')).toBeInTheDocument();
  });

  it('shows an enterprise upload rejection in the upload dialog', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new Error('资质.pdf：文件损坏'));

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onUpload={onUpload}
      />,
    );

    await user.click(screen.getByRole('button', { name: /上传资料/ }));
    const file = new File(['broken'], '资质.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/选择文件或拖拽到此处/), file);

    const uploadDialog = screen.getByRole('dialog', { name: '导入企业资料' });
    expect(await within(uploadDialog).findByRole('alert')).toHaveTextContent('资质.pdf：文件损坏');
  });

  it('does not report success when the enterprise upload API is not configured', async () => {
    const user = userEvent.setup();
    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole('button', { name: /上传资料/ }));
    await user.upload(
      screen.getByLabelText(/选择文件或拖拽到此处/),
      new File(['qualification'], '资质.pdf', { type: 'application/pdf' }),
    );

    const uploadDialog = screen.getByRole('dialog', { name: '导入企业资料' });
    expect(await within(uploadDialog).findByRole('alert'))
      .toHaveTextContent('当前环境未配置企业资料上传能力');
    expect(screen.queryByText('上传已受理')).not.toBeInTheDocument();
  });

  it('keeps upload progress and the accepted result visible after closing the dialog', async () => {
    const user = userEvent.setup();
    const pendingUpload = createDeferred<{ message: string }>();
    const onUpload = vi.fn(() => pendingUpload.promise);

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onUpload={onUpload}
      />,
    );

    await user.click(screen.getByRole('button', { name: /上传资料/ }));
    const file = new File(['qualification'], '待处理资质.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/选择文件或拖拽到此处/), file);

    const activity = screen.getByLabelText('企业资料上传与处理状态');
    expect(within(activity).getByText('上传中')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭上传资料窗口' }));
    expect(screen.queryByRole('dialog', { name: /导入企业资料/ })).not.toBeInTheDocument();
    expect(within(activity).getByText('上传中')).toBeInTheDocument();

    await act(async () => {
      pendingUpload.resolve({ message: '资料已由后端受理，正在自动归类。' });
      await pendingUpload.promise;
    });

    expect(within(activity).getByText('上传已受理')).toBeInTheDocument();
    expect(activity).toHaveTextContent('资料已由后端受理，正在自动归类。');
  });

  it('keeps an upload failure visible after closing the dialog', async () => {
    const user = userEvent.setup();
    const pendingUpload = createDeferred<{ message: string }>();
    const onUpload = vi.fn(() => pendingUpload.promise);

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onUpload={onUpload}
      />,
    );

    await user.click(screen.getByRole('button', { name: /上传资料/ }));
    const file = new File(['broken'], '损坏资料.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/选择文件或拖拽到此处/), file);
    await user.click(screen.getByRole('button', { name: '关闭上传资料窗口' }));

    await act(async () => {
      pendingUpload.reject(new Error('损坏资料.pdf：文件损坏'));
      try {
        await pendingUpload.promise;
      } catch {
        // The component converts the rejected upload into a persistent page status.
      }
    });

    const activity = screen.getByLabelText('企业资料上传与处理状态');
    expect(within(activity).getByRole('alert')).toHaveTextContent('上传失败');
    expect(activity).toHaveTextContent('损坏资料.pdf：文件损坏');
  });

  it('shows the actual per-file upload receipt instead of a synthetic classification task', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({
      message: '企业资料已受理，可在页面查看本次上传记录。',
      type: 'success' as const,
      records: [{
        id: 'record-1',
        fileName: '华东电气营业执照.pdf',
        status: 'accepted' as const,
        createdAt: '2026-09-02T10:00:00+08:00',
        fileId: '88',
        assetId: 'asset-license-1',
      }],
    });

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onUpload={onUpload}
      />,
    );

    await user.click(screen.getByRole('button', { name: /上传资料/ }));
    const file = new File(['license'], '华东电气营业执照.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/选择文件或拖拽到此处/), file);
    await user.click(screen.getByRole('button', { name: '关闭上传资料窗口' }));
    await user.click(screen.getByRole('button', { name: '查看上传记录（1）' }));

    const history = screen.getByRole('dialog', { name: '企业资料上传记录' });
    expect(history).toHaveTextContent('以下内容来自后端逐文件上传回执');
    expect(history).toHaveTextContent('文件编号#88');
    expect(history).toHaveTextContent('资料编号#asset-license-1');
    expect(history).not.toHaveTextContent('资料归类任务');
  });

  it('refreshes from the backend and reports a refresh failure without pretending success', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockRejectedValue(new Error('企业资料接口暂不可用'));

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: '刷新资料列表' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('企业资料接口暂不可用');
    expect(screen.getByRole('button', { name: '刷新资料列表' })).toBeEnabled();
  });

  it('keeps a failed fact correction open with its draft value', async () => {
    const user = userEvent.setup();
    const onCorrectFact = vi.fn().mockRejectedValue(new Error('字段版本已更新，请重试'));

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        categories={categories}
        onCorrectFact={onCorrectFact}
      />,
    );

    await user.click(screen.getByRole('button', { name: '查看华东电气营业执照.pdf详情' }));
    const fact = screen.getByText('统一社会信用代码').closest('article');
    expect(fact).not.toBeNull();
    await user.click(within(fact!).getByRole('button', { name: '纠正字段' }));
    const input = screen.getByLabelText('修正统一社会信用代码');
    await user.clear(input);
    await user.type(input, '91310000RETRY');
    await user.click(within(fact!).getByRole('button', { name: '保存' }));

    expect(await within(fact!).findByRole('alert')).toHaveTextContent('字段版本已更新，请重试');
    expect(input).toHaveValue('91310000RETRY');
    expect(within(fact!).getByRole('button', { name: '保存' })).toBeEnabled();
  });
});
