import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DocumentStore, DocumentStoreError, officeFileNameWithExtension } from './document-store.mjs';
import { createDocumentServerClient } from './document-server-client.mjs';
import {
  SELECTION_PLUGIN_PATH,
  SelectionBridgeValidationError,
  selectionEditorPlugins,
  selectionPluginConfig,
  selectionPluginHtml,
  validateSelectionBridge,
} from './selection-bridge.mjs';

const port = Number(process.env.PORT || 8081);
const sourceRoot = path.resolve(process.env.SOURCE_ROOT || '/workspace/.local-artifacts');
const dataRoot = path.resolve(process.env.DATA_ROOT || '/data');
const publicBridgeUrl = process.env.PUBLIC_BRIDGE_URL || `http://localhost:${port}`;
const internalBridgeUrl = process.env.INTERNAL_BRIDGE_URL || `http://editor-bridge:${port}`;
const publicDocumentServerUrl = process.env.PUBLIC_DOCUMENT_SERVER_URL || 'http://localhost:8080';
const internalDocumentServerUrl = process.env.INTERNAL_DOCUMENT_SERVER_URL || 'http://document-server';
const jwtSecret = process.env.ONLYOFFICE_JWT_SECRET || 'bidvolt-local-only-change-me';
const maxCallbackBytes = 2 * 1024 * 1024;
const maxDocumentBytes = 100 * 1024 * 1024;
let sourceIndex = new Map();
const documentStore = new DocumentStore({ dataRoot, publicBridgeUrl, sourceForFile: (id) => sourceIndex.get(id),
  fontSubstitutions: JSON.parse(process.env.BIDVOLT_OFFICE_FONT_SUBSTITUTIONS_JSON || '{}') });
const sessions = documentStore.sessions;
const documentServer = createDocumentServerClient({ internalUrl: internalDocumentServerUrl, publicUrl: publicDocumentServerUrl, signJwt, maxDocumentBytes });

const mimeTypes = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const officeExtensionPattern = /\.(doc|docx|xls|xlsx|ppt|pptx)$/i;

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const actual = Buffer.from(parts[2]);
  const expected = Buffer.from(createHmac('sha256', jwtSecret).update(`${parts[0]}.${parts[1]}`).digest('base64url'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function walkOfficeFiles(directory, results = []) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkOfficeFiles(absolute, results);
    else if (officeExtensionPattern.test(entry.name)) results.push(absolute);
  }
  return results;
}

async function refreshIndex() {
  const files = await walkOfficeFiles(sourceRoot);
  const importedFiles = await walkOfficeFiles(path.join(dataRoot, 'imports'));
  const next = new Map();
  for (const absolute of files) {
    const relative = path.relative(sourceRoot, absolute).split(path.sep).join('/');
    const id = createHash('sha256').update(relative).digest('hex').slice(0, 16);
    const stat = await fs.stat(absolute);
    next.set(id, { id, absolute, relative, name: path.basename(absolute), size: stat.size });
  }
  for (const absolute of importedFiles) {
    const id = path.basename(path.dirname(absolute));
    if (!/^[a-f0-9]{16}$/.test(id)) continue;
    const stat = await fs.stat(absolute);
    let sourceKey;
    try { sourceKey = JSON.parse(await fs.readFile(path.join(path.dirname(absolute), 'source.json'), 'utf8')).sourceKey; } catch { /* Older imports have no metadata. */ }
    next.set(id, {
      id,
      absolute,
      relative: `imported/${id}/${path.basename(absolute)}`,
      name: path.basename(absolute),
      size: stat.size,
      sourceKey,
    });
  }
  sourceIndex = next;
  return [...next.values()];
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxCallbackBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readBinaryBody(req) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > maxDocumentBytes) throw new Error('document is too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxDocumentBytes) throw new Error('document is too large');
    chunks.push(chunk);
  }
  if (!size) throw new Error('document is empty');
  return Buffer.concat(chunks);
}

async function importOfficeFile(sourceKey, requestedName, req) {
  const name = path.basename(String(requestedName || '')).slice(0, 240);
  const extension = path.extname(name).slice(1).toLowerCase();
  if (!sourceKey || sourceKey.length > 512) throw new Error('source key is invalid');
  if (!officeExtensionPattern.test(name) || !mimeTypes[extension]) {
    throw new Error('file type is not supported by the Office bridge');
  }
  const bytes = await readBinaryBody(req);
  const id = createHash('sha256')
    .update(`import:${sourceKey}:${name.toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);
  const directory = path.join(dataRoot, 'imports', id);
  const target = path.join(directory, name);
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(temporary, bytes, { flag: 'wx' });
  await fs.rename(temporary, target);
  await fs.writeFile(path.join(directory, 'source.json'), JSON.stringify({ sourceKey, name }));
  const item = {
    id,
    absolute: target,
    relative: `imported/${id}/${name}`,
    name,
    size: bytes.length,
    sourceKey,
  };
  sourceIndex.set(id, item);
  const versionInfo = await documentVersions(id);
  return { ...item, absolute: undefined, latestVersion: versionInfo?.latestVersion || 0, versions: versionInfo?.versions || [] };
}

async function latestDocument(fileId) {
  return documentStore.document(fileId);
}

async function documentVersions(fileId) {
  return documentStore.versions(fileId);
}

function editorDocumentType(extension) {
  if (['xls', 'xlsx'].includes(extension)) return 'cell';
  if (['ppt', 'pptx'].includes(extension)) return 'slide';
  return 'word';
}

async function createSession(body) {
  const selectionBridge = validateSelectionBridge(body.selectionBridge);
  const fileId = String(body.fileId || '');
  const mode = body.mode === 'view' ? 'view' : 'edit';
  const session = await documentStore.createSession({ fileId, version: body.version, mode, displayName: body.displayName });
  if (!session) return null;
  if (mode === 'edit' && ['doc', 'xls', 'ppt'].includes(session.fileType)) {
    const converted = await documentServer.convertLegacy({ key: session.key, fileType: session.fileType,
      title: session.name, url: `${internalBridgeUrl}/files/${fileId}/sessions/${session.id}` });
    await documentStore.setConvertedWorkingCopy(session.id, converted.bytes, converted.fileType);
  }
  const sessionId = session.id;
  const extension = session.fileType;
  const key = session.key;
  const user = {
    id: String(body.user?.id || 'local-tester'),
    name: String(body.user?.name || 'Local Tester').slice(0, 64),
  };
  const config = {
    document: {
      fileType: extension,
      key,
      title: session.name,
      url: `${internalBridgeUrl}/files/${fileId}/sessions/${sessionId}`,
      permissions: {
        edit: mode === 'edit',
        download: true,
        print: true,
        review: mode === 'edit',
        comment: mode === 'edit',
      },
    },
    documentType: editorDocumentType(extension),
    editorConfig: {
      mode,
      callbackUrl: `${internalBridgeUrl}/callbacks/${fileId}/${sessionId}`,
      lang: 'zh-CN',
      user,
      customization: { autosave: true, forcesave: true, compactHeader: false },
    },
    type: 'desktop',
  };
  if (selectionBridge) {
    config.editorConfig.plugins = selectionEditorPlugins(publicBridgeUrl, selectionBridge);
  }
  config.token = signJwt(config);
  return {
    ...documentStore.publicSession(session),
    sessionId,
    provider: 'onlyoffice',
    documentServerUrl: publicDocumentServerUrl,
    editorConfig: config,
    ...(selectionBridge ? {
      selectionBridge: { channel: selectionBridge.channel, origin: new URL(publicBridgeUrl).origin },
    } : {}),
  };
}

async function persistCallback(session, body) {
  if (body.key !== session.key) throw new DocumentStoreError('callback-key-mismatch', 'callback does not match session', 403);
  if (![2, 6].includes(Number(body.status)) || !body.url) return documentStore.receiveCallback(session.id, body);
  const bytes = await documentServer.download(body.url);
  return documentStore.receiveCallback(session.id, body, bytes);
}

async function requestSessionSave(sessionId, body) {
  const started = await documentStore.beginSave(sessionId, body);
  if (!started) return null;
  if (started.reused) return documentStore.publicSession(started.session);
  const result = await documentServer.forceSave(started.session.key, body.requestId);
  return documentStore.forceSaveResult(sessionId, body.requestId, result);
}

function serveFile(res, file) {
  const extension = file.extension || path.extname(file.name).slice(1).toLowerCase();
  const downloadName = officeFileNameWithExtension(file.name, extension);
  res.writeHead(200, {
    'content-type': mimeTypes[extension] || 'application/octet-stream',
    'content-length': file.size,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    'cache-control': 'no-store',
  });
  createReadStream(file.absolute).pipe(res);
}

function demoHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BidVolt ONLYOFFICE 本地联调</title><style>html,body{height:100%;margin:0;font:14px system-ui;background:#f3f8f5;color:#17352a}header{height:54px;display:flex;align-items:center;gap:12px;padding:0 18px;background:#fff;border-bottom:1px solid #dce8e1}select,button{padding:8px 12px;border:1px solid #bad7c7;border-radius:8px;background:#fff}button{background:#079455;color:#fff;font-weight:700}#editor{height:calc(100% - 55px)}</style><script src="${publicDocumentServerUrl}/web-apps/apps/api/documents/api.js"></script></head><body><header><strong>BidVolt 原生 Office 本地联调</strong><select id="files"></select><button id="open">打开编辑</button><span id="state"></span></header><div id="editor"></div><script>let editor; async function load(){const files=await fetch('/api/files').then(r=>r.json());const select=document.querySelector('#files');select.innerHTML=files.items.map(f=>'<option value="'+f.id+'">'+f.name+'</option>').join('');} async function openFile(){document.querySelector('#state').textContent='正在创建会话…';const response=await fetch('/api/editor-sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:document.querySelector('#files').value,mode:'edit'})});const session=await response.json();if(editor)editor.destroyEditor();editor=new DocsAPI.DocEditor('editor',{...session.editorConfig,events:{onDocumentReady(){document.querySelector('#state').textContent='已连接；修改后等待自动保存'}}});}document.querySelector('#open').onclick=openFile;load();</script></body></html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', publicBridgeUrl);
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && url.pathname === `${SELECTION_PLUGIN_PATH}/config.json`) {
      res.setHeader('cache-control', 'no-store');
      const bridgeParams = url.searchParams.has('channel') || url.searchParams.has('hostOrigin')
        ? { channel: url.searchParams.get('channel'), hostOrigin: url.searchParams.get('hostOrigin') }
        : undefined;
      return json(res, 200, selectionPluginConfig(publicBridgeUrl, bridgeParams));
    }
    if (req.method === 'GET' && url.pathname === `${SELECTION_PLUGIN_PATH}/index.html`) {
      validateSelectionBridge({
        channel: url.searchParams.get('channel'),
        hostOrigin: url.searchParams.get('hostOrigin'),
      });
      const html = Buffer.from(selectionPluginHtml(publicDocumentServerUrl));
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': html.length,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === `${SELECTION_PLUGIN_PATH}/selection.js`) {
      const script = await fs.readFile(new URL('./selection.js', import.meta.url));
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'content-length': script.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      return res.end(script);
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, files: sourceIndex.size, sessions: sessions.size });
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/demo')) {
      const html = Buffer.from(demoHtml());
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === '/api/files') {
      const files = await refreshIndex();
      const items = await Promise.all(files.map(async ({ id, name, relative, size, sourceKey }) => {
        const versionInfo = await documentVersions(id);
        return { id, name, relative, size, sourceKey, latestVersion: versionInfo?.latestVersion || 0, versions: versionInfo?.versions || [] };
      }));
      return json(res, 200, { items });
    }
    if (req.method === 'POST' && url.pathname === '/api/imported-files') {
      const item = await importOfficeFile(
        String(url.searchParams.get('sourceKey') || ''),
        String(url.searchParams.get('name') || ''),
        req,
      );
      return json(res, 201, item);
    }
    if (req.method === 'POST' && url.pathname === '/api/editor-sessions') {
      const session = await createSession(await readBody(req));
      return session ? json(res, 201, session) : json(res, 404, { error: 'file not found' });
    }
    const saveMatch = /^\/api\/editor-sessions\/([a-f0-9-]{36})\/save$/i.exec(url.pathname);
    if (req.method === 'POST' && saveMatch) {
      const state = await requestSessionSave(saveMatch[1], await readBody(req));
      return state ? json(res, state.pendingSave ? 202 : 200, state) : json(res, 404, { error: 'session not found' });
    }
    const sessionMatch = /^\/api\/editor-sessions\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && sessionMatch) {
      const session = await documentStore.sessionState(sessionMatch[1]);
      return session
        ? json(res, 200, session)
        : json(res, 404, { error: 'session not found' });
    }
    const versionsMatch = /^\/api\/files\/([a-f0-9]{16})\/versions$/.exec(url.pathname);
    if (req.method === 'GET' && versionsMatch) {
      const versions = await documentVersions(versionsMatch[1]);
      return versions ? json(res, 200, versions) : json(res, 404, { error: 'file not found' });
    }
    const fileMatch = /^\/files\/([a-f0-9]{16})\/current$/.exec(url.pathname);
    if (req.method === 'GET' && fileMatch) {
      const file = await latestDocument(fileMatch[1]);
      if (!file) return json(res, 404, { error: 'file not found' });
      const stat = await fs.stat(file.absolute);
      return serveFile(res, { ...file, size: stat.size });
    }
    const workingMatch = /^\/files\/([a-f0-9]{16})\/sessions\/([a-f0-9-]{36})$/i.exec(url.pathname);
    if (req.method === 'GET' && workingMatch) {
      if (sessions.get(workingMatch[2])?.fileId !== workingMatch[1]) return json(res, 404, { error: 'session not found' });
      const file = await documentStore.workingDocument(workingMatch[2]);
      return file ? serveFile(res, file) : json(res, 404, { error: 'session not found' });
    }
    const originalMatch = /^\/files\/([a-f0-9]{16})\/original$/.exec(url.pathname);
    if (req.method === 'GET' && originalMatch) {
      const source = sourceIndex.get(originalMatch[1]);
      if (!source) return json(res, 404, { error: 'file not found' });
      const stat = await fs.stat(source.absolute);
      return serveFile(res, { ...source, size: stat.size });
    }
    const recoveryMatch = /^\/files\/([a-f0-9]{16})\/recovery\/([a-f0-9-]{36})$/i.exec(url.pathname);
    if (req.method === 'GET' && recoveryMatch) {
      const file = await documentStore.recoveryDocument(recoveryMatch[1], recoveryMatch[2]);
      return file ? serveFile(res, file) : json(res, 404, { error: 'recovery copy not found' });
    }
    const versionFileMatch = /^\/files\/([a-f0-9]{16})\/versions\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && versionFileMatch) {
      const file = await documentStore.document(versionFileMatch[1], Number(versionFileMatch[2]));
      return file ? serveFile(res, file) : json(res, 404, { error: 'version not found' });
    }
    const callbackMatch = /^\/callbacks\/(?:([a-f0-9]{16})\/)?([^/]+)$/.exec(url.pathname);
    if (req.method === 'POST' && callbackMatch) {
      const body = await readBody(req);
      const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '')
        || req.headers.authorizationjwt?.replace(/^Bearer\s+/i, '')
        || body.token;
      if (!verifyJwt(auth)) return json(res, 401, { error: 1 });
      const fileId = callbackMatch[1];
      const session = sessions.get(callbackMatch[2]);
      if (!session) return json(res, 404, { error: 1 });
      if (fileId && fileId !== session.fileId) return json(res, 403, { error: 1 });
      await persistCallback(session, body);
      return json(res, 200, { error: 0 });
    }
    return json(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    return json(res, error instanceof SelectionBridgeValidationError ? 400 : error instanceof DocumentStoreError ? error.status : 500, {
      error: error instanceof Error ? error.message : 'internal error',
      ...(error instanceof DocumentStoreError ? { code: error.code } : {}),
    });
  }
});

await fs.mkdir(dataRoot, { recursive: true });
await refreshIndex();
await documentStore.initialize();
server.listen(port, '0.0.0.0', () => {
  console.log(`BidVolt ONLYOFFICE bridge listening on ${port}; ${sourceIndex.size} local files indexed.`);
});
