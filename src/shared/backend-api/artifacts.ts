import { BackendApiError, idPath, queryString, type BackendApiClient } from './client';
import type { BackendId } from './types';

/** Formal binary artifacts are not structured deliverables or uploaded files. */
export type AgentArtifactSummary = {
  artifact_id: BackendId;
  project_id: BackendId;
  task_id: BackendId;
  kind: string;
  name: string;
  group: string;
  filename: string;
  mime: string;
  bytes: number;
  version_no: number;
  is_internal: boolean;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  download_url: string;
};

export type AgentArtifactListResponse = {
  artifacts: AgentArtifactSummary[];
  total: number;
  page: number;
  size: number;
};

export type AgentArtifactInspect = AgentArtifactSummary & {
  text_preview_head?: string;
  text_preview_tail?: string;
  chars?: number;
  pending_count?: number;
  pending_items?: Array<{ label: string; context: string; kind: string }>;
  bare_pending_count?: number;
  ins_count?: number;
  del_count?: number;
  tables?: unknown[];
  sheets?: Array<{ name: string; rows: number; cols: number; preview: unknown[] }>;
  entries?: Array<{ name: string; bytes: number }>;
  manifest?: unknown;
  note?: string;
};

export type ArtifactSaveMode = 'new' | 'overwrite';
export type ArtifactSaveResult = {
  artifact_id: BackendId;
  name: string;
  bytes: number;
  version_no: number;
  mode: ArtifactSaveMode;
  download_url: string;
};

/** The server checks the existing artifact's extension, not a browser MIME. */
export const ARTIFACT_SAVE_MAX_BYTES = 60 * 1024 * 1024;
export const ARTIFACT_SAVE_EXTENSIONS = ['docx', 'xlsx', 'pdf'] as const;

type ReadOptions = { signal?: AbortSignal };
type ArtifactListOptions = ReadOptions & { taskId?: BackendId; page?: number; size?: number };
type ArtifactListAllOptions = ReadOptions & { pageSize?: number };
export type ArtifactSaveOptions = {
  file: Blob;
  filename?: string;
  /** Always require a user decision. Never rely on the server's overwrite default. */
  mode: ArtifactSaveMode;
  signal?: AbortSignal;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const backendId = (value: unknown): value is BackendId =>
  typeof value === 'number'
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === 'string' && /^[1-9]\d*$/.test(value);
const malformed = (message: string) => new BackendApiError(502, message);
const basePath = (projectId: BackendId) => `/projects/${idPath(projectId)}`;

function validateArtifact(value: unknown, projectId: BackendId): asserts value is AgentArtifactSummary {
  if (!record(value)
    || !backendId(value.artifact_id)
    || !backendId(value.project_id)
    || String(value.project_id) !== String(projectId)
    || !backendId(value.task_id)
    || !nonnegativeInteger(value.bytes)
    || !nonnegativeInteger(value.version_no) || value.version_no === 0
    || typeof value.is_internal !== 'boolean'
    || ['kind', 'name', 'group', 'filename', 'mime', 'status', 'download_url']
      .some((key) => typeof value[key] !== 'string')
    || ['created_at', 'updated_at'].some((key) => value[key] !== null && typeof value[key] !== 'string')) {
    throw malformed('成果目录返回的数据不完整或不属于当前项目，请刷新后重试');
  }
}

function validatePage(value: unknown, projectId: BackendId, requestedPage: number): asserts value is AgentArtifactListResponse {
  if (!record(value) || !Array.isArray(value.artifacts)
    || !nonnegativeInteger(value.total)
    || value.page !== requestedPage
    || !nonnegativeInteger(value.size) || value.size === 0) {
    throw malformed('成果目录分页数据无效，请刷新后重试');
  }
  value.artifacts.forEach((artifact) => validateArtifact(artifact, projectId));
}

export const createArtifactsApi = (client: BackendApiClient) => {
  const list = async (projectId: BackendId, { taskId, page = 1, size = 100, signal }: ArtifactListOptions = {}) => {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 500) {
      throw new RangeError('成果目录分页参数无效');
    }
    const response = await client.request<unknown>(
      `${basePath(projectId)}/assembly/artifacts${queryString({ task_id: taskId, page, size })}`,
      { signal },
    );
    validatePage(response, projectId, page);
    if (taskId !== undefined && response.artifacts.some((artifact) => String(artifact.task_id) !== String(taskId))) {
      throw malformed('成果目录返回了其他任务的数据，请刷新后重试');
    }
    return response;
  };

  return {
    list,
    /** Fail on incomplete/changing pages instead of presenting a truncated directory as complete. */
    async listAll(projectId: BackendId, taskId?: BackendId, { pageSize = 100, signal }: ArtifactListAllOptions = {}) {
      const artifacts: AgentArtifactSummary[] = [];
      const ids = new Set<string>();
      let expectedTotal: number | undefined;
      for (let page = 1; page <= 10_000; page += 1) {
        signal?.throwIfAborted();
        const response = await list(projectId, { taskId, page, size: pageSize, signal });
        if (expectedTotal !== undefined && response.total !== expectedTotal) {
          throw malformed('读取期间成果目录发生变化，请刷新后重试');
        }
        expectedTotal = response.total;
        for (const artifact of response.artifacts) {
          const key = String(artifact.artifact_id);
          if (ids.has(key)) throw malformed('成果目录包含重复分页，请刷新后重试');
          ids.add(key);
          artifacts.push(artifact);
        }
        if (artifacts.length > expectedTotal) throw malformed('成果目录数量不一致，请刷新后重试');
        if (artifacts.length === expectedTotal) return artifacts;
        if (response.artifacts.length === 0) throw malformed('成果目录尚未完整返回，请刷新后重试');
      }
      throw malformed('成果目录分页过多，请缩小任务范围后重试');
    },
    async inspect(projectId: BackendId, artifactId: BackendId, { signal }: ReadOptions = {}) {
      const response = await client.request<unknown>(
        `${basePath(projectId)}/assembly/artifacts/${idPath(artifactId)}/inspect`, { signal },
      );
      validateArtifact(response, projectId);
      if (String(response.artifact_id) !== String(artifactId)) throw malformed('返回的成果与所选文件不一致');
      return response as AgentArtifactInspect;
    },
    // Build the trusted authenticated route rather than fetching a returned arbitrary URL.
    download: (projectId: BackendId, artifactId: BackendId, { signal }: ReadOptions = {}) =>
      client.requestBlob(`${basePath(projectId)}/agent-artifact/${idPath(artifactId)}/download`, { signal }),
    async save(projectId: BackendId, artifactId: BackendId, { file, filename, mode, signal }: ArtifactSaveOptions) {
      if (mode !== 'new' && mode !== 'overwrite') throw new TypeError('请选择另存为新版本或覆盖当前版本');
      if (!(file instanceof Blob) || file.size === 0) throw new TypeError('保存文件不能为空');
      if (file.size > ARTIFACT_SAVE_MAX_BYTES) throw new RangeError('保存文件不能超过 60 MiB');
      const form = new FormData();
      form.append('file', file, filename ?? (file instanceof File ? file.name : 'edited-document'));
      form.append('mode', mode);
      const response = await client.request<unknown>(
        `${basePath(projectId)}/assembly/artifacts/${idPath(artifactId)}/save`,
        { method: 'POST', body: form, signal },
      );
      if (!record(response) || !backendId(response.artifact_id)
        || response.mode !== mode || typeof response.name !== 'string'
        || typeof response.download_url !== 'string'
        || !nonnegativeInteger(response.bytes)
        || !nonnegativeInteger(response.version_no) || response.version_no === 0
        || (mode === 'overwrite' && String(response.artifact_id) !== String(artifactId))
        || (mode === 'new' && String(response.artifact_id) === String(artifactId))) {
        // The write may have completed: callers must inspect/refresh, not automatically retry it.
        throw malformed('保存回执不完整，请刷新核对文件，勿重复提交');
      }
      // "new" currently creates another artifact with version_no=1. This is not a
      // logical revision chain; neither mode proves the packaged ZIP was rebuilt.
      return response as ArtifactSaveResult;
    },
  };
};
