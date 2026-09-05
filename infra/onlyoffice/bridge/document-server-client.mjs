import { DocumentStoreError } from './document-store.mjs';

export function createDocumentServerClient({ internalUrl, publicUrl, signJwt, fetchImpl = fetch, maxDocumentBytes = 100 * 1024 * 1024 }) {
  const internal = new URL(internalUrl);
  const external = new URL(publicUrl);

  async function post(endpoint, payload, timeoutMs) {
    const token = signJwt(payload);
    const response = await fetchImpl(new URL(endpoint, internal), {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', AuthorizationJwt: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, token }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Document Server HTTP ${response.status}`);
    return response.json();
  }

  async function download(rawUrl) {
    const url = new URL(rawUrl);
    if (url.origin === external.origin) {
      url.protocol = internal.protocol;
      url.hostname = internal.hostname;
      url.port = internal.port;
    }
    if (url.origin !== internal.origin || url.username || url.password) throw new DocumentStoreError('download-origin-rejected', 'Office 文件下载地址不受信任。', 403);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!response.ok) throw new Error(`Document download HTTP ${response.status}`);
    const size = Number(response.headers.get('content-length') || 0);
    if (size > maxDocumentBytes) throw new DocumentStoreError('document-too-large', 'Office 文件超过 100 MB 限制。', 413);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > maxDocumentBytes) throw new DocumentStoreError('document-too-large', 'Office 文件超过 100 MB 限制。', 413);
      chunks.push(Buffer.from(chunk));
    }
    if (!bytes) throw new DocumentStoreError('empty-document', 'Office 返回的文件为空。', 422);
    return Buffer.concat(chunks);
  }

  async function convertLegacy({ key, url, fileType, title }) {
    const outputType = { doc: 'docx', xls: 'xlsx', ppt: 'pptx' }[fileType];
    if (!outputType) return null;
    try {
      const result = await post('/converter', { async: false, key: `${key}-working-copy`,
        filetype: fileType, outputtype: outputType, title, url }, 60_000);
      if (result.error || !result.endConvert || !result.fileUrl) throw new Error(`conversion error ${result.error ?? 'incomplete'}`);
      return { bytes: await download(result.fileUrl), fileType: outputType };
    } catch (error) {
      if (error instanceof DocumentStoreError) throw error;
      throw new DocumentStoreError('legacy-conversion-failed', `旧版 Office 文档转换失败，原文件未修改：${error.message}`, 422);
    }
  }

  async function forceSave(key, requestId) {
    try {
      return await post('/coauthoring/CommandService.ashx', { c: 'forcesave', key,
        userdata: JSON.stringify({ saveRequestId: requestId }) }, 15_000);
    } catch { return { error: 'network' }; }
  }

  return { download, convertLegacy, forceSave };
}
