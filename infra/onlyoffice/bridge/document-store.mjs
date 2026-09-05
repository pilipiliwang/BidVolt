import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prepareDocxForEditing } from './docx-editable-copy.mjs';
import { validateFontSubstitutions } from './font-substitutions.mjs';

const officeVersion = /^v(\d+)\.(docx?|xlsx?|pptx?)$/i;
const sessionIdPattern = /^[a-f0-9-]{36}$/i;
const requestIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function officeFileNameWithExtension(name, extension) {
  const filename = path.basename(String(name || 'document'));
  const stem = filename.replace(/\.(?:docx?|xlsx?|pptx?)$/i, '');
  return /^(?:docx?|xlsx?|pptx?)$/i.test(extension || '') ? `${stem}.${extension.toLowerCase()}` : filename;
}

export class DocumentStoreError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function atomicWrite(target, bytes) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, bytes, { flag: 'wx' });
  await fs.rename(temporary, target);
}

export class DocumentStore {
  constructor({ dataRoot, sourceForFile, publicBridgeUrl, saveTimeoutMs = 90_000, fontSubstitutions }) {
    this.dataRoot = dataRoot;
    this.sourceForFile = sourceForFile;
    this.publicBridgeUrl = publicBridgeUrl;
    this.saveTimeoutMs = saveTimeoutMs;
    this.fontSubstitutions = validateFontSubstitutions(fontSubstitutions);
    this.sessions = new Map();
    this.locks = new Map();
  }

  async locked(key, operation) {
    const prior = this.locks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = prior.then(() => gate);
    this.locks.set(key, tail);
    await prior;
    try { return await operation(); }
    finally { release(); if (this.locks.get(key) === tail) this.locks.delete(key); }
  }

  sessionDirectory(id) { return path.join(this.dataRoot, 'sessions', id); }
  versionDirectory(fileId) { return path.join(this.dataRoot, 'files', fileId); }

  async persistSession(session) {
    await atomicWrite(path.join(this.sessionDirectory(session.id), 'session.json'), JSON.stringify(session));
  }

  async initialize() {
    const directory = path.join(this.dataRoot, 'sessions');
    await fs.mkdir(directory, { recursive: true });
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !sessionIdPattern.test(entry.name)) continue;
      try {
        const session = JSON.parse(await fs.readFile(path.join(directory, entry.name, 'session.json'), 'utf8'));
        if (session.id !== entry.name || !this.sourceForFile(session.fileId)) continue;
        session.decisionRevision ??= 0;
        if (session.pendingSave) {
          const pending = session.pendingSave;
          session.requests[pending.requestId] = { strategy: pending.strategy, state: 'failed' };
          session.pendingSave = null;
          session.saveError = { code: 'bridge-restarted', requestId: pending.requestId, message: '保存中断，草稿仍保留，请重新选择保存方式。' };
          session.status = 'save-failed';
          session.needsDecision = Boolean(session.draftFile);
          await this.persistSession(session);
        }
        this.sessions.set(session.id, session);
      } catch { /* Ignore an incomplete session, never recover it by writing a source version. */ }
    }
  }

  async versionFiles(fileId) {
    let entries;
    try { entries = await fs.readdir(this.versionDirectory(fileId), { withFileTypes: true }); }
    catch { entries = []; }
    return entries.filter((entry) => entry.isFile() && officeVersion.test(entry.name)).map((entry) => {
      const match = officeVersion.exec(entry.name);
      return { version: Number(match[1]), extension: match[2].toLowerCase(), absolute: path.join(this.versionDirectory(fileId), entry.name) };
    });
  }

  async document(fileId, version) {
    const source = this.sourceForFile(fileId);
    if (!source) return null;
    const files = await this.versionFiles(fileId);
    if (version === undefined) version = Math.max(0, ...files.map((file) => file.version));
    if (!Number.isInteger(version) || version < 0) throw new DocumentStoreError('invalid-version', '版本号无效。', 400);
    const candidates = files.filter((file) => file.version === version);
    if (candidates.length > 1) throw new DocumentStoreError('ambiguous-version', '版本存储不一致，未尝试覆盖。');
    const existing = candidates[0];
    if (!existing && version !== 0) return null;
    const absolute = existing?.absolute || source.absolute;
    const extension = existing?.extension || path.extname(source.name).slice(1).toLowerCase();
    const stat = await fs.stat(absolute);
    return { ...source, absolute, version, extension, size: stat.size, savedAt: stat.mtime.toISOString() };
  }

  async versions(fileId) {
    const source = this.sourceForFile(fileId);
    if (!source) return null;
    const entries = await this.versionFiles(fileId);
    const numbers = [...new Set([0, ...entries.map((entry) => entry.version)])].sort((a, b) => b - a);
    const latestVersion = numbers[0];
    const versions = await Promise.all(numbers.map(async (version) => {
      const current = await this.document(fileId, version);
      return { version, name: version === 0 ? '原始版本' : `修订 ${version}`, fileName: officeFileNameWithExtension(source.name, current.extension), size: current.size,
        savedAt: current.savedAt, url: `${this.publicBridgeUrl}/files/${fileId}/versions/${version}`,
        isCurrent: version === latestVersion, isOriginal: version === 0, fileType: current.extension };
    }));
    let recoveryBackups = [];
    try {
      const directory = path.join(this.versionDirectory(fileId), 'recovery');
      const metadata = (await fs.readdir(directory)).filter((name) => /^[a-f0-9-]{36}\.json$/i.test(name));
      recoveryBackups = await Promise.all(metadata.map(async (name) => {
        const value = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
        return { ...value, url: `${this.publicBridgeUrl}/files/${fileId}/recovery/${value.id}` };
      }));
      recoveryBackups.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch { /* No overwrite recovery data exists yet. */ }
    return { fileId, sourceName: source.name, sourceKey: source.sourceKey, latestVersion, versions, recoveryBackups,
      originalUrl: `${this.publicBridgeUrl}/files/${fileId}/original` };
  }

  publicSession(session) {
    if (!session) return null;
    const { id, fileId, key, mode, status, createdAt, baseVersion, draftRevision, savedRevision, pendingSave,
      needsDecision, decisionRevision, savedVersion, saveError, savedAt, lastSaveRequestId, editablePreparation } = session;
    return { id, sessionId: id, fileId, key, mode, status, createdAt, baseVersion, draftRevision, savedRevision,
      pendingSave, needsDecision, decisionRevision, savedVersion, saveError, savedAt, lastSaveRequestId, editablePreparation };
  }

  async sessionState(id) {
    return this.locked(`session:${id}`, async () => {
      const session = this.sessions.get(id);
      if (!session) return null;
      if (session.pendingSave && Date.now() - Date.parse(session.pendingSave.startedAt) > this.saveTimeoutMs) {
        await this.failSave(session, 'save-timeout', '保存结果暂未返回，草稿仍保留。请确认后重新保存。');
      }
      return this.publicSession(session);
    });
  }

  async createSession({ fileId, version, mode = 'edit', displayName }) {
    return this.locked(`file:${fileId}`, async () => {
      const current = await this.document(fileId, version);
      if (!current) return null;
      const sourceBytes = await fs.readFile(current.absolute);
      const prepared = mode === 'edit' && current.extension === 'docx'
        ? prepareDocxForEditing(sourceBytes, this.fontSubstitutions)
        : { bytes: sourceBytes, protectionRemoved: false, fontSubstitutions: [] };
      const id = randomUUID();
      const workingFile = `working.${current.extension}`;
      await atomicWrite(path.join(this.sessionDirectory(id), workingFile), prepared.bytes);
      const session = {
        id, fileId, key: hash(Buffer.from(`${id}:${hash(prepared.bytes)}`)).slice(0, 40), mode,
        name: typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 240) : current.name,
        fileType: current.extension, workingFile, baseVersion: current.version, baseHash: hash(sourceBytes),
        workingHash: hash(prepared.bytes), status: 'opening', createdAt: new Date().toISOString(),
        draftRevision: 0, draftHash: null, draftFile: null, savedRevision: 0, savedVersion: null,
        pendingSave: null, needsDecision: false, decisionRevision: 0, saveError: null, savedAt: null, lastSaveRequestId: null,
        editablePreparation: { protectionRemoved: prepared.protectionRemoved, fontSubstitutions: prepared.fontSubstitutions }, requests: {}, handledEvents: [],
      };
      this.sessions.set(id, session);
      await this.persistSession(session);
      return session;
    });
  }

  async workingDocument(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    const absolute = path.join(this.sessionDirectory(id), session.workingFile);
    const stat = await fs.stat(absolute);
    return { absolute, name: session.name, extension: session.fileType, size: stat.size };
  }

  async setConvertedWorkingCopy(id, bytes, fileType) {
    return this.locked(`session:${id}`, async () => {
      const session = this.sessions.get(id);
      if (!session || session.status !== 'opening') throw new DocumentStoreError('session-not-opening', '会话已打开，不能替换工作副本。');
      if (!Buffer.isBuffer(bytes) || bytes.length > 100 * 1024 * 1024 || !['docx', 'xlsx', 'pptx'].includes(fileType)) {
        throw new DocumentStoreError('invalid-converted-document', '转换文件无效。', 422);
      }
      const prepared = fileType === 'docx' ? prepareDocxForEditing(bytes, this.fontSubstitutions)
        : { bytes, protectionRemoved: false, fontSubstitutions: [] };
      const originalFileType = session.fileType;
      session.fileType = fileType;
      session.workingFile = `working-converted.${fileType}`;
      session.workingHash = hash(prepared.bytes);
      session.editablePreparation = { ...session.editablePreparation, protectionRemoved: prepared.protectionRemoved,
        convertedFrom: originalFileType, convertedTo: fileType, fontSubstitutions: prepared.fontSubstitutions };
      await atomicWrite(path.join(this.sessionDirectory(id), session.workingFile), prepared.bytes);
      await this.persistSession(session);
      return session;
    });
  }

  async failSave(session, code, message) {
    const requestId = session.pendingSave?.requestId;
    if (session.pendingSave) {
      session.requests[session.pendingSave.requestId] = { strategy: session.pendingSave.strategy, state: 'failed', code };
    }
    session.pendingSave = null;
    session.saveError = { code, message, ...(requestId ? { requestId } : {}) };
    session.status = 'save-failed';
    session.needsDecision = Boolean(session.draftFile);
    await this.persistSession(session);
  }

  async beginSave(id, { requestId, strategy }) {
    if (typeof requestId !== 'string' || !requestIdPattern.test(requestId) || !['new-version', 'overwrite'].includes(strategy)) {
      throw new DocumentStoreError('invalid-save-request', '保存请求参数无效。', 400);
    }
    return this.locked(`session:${id}`, async () => {
      const session = this.sessions.get(id);
      if (!session) return null;
      if (session.mode !== 'edit') throw new DocumentStoreError('read-only-session', '只读会话不能保存。', 403);
      const prior = session.requests[requestId];
      if (prior) {
        if (prior.strategy !== strategy) throw new DocumentStoreError('idempotency-conflict', '同一保存请求不能更改保存方式。');
        return { session, reused: true };
      }
      if (session.pendingSave) throw new DocumentStoreError('conflicting-save', '上一条保存尚未完成。');
      if (strategy === 'overwrite') await this.assertUnchangedBase(session);
      session.pendingSave = { requestId, strategy, startedAt: new Date().toISOString() };
      session.requests[requestId] = { strategy, state: 'pending' };
      session.saveError = null;
      session.status = 'saving';
      await this.persistSession(session);
      return { session, reused: false };
    });
  }

  async assertUnchangedBase(session) {
    const current = await this.document(session.fileId, session.baseVersion);
    if (!current || hash(await fs.readFile(current.absolute)) !== session.baseHash) {
      throw new DocumentStoreError('version-conflict', '该版本已被其他会话修改，未覆盖。请另存为新版本或重新打开。');
    }
  }

  async commitDraft(session) {
    if (!session.pendingSave || !session.draftFile) return;
    const pending = session.pendingSave;
    try {
      await this.locked(`file:${session.fileId}`, async () => {
        if (pending.strategy === 'overwrite') await this.assertUnchangedBase(session);
        const current = await this.document(session.fileId, session.baseVersion);
        const records = await this.versionFiles(session.fileId);
        const version = pending.strategy === 'new-version' ? Math.max(0, ...records.map((file) => file.version)) + 1 : session.baseVersion;
        const bytes = await fs.readFile(path.join(this.sessionDirectory(session.id), session.draftFile));
        const extension = path.extname(session.draftFile).slice(1);
        if (pending.strategy === 'overwrite') {
          const id = randomUUID();
          const previous = await fs.readFile(current.absolute);
          const directory = path.join(this.versionDirectory(session.fileId), 'recovery');
          await atomicWrite(path.join(directory, `${id}.${current.extension}`), previous);
          await atomicWrite(path.join(directory, `${id}.json`), JSON.stringify({ id, version, fileType: current.extension,
            size: previous.length, savedAt: new Date().toISOString(), requestId: pending.requestId }));
        }
        const target = path.join(this.versionDirectory(session.fileId), `v${version}.${extension}`);
        // A legacy DOC/XLS/PPT can be returned as OOXML by Docs. Keep a single
        // logical version and archive the replaced original before its removal.
        await atomicWrite(target, bytes);
        if (pending.strategy === 'overwrite' && current.absolute !== target
          && current.absolute.startsWith(`${this.versionDirectory(session.fileId)}${path.sep}`)) {
          await fs.unlink(current.absolute);
        }
        session.baseVersion = version;
        session.baseHash = hash(bytes);
        session.workingHash = session.baseHash;
        session.workingFile = `working-saved.${extension}`;
        session.fileType = extension;
        await atomicWrite(path.join(this.sessionDirectory(session.id), session.workingFile), bytes);
        session.savedVersion = version;
        session.savedRevision += 1;
        session.savedAt = new Date().toISOString();
        session.lastSaveRequestId = pending.requestId;
        session.committedDraftHash = session.draftHash;
        session.pendingSave = null;
        session.needsDecision = false;
        session.saveError = null;
        session.status = 'saved';
        session.requests[pending.requestId] = { strategy: pending.strategy, state: 'saved', version, savedRevision: session.savedRevision };
        await this.persistSession(session);
      });
    } catch (error) {
      await this.failSave(session, error.code || 'commit-failed', error.message || '保存失败，草稿仍保留。');
    }
  }

  async forceSaveResult(id, requestId, result) {
    return this.locked(`session:${id}`, async () => {
      const session = this.sessions.get(id);
      if (!session || session.pendingSave?.requestId !== requestId) return this.publicSession(session);
      if (Number(result.error) === 4) {
        // A fresh prepared copy can contain meaningful protection/font changes
        // even before any text is typed. "New version" is also an explicit save
        // choice when its text happens to match the current version.
        if (!session.draftFile && (session.pendingSave.strategy === 'new-version' || session.workingHash !== session.baseHash)) {
          const prepared = await fs.readFile(path.join(this.sessionDirectory(id), session.workingFile));
          session.draftRevision += 1;
          session.draftHash = hash(prepared);
          session.draftFile = `draft-${session.draftRevision}.${session.fileType}`;
          await atomicWrite(path.join(this.sessionDirectory(id), session.draftFile), prepared);
        }
        if (session.draftFile && (session.pendingSave.strategy === 'new-version' || session.draftHash !== session.baseHash)) await this.commitDraft(session);
        else {
          const pending = session.pendingSave;
          session.pendingSave = null;
          session.status = 'saved';
          session.savedVersion = session.baseVersion;
          session.lastSaveRequestId = requestId;
          session.savedRevision += 1;
          session.savedAt = new Date().toISOString();
          session.needsDecision = false;
          session.requests[requestId] = { strategy: pending.strategy, state: 'unchanged', version: session.baseVersion };
          await this.persistSession(session);
        }
      } else if (Number(result.error) !== 0) {
        await this.failSave(session, 'force-save-failed', `编辑器暂不能完成保存（${result.error ?? '连接异常'}），草稿仍保留。`);
      }
      return this.publicSession(session);
    });
  }

  async receiveCallback(id, body, bytes) {
    return this.locked(`session:${id}`, async () => {
      const session = this.sessions.get(id);
      if (!session) throw new DocumentStoreError('session-not-found', '会话不存在。', 404);
      if (body.key !== session.key) throw new DocumentStoreError('callback-key-mismatch', '回调与当前会话不匹配。', 403);
      let requestId;
      try { requestId = JSON.parse(body.userdata || '{}').saveRequestId; } catch { /* Non-command callbacks do not carry our data. */ }
      const associated = requestId && requestId === session.pendingSave?.requestId;
      if ([3, 7].includes(Number(body.status))) {
        if (associated || Number(body.forcesavetype) === 1) await this.failSave(session, 'editor-save-failed', '编辑器保存失败，已有草稿仍保留。');
        return this.publicSession(session);
      }
      if (![2, 6].includes(Number(body.status)) || !bytes) {
        if (Number(body.status) === 1 && session.status === 'opening') session.status = 'editing';
        return this.publicSession(session);
      }
      if (session.mode !== 'edit') return this.publicSession(session);
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 100 * 1024 * 1024) {
        throw new DocumentStoreError('invalid-draft', '草稿为空或超过文件大小限制。', 413);
      }
      const extension = String(body.filetype || session.fileType).toLowerCase();
      const families = { doc: 'word', docx: 'word', xls: 'cell', xlsx: 'cell', ppt: 'slide', pptx: 'slide' };
      if (!families[extension] || families[extension] !== families[session.fileType]) throw new DocumentStoreError('callback-type-mismatch', '保存文件类型不匹配。', 400);
      const eventId = hash(Buffer.from(`${body.key}:${body.status}:${body.lastsave || body.url}:${body.userdata || ''}`));
      // Native Save can be clicked again after dismissing the decision dialog
      // without changing text, so it has a separate UI decision sequence.
      const nativeSave = Number(body.forcesavetype) === 1;
      if (nativeSave) {
        session.decisionRevision += 1;
        session.needsDecision = true;
      }
      if (session.handledEvents.includes(eventId)) {
        if (nativeSave) await this.persistSession(session);
        return this.publicSession(session);
      }
      const contentHash = hash(bytes);
      if (contentHash !== session.draftHash) {
        session.draftRevision += 1;
        session.draftHash = contentHash;
        session.draftFile = `draft-${session.draftRevision}.${extension}`;
        await atomicWrite(path.join(this.sessionDirectory(id), session.draftFile), bytes);
      }
      session.handledEvents.push(eventId);
      if (!session.pendingSave) session.status = session.needsDecision ? 'awaiting-save-choice'
        : contentHash === session.committedDraftHash ? 'saved' : 'draft';
      await this.persistSession(session);
      if (associated) await this.commitDraft(session);
      return this.publicSession(session);
    });
  }

  async recoveryDocument(fileId, recoveryId) {
    if (!sessionIdPattern.test(recoveryId) || !this.sourceForFile(fileId)) return null;
    try {
      const directory = path.join(this.versionDirectory(fileId), 'recovery');
      const metadata = JSON.parse(await fs.readFile(path.join(directory, `${recoveryId}.json`), 'utf8'));
      const absolute = path.join(directory, `${recoveryId}.${metadata.fileType}`);
      const stat = await fs.stat(absolute);
      return { absolute, name: `recovery-v${metadata.version}.${metadata.fileType}`, extension: metadata.fileType, size: stat.size };
    } catch { return null; }
  }
}
