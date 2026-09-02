import type {
  BackendEnterpriseAssetBundle,
  EnterpriseAsset as BackendEnterpriseAsset,
  EnterpriseAssetDetail,
  EnterpriseAssetRevision,
  EnterpriseCategory,
  EnterpriseIngestion,
} from '../shared/backend-api';

type EnterpriseListApi = {
  listAssets: () => Promise<BackendEnterpriseAsset[]>;
  listCategories: () => Promise<EnterpriseCategory[]>;
  listIngestions: () => Promise<{ items: EnterpriseIngestion[] }>;
};

type EnterpriseDetailApi = {
  getAsset: (assetId: string) => Promise<EnterpriseAssetDetail>;
  listRevisions: (assetId: string) => Promise<{ items: EnterpriseAssetRevision[] }>;
};

export type EnterpriseOverviewPayload = {
  assets: BackendEnterpriseAsset[];
  categories: EnterpriseCategory[];
  ingestions: EnterpriseIngestion[];
};

/**
 * Fetch only the three collection resources needed to paint the enterprise page.
 * Asset facts and revisions are intentionally excluded and loaded after selection.
 */
export async function fetchEnterpriseOverview(
  api: EnterpriseListApi,
): Promise<EnterpriseOverviewPayload> {
  const [categories, assets, ingestionResponse] = await Promise.all([
    api.listCategories(),
    api.listAssets(),
    api.listIngestions(),
  ]);
  return { assets, categories, ingestions: ingestionResponse.items };
}

/** Load the two resources belonging to one selected asset, never the whole library. */
export async function fetchEnterpriseAssetBundle(
  api: EnterpriseDetailApi,
  assetId: string,
): Promise<BackendEnterpriseAssetBundle> {
  const [detail, revisions] = await Promise.all([
    api.getAsset(assetId),
    api.listRevisions(assetId).then((response) => response.items),
  ]);
  return { asset: detail, detail, revisions };
}

export function hasActiveEnterpriseIngestion(
  items: readonly { status: string }[],
) {
  return items.some((item) => item.status === 'queued'
    || item.status === 'classifying'
    || item.status === 'extracting');
}

export function shouldPollEnterpriseIngestions(
  items: readonly { status: string }[],
  discoveryUntil: number,
  now = Date.now(),
) {
  return hasActiveEnterpriseIngestion(items) || discoveryUntil > now;
}

/** Start a post-upload list refresh without delaying the accepted upload receipt. */
export function refreshEnterpriseAfterUpload(
  refresh: () => Promise<void>,
  onFailure: (error: unknown) => void,
) {
  void refresh().catch(onFailure);
}

export const ENTERPRISE_INGESTION_POLL_INTERVAL_MS = 4_000;
export const ENTERPRISE_INGESTION_DISCOVERY_WINDOW_MS = 30_000;
