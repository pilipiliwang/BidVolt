import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewCenter } from './ReviewCenter';
import type { ReviewProvider, ReviewRunView } from './types';

const providers: ReviewProvider[] = [
  {
    id: 'provider-api',
    name: '合规审查 API',
    type: 'api',
    version: '2026.08',
    description: '通过服务端适配器调用外部评审服务',
    available: true,
  },
  {
    id: 'provider-code',
    name: '本地规则代码',
    type: 'sandbox_code',
    version: 'v3',
    description: '在隔离沙箱运行确定性规则',
    available: true,
  },
];

const run: ReviewRunView = {
  id: 'review_01',
  status: 'succeeded',
  projectSnapshotId: 'snap_20260805',
  deliverableVersions: ['商务标 v8', '技术标 v6', '报价单 v4'],
  providerId: 'provider-api',
  providerVersion: '2026.08',
  findings: [
    {
      id: 'finding-1',
      title: '资质有效期不足',
      outcome: 'risk',
      ruleVersion: 'rule-18',
      confidence: 0.96,
      suggestion: '请确认资质证书在投标截止日仍然有效。',
      evidence: {
        sourceLabel: '招标文件',
        locator: '第 12 页 · 资格条件 3.1',
        exactQuote: '证书有效期须覆盖合同履行期。',
        verification: 'verified',
      },
    },
  ],
};

describe('ReviewCenter', () => {
  it('shows provider type, frozen snapshot, evidence and controlled result notice', () => {
    render(<ReviewCenter providers={providers} run={run} />);

    expect(screen.getByText('远程 API · 2026.08')).toBeInTheDocument();
    expect(screen.getByText('沙箱代码 · v3')).toBeInTheDocument();
    expect(screen.getByText('snap_20260805')).toBeInTheDocument();
    expect(screen.getByText('评审结果不会直接修改成果')).toBeInTheDocument();
    expect(screen.getByText('第 12 页 · 资格条件 3.1')).toBeInTheDocument();
  });

  it('runs only the user-selected provider', () => {
    const onRun = vi.fn();
    render(<ReviewCenter onRun={onRun} providers={providers} run={run} />);

    fireEvent.click(screen.getByRole('button', { name: /本地规则代码/ }));
    fireEvent.click(screen.getByRole('button', { name: '基于冻结快照运行评审' }));

    expect(onRun).toHaveBeenCalledWith('provider-code');
  });

  it('blocks execution until a frozen snapshot and deliverable versions exist', () => {
    render(
      <ReviewCenter
        providers={providers}
        run={{
          ...run,
          id: 'not-started',
          status: 'idle',
          projectSnapshotId: '尚未创建评审快照',
          deliverableVersions: ['暂无成果版本'],
          findings: [],
        }}
        runAllowed={false}
        runBlockReason="请先冻结项目快照并生成至少一个成果版本。"
      />,
    );

    expect(screen.getByRole('button', { name: '基于冻结快照运行评审' })).toBeDisabled();
    expect(screen.getByText('请先冻结项目快照并生成至少一个成果版本。')).toBeInTheDocument();
    expect(screen.getByText('当前项目还没有可展示的评审结果。')).toBeInTheDocument();
  });
});
