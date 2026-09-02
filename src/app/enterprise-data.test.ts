import { describe, expect, it, vi } from 'vitest';

import type {
  EnterpriseAsset,
  EnterpriseAssetDetail,
  EnterpriseAssetRevision,
  EnterpriseCategory,
  EnterpriseIngestion,
} from '../shared/backend-api';
import {
  fetchEnterpriseAssetBundle,
  fetchEnterpriseOverview,
  hasActiveEnterpriseIngestion,
  refreshEnterpriseAfterUpload,
  shouldPollEnterpriseIngestions,
} from './enterprise-data';

const category: EnterpriseCategory = { category_id: 3, name: '证照', parent_id: null };
const asset: EnterpriseAsset = {
  asset_id: 8,
  asset_type: '证照',
  category_id: 3,
  name: '营业执照.pdf',
  source_file_id: 12,
  status: 2,
};
const ingestion: EnterpriseIngestion = {
  asset_ids: [8],
  created_at: null,
  ingest_id: 5,
  status: 1,
  task_id: 9,
};

describe('enterprise data loading', () => {
  it('loads list resources without issuing per-asset detail or revision requests', async () => {
    const api = {
      getAsset: vi.fn(),
      listAssets: vi.fn().mockResolvedValue([asset]),
      listCategories: vi.fn().mockResolvedValue([category]),
      listIngestions: vi.fn().mockResolvedValue({ items: [ingestion] }),
      listRevisions: vi.fn(),
    };

    await expect(fetchEnterpriseOverview(api)).resolves.toEqual({
      assets: [asset],
      categories: [category],
      ingestions: [ingestion],
    });
    expect(api.getAsset).not.toHaveBeenCalled();
    expect(api.listRevisions).not.toHaveBeenCalled();
  });

  it('loads details and revisions for only the selected asset', async () => {
    const detail: EnterpriseAssetDetail = { ...asset, facts: [] };
    const revision: EnterpriseAssetRevision = {
      created_at: null,
      created_by: null,
      file_id: 12,
      revision_id: 21,
      revision_no: 1,
      sha256: null,
      source_location: null,
    };
    const api = {
      getAsset: vi.fn().mockResolvedValue(detail),
      listRevisions: vi.fn().mockResolvedValue({ items: [revision] }),
    };

    await expect(fetchEnterpriseAssetBundle(api, '8')).resolves.toEqual({
      asset: detail,
      detail,
      revisions: [revision],
    });
    expect(api.getAsset).toHaveBeenCalledOnce();
    expect(api.getAsset).toHaveBeenCalledWith('8');
    expect(api.listRevisions).toHaveBeenCalledWith('8');
  });

  it('polls only queued or executing ingestion states', () => {
    expect(hasActiveEnterpriseIngestion([{ status: 'queued' }])).toBe(true);
    expect(hasActiveEnterpriseIngestion([{ status: 'classifying' }])).toBe(true);
    expect(hasActiveEnterpriseIngestion([{ status: 'extracting' }])).toBe(true);
    expect(hasActiveEnterpriseIngestion([{ status: 'pending_confirmation' }])).toBe(false);
    expect(hasActiveEnterpriseIngestion([{ status: 'completed' }, { status: 'failed' }])).toBe(false);
  });

  it('keeps polling briefly after upload while waiting for the task to appear', () => {
    expect(shouldPollEnterpriseIngestions([], 30_000, 10_000)).toBe(true);
    expect(shouldPollEnterpriseIngestions([], 30_000, 30_001)).toBe(false);
    expect(shouldPollEnterpriseIngestions([{ status: 'classifying' }], 0, 30_001)).toBe(true);
  });

  it('starts the post-upload refresh without waiting and reports a later refresh failure', async () => {
    let rejectRefresh: (error: Error) => void = () => undefined;
    const refresh = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectRefresh = reject;
    }));
    const onFailure = vi.fn();

    expect(refreshEnterpriseAfterUpload(refresh, onFailure)).toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();

    const failure = new Error('列表刷新失败');
    rejectRefresh(failure);
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith(failure));
  });
});
