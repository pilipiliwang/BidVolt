import { describe, expect, it, vi } from 'vitest';

import {
  documentUpdatedLifecycleMessage,
  enterpriseUploadLifecycleMessage,
  resolveEnterpriseUploadLifecycle,
  sendBidVoltLifecycleMessage,
  waitForEnterpriseUploadLifecycle,
  type EnterpriseUploadLifecycleTarget,
} from './bidvolt-lifecycle';

const target: EnterpriseUploadLifecycleTarget = {
  assetIds: ['31', '32'],
  baselineAssetIds: ['1'],
  expectedNewAssetCount: 2,
  uploadedFileNames: ['营业执照.pdf', '资质证书.pdf'],
};

describe('BidVolt lifecycle messages', () => {
  it('does not treat a visible but still-processing enterprise asset as parsing complete', () => {
    expect(resolveEnterpriseUploadLifecycle(target, [
      { asset_id: 31, name: '营业执照.pdf', status: 3 },
      { asset_id: 32, name: '资质证书.pdf', status: 1 },
    ])).toBeNull();
  });

  it('waits through transient failures and processing before resolving terminal assets', async () => {
    const loadAssets = vi.fn()
      .mockRejectedValueOnce(new Error('列表暂不可用'))
      .mockResolvedValueOnce([
        { asset_id: 31, name: '营业执照.pdf', status: 1 },
        { asset_id: 32, name: '资质证书.pdf', status: 1 },
      ])
      .mockResolvedValueOnce([
        { asset_id: 31, name: '营业执照.pdf', status: 3 },
        { asset_id: 32, name: '资质证书.pdf', status: 2 },
      ]);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(waitForEnterpriseUploadLifecycle({
      intervalMs: 1,
      loadAssets,
      maxAttempts: 4,
      target,
      wait,
    })).resolves.toEqual({
      failedCount: 0,
      matchedAssetIds: ['31', '32'],
      successfulCount: 2,
    });
    expect(loadAssets).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('describes successful, mixed, and failed parsing without a false update claim', () => {
    expect(enterpriseUploadLifecycleMessage(target, {
      failedCount: 0,
      matchedAssetIds: ['31', '32'],
      successfulCount: 2,
    })).toContain('企业资料已更新');
    expect(enterpriseUploadLifecycleMessage(target, {
      failedCount: 1,
      matchedAssetIds: ['31', '32'],
      successfulCount: 1,
    })).toContain('其中 1 项处理失败');
    expect(enterpriseUploadLifecycleMessage(target, {
      failedCount: 2,
      matchedAssetIds: ['31', '32'],
      successfulCount: 0,
    })).toContain('企业资料库未更新');
  });

  it('routes lifecycle messages to the active run or task pre-chat', async () => {
    const api = {
      chat: vi.fn().mockResolvedValue({ queued: true }),
      preChat: vi.fn().mockResolvedValue({ reply: '已记录' }),
    };
    await sendBidVoltLifecycleMessage(api, {
      message: '文档已更新',
      projectId: '207',
      taskId: '3498',
    });
    expect(api.chat).toHaveBeenCalledWith('207', '3498', {
      message: '文档已更新',
      mode: 'queue',
    });

    await sendBidVoltLifecycleMessage(api, {
      message: '企业资料已更新',
      projectId: '208',
    });
    expect(api.preChat).toHaveBeenCalledWith('208', '企业资料已更新');
  });

  it('uses one consistent document-updated message for browser and Office saves', () => {
    expect(documentUpdatedLifecycleMessage('商务偏差表.docx', 3))
      .toBe('系统消息：文档「商务偏差表.docx」已更新，已保存为 V3，请 BidVolt 在后续工作中使用最新版本。');
  });
});
