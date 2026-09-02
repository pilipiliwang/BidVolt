import type {
  BackendEnterpriseAssetBundle,
  EnterpriseAsset as BackendEnterpriseAsset,
  EnterpriseAssetDetail,
  EnterpriseAssetRevision,
  EnterpriseCategory,
} from '../shared/backend-api';

type EnterpriseListApi = {
  listAssets: () => Promise<BackendEnterpriseAsset[]>;
  listCategories: () => Promise<EnterpriseCategory[]>;
};

type EnterpriseDetailApi = {
  getAsset: (assetId: string) => Promise<EnterpriseAssetDetail>;
  listRevisions: (assetId: string) => Promise<{ items: EnterpriseAssetRevision[] }>;
};

export type EnterpriseOverviewPayload = {
  assets: BackendEnterpriseAsset[];
  categories: EnterpriseCategory[];
};

/**
 * Fetch only the two collection resources needed to paint the enterprise page.
 * Asset facts and revisions are intentionally excluded and loaded after selection.
 * Enterprise ingestion jobs are not fetched here: automatic uploads do not create
 * a reliably linked ingestion job, so presenting that list as upload progress is
 * misleading.
 */
export async function fetchEnterpriseOverview(
  api: EnterpriseListApi,
): Promise<EnterpriseOverviewPayload> {
  const [categories, assets] = await Promise.all([
    api.listCategories(),
    api.listAssets(),
  ]);
  return { assets, categories };
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

/** Start a post-upload list refresh without delaying the accepted upload receipt. */
export function refreshEnterpriseAfterUpload(
  refresh: () => Promise<void>,
  onFailure: (error: unknown) => void,
) {
  void refresh().catch(onFailure);
}
