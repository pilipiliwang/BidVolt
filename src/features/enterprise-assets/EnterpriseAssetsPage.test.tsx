import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnterpriseAssetsPage } from './EnterpriseAssetsPage';
import type { EnterpriseAsset } from './types';

const assets: EnterpriseAsset[] = [
  {
    id: 'asset-license-1',
    name: '华东电气营业执照.pdf',
    category: 'license',
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

describe('EnterpriseAssetsPage', () => {
  it('shows enterprise-only classification, extracted facts and revision provenance', () => {
    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        ingestionItems={[
          {
            id: 'ingestion-1',
            name: '近三年业绩.xlsx',
            status: 'classifying',
            progress: 42,
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: '企业资料库' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('企业域');
    expect(screen.getByRole('note')).toHaveTextContent('自动分类不会改变其数据归属');
    expect(screen.getByLabelText('自动分类置信度')).toHaveTextContent('96%');
    expect(screen.getByText('统一社会信用代码')).toBeInTheDocument();
    expect(screen.getAllByText('来源：营业执照原件 · 第 1 页')).toHaveLength(2);
    expect(screen.getByText('自动识别为企业证照并抽取字段')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '近三年业绩.xlsx处理进度' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
  });

  it('uploads through the enterprise entry and submits a fact correction', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    const onCorrectFact = vi.fn();

    render(
      <EnterpriseAssetsPage
        enterpriseName="华东电气设备有限公司"
        assets={assets}
        onUpload={onUpload}
        onCorrectFact={onCorrectFact}
      />,
    );

    const upload = screen.getByLabelText(/选择文件或拖拽到此处/);
    const file = new File(['qualification'], '承装资质.pdf', { type: 'application/pdf' });
    await user.upload(upload, file);

    expect(onUpload).toHaveBeenCalledWith([file]);

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
    expect(screen.getByText('人工纠正会创建新版本，原值和来源始终保留')).toBeInTheDocument();
  });
});
