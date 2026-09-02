import { idPath, queryString, type BackendApiClient } from './client';
import type {
  BackendFile, BackendId, FileBlock, FileImageDescriptions, FileParseStatus,
  ImageDescribeProgress, Page, ProjectMaterial, UploadResult,
} from './types';

type FileListFilters = {
  target?: 'enterprise' | 'project';
  project_id?: BackendId;
};

type FileListParams = FileListFilters & {
  page?: number;
  size?: number;
};

export const createFilesApi = (client: BackendApiClient) => {
  const list = (params: FileListParams = {}) =>
    client.request<Page<BackendFile>>(`/files${queryString(params)}`);

  const listAll = async (params: FileListFilters = {}, pageSize = 100) => {
    const items: BackendFile[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (items.length < total) {
      const response = await list({ ...params, page, size: pageSize });
      total = Math.max(0, response.total);
      items.push(...response.items);
      if (response.items.length === 0) break;
      page += 1;
    }

    return items;
  };

  const blocks = (fileId: BackendId, params: { page?: number; size?: number } = {}) =>
    client.request<Page<FileBlock>>(`/files/${idPath(fileId)}/blocks${queryString(params)}`);

  const blocksAll = async (fileId: BackendId, pageSize = 100) => {
    const items: FileBlock[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (items.length < total) {
      const response = await blocks(fileId, { page, size: pageSize });
      total = Math.max(0, response.total);
      items.push(...response.items);
      if (response.items.length === 0) break;
      page += 1;
    }
    return items;
  };

  return {
    list,
    listAll,
    upload: (params: {
      target: 'enterprise' | 'project'; files: File[]; project_id?: BackendId; document_role?: string;
    }) => {
      const form = new FormData();
      form.append('target', params.target);
      if (params.project_id !== undefined) form.append('project_id', String(params.project_id));
      if (params.document_role !== undefined) form.append('document_role', params.document_role);
      params.files.forEach((file) => form.append('files', file, file.name));
      return client.request<UploadResult>('/files/upload', { method: 'POST', body: form });
    },
    info: (fileId: BackendId) => client.request<BackendFile>(`/files/${idPath(fileId)}/info`),
    download: (fileId: BackendId) => client.requestBlob(`/files/${idPath(fileId)}/download`),
    remove: (fileId: BackendId) => client.requestVoid(`/files/${idPath(fileId)}`, { method: 'DELETE' }),
    parseStatus: (fileId: BackendId) =>
      client.request<FileParseStatus>(`/files/${idPath(fileId)}/parse-status`),
    blocks,
    blocksAll,
    projectMaterials: (projectId: BackendId) =>
      client.request<ProjectMaterial[]>(`/files/projects/${idPath(projectId)}/materials`),
    imageDescribeProgress: () =>
      client.request<ImageDescribeProgress>('/files/image-describe-progress'),
    imageDescriptions: (fileId: BackendId) =>
      client.request<FileImageDescriptions>(`/files/${idPath(fileId)}/image-descriptions`),
    /** Manual re-expansion for a stored ZIP. Fresh ZIP uploads are expanded by /files/upload. */
    archive: (body: { archive_file_id: BackendId; target: 'enterprise' | 'project'; project_id?: BackendId }) =>
      client.request<Record<string, unknown>>('/files/archive', { method: 'POST', body }),
  };
};
