export type EnterpriseLifecycleAsset = {
  asset_id: number;
  name: string;
  status: number;
};

export type EnterpriseUploadLifecycleTarget = {
  assetIds: string[];
  baselineAssetIds: string[];
  expectedNewAssetCount: number;
  uploadedFileNames: string[];
};

export type EnterpriseUploadLifecycleResolution = {
  failedCount: number;
  matchedAssetIds: string[];
  successfulCount: number;
};

type LifecycleAgentApi = {
  chat: (
    projectId: string,
    taskId: string,
    body: { message: string; mode: 'queue' },
  ) => Promise<unknown>;
  preChat: (projectId: string, message: string) => Promise<unknown>;
};

const TERMINAL_ENTERPRISE_ASSET_STATUSES = new Set([2, 3, 4]);
const FAILED_ENTERPRISE_ASSET_STATUS = 4;

export function resolveEnterpriseUploadLifecycle(
  target: EnterpriseUploadLifecycleTarget,
  assets: readonly EnterpriseLifecycleAsset[],
): EnterpriseUploadLifecycleResolution | null {
  const expectedIds = new Set(target.assetIds.map(String));
  const baselineIds = new Set(target.baselineAssetIds.map(String));
  const matched = expectedIds.size > 0
    ? assets.filter((asset) => expectedIds.has(String(asset.asset_id)))
    : assets.filter((asset) => !baselineIds.has(String(asset.asset_id)));
  const expectedCount = expectedIds.size > 0
    ? expectedIds.size
    : Math.max(0, target.expectedNewAssetCount);

  if (expectedCount === 0) {
    return { failedCount: 0, matchedAssetIds: [], successfulCount: 0 };
  }
  if (matched.length < expectedCount) return null;
  const relevant = matched.slice(0, expectedCount);
  if (relevant.some((asset) => !TERMINAL_ENTERPRISE_ASSET_STATUSES.has(asset.status))) {
    return null;
  }

  const failedCount = relevant.filter((asset) => asset.status === FAILED_ENTERPRISE_ASSET_STATUS).length;
  return {
    failedCount,
    matchedAssetIds: relevant.map((asset) => String(asset.asset_id)),
    successfulCount: relevant.length - failedCount,
  };
}

export async function waitForEnterpriseUploadLifecycle({
  intervalMs = 2_000,
  isCurrent = () => true,
  loadAssets,
  maxAttempts = 300,
  target,
  wait = (delayMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)),
}: {
  intervalMs?: number;
  isCurrent?: () => boolean;
  loadAssets: () => Promise<EnterpriseLifecycleAsset[]>;
  maxAttempts?: number;
  target: EnterpriseUploadLifecycleTarget;
  wait?: (delayMs: number) => Promise<void>;
}): Promise<EnterpriseUploadLifecycleResolution | null> {
  for (let attempt = 0; attempt < maxAttempts && isCurrent(); attempt += 1) {
    try {
      const resolution = resolveEnterpriseUploadLifecycle(target, await loadAssets());
      if (resolution) return resolution;
    } catch {
      // Parsing and list refresh are asynchronous. A transient list failure must
      // not turn an accepted upload into a false "parsing complete" message.
    }
    if (attempt + 1 < maxAttempts && isCurrent()) await wait(intervalMs);
  }
  return null;
}

export function enterpriseUploadLifecycleMessage(
  target: EnterpriseUploadLifecycleTarget,
  resolution: EnterpriseUploadLifecycleResolution,
) {
  const names = target.uploadedFileNames.length > 0
    ? target.uploadedFileNames.map((name) => `「${name}」`).join('、')
    : '本次上传的材料';
  if (resolution.successfulCount === 0 && resolution.failedCount > 0) {
    return `系统消息：用户上传的企业资料 ${names} 已完成解析，但处理失败，企业资料库未更新。`;
  }
  const failureSuffix = resolution.failedCount > 0
    ? `；其中 ${resolution.failedCount} 项处理失败，请核对。`
    : '。';
  return `系统消息：企业资料已更新；用户上传的材料 ${names} 已完成解析${failureSuffix}`;
}

export function documentUpdatedLifecycleMessage(fileName: string, version?: number | string) {
  const versionLabel = version === undefined ? '' : `，已保存为 V${String(version).replace(/^v/i, '')}`;
  return `系统消息：文档「${fileName}」已更新${versionLabel}，请 BidVolt 在后续工作中使用最新版本。`;
}

export function sendBidVoltLifecycleMessage(
  api: LifecycleAgentApi,
  {
    message,
    projectId,
    taskId,
  }: {
    message: string;
    projectId: string;
    taskId?: string;
  },
) {
  return taskId
    ? api.chat(projectId, taskId, { message, mode: 'queue' })
    : api.preChat(projectId, message);
}
