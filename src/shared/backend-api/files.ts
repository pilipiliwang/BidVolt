import { idPath, queryString, type BackendApiClient } from './client';
import type {
  BackendFile, BackendId, FileBlock, FileParseStatus, Page, ProjectMaterial, UploadResult,
} from './types';

export const createFilesApi = (client: BackendApiClient) => ({
  list: (params: {
    target?: 'enterprise' | 'project'; project_id?: BackendId; page?: number; size?: number;
  } = {}) => client.request<Page<BackendFile>>(`/files${queryString(params)}`),
  upload: (params: { target: 'enterprise' | 'project'; files: File[]; project_id?: BackendId }) => {
    const form = new FormData();
    form.append('target', params.target);
    if (params.project_id !== undefined) form.append('project_id', String(params.project_id));
    params.files.forEach((file) => form.append('files', file, file.name));
    return client.request<UploadResult>('/files/upload', { method: 'POST', body: form });
  },
  info: (fileId: BackendId) => client.request<BackendFile>(`/files/${idPath(fileId)}/info`),
  download: (fileId: BackendId) => client.requestBlob(`/files/${idPath(fileId)}/download`),
  remove: (fileId: BackendId) => client.requestVoid(`/files/${idPath(fileId)}`, { method: 'DELETE' }),
  parseStatus: (fileId: BackendId) =>
    client.request<FileParseStatus>(`/files/${idPath(fileId)}/parse-status`),
  blocks: (fileId: BackendId, params: { page?: number; size?: number } = {}) =>
    client.request<Page<FileBlock>>(`/files/${idPath(fileId)}/blocks${queryString(params)}`),
  projectMaterials: (projectId: BackendId) =>
    client.request<ProjectMaterial[]>(`/files/projects/${idPath(projectId)}/materials`),
  archive: (body: { archive_file_id: BackendId; target: 'enterprise' | 'project'; project_id?: BackendId }) =>
    client.request<Record<string, unknown>>('/files/archive', { method: 'POST', body }),
});
