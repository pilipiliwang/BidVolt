import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DocumentStore, officeFileNameWithExtension } from './document-store.mjs';
import { protectedDocx, unzipFixture } from './office-test-fixtures.mjs';

async function fixture(t, { legacy = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bidvolt-office-store-test-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('bidvolt-office-store-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const sourceBytes = legacy ? Buffer.from('LEGACY DOC TEST INPUT') : protectedDocx();
  const sourcePath = path.join(directory, legacy ? 'original.doc' : 'original.docx');
  await fs.writeFile(sourcePath, sourceBytes);
  const source = { id: '1234567890abcdef', name: path.basename(sourcePath), absolute: sourcePath, sourceKey: 'enterprise:123' };
  const options = { dataRoot: path.join(directory, 'data'), sourceForFile: (id) => id === source.id ? source : null,
    publicBridgeUrl: 'http://localhost:8081' };
  const store = new DocumentStore(options);
  await store.initialize();
  const open = (props = {}) => store.createSession({ fileId: source.id, ...props });
  let serial = 0;
  const callback = (session, text, extra = {}) => store.receiveCallback(session.id, {
    key: session.key, status: 6, forcesavetype: 1, filetype: 'docx', url: `http://document-server/callback/${++serial}`, ...extra,
  }, protectedDocx(text, ''));
  const save = async (session, requestId, strategy, text) => {
    await store.beginSave(session.id, { requestId, strategy });
    await callback(session, text, { forcesavetype: 0, userdata: JSON.stringify({ saveRequestId: requestId }) });
    return store.sessionState(session.id);
  };
  return { store, source, sourcePath, sourceBytes, options, open, callback, save };
}

test('editable sessions get isolated unprotected copies while viewers and original retain protection', async (t) => {
  const { store, open, sourcePath, sourceBytes } = await fixture(t);
  const editing = await open();
  const second = await open();
  const viewing = await open({ mode: 'view' });
  assert.notEqual(editing.key, second.key);
  assert.equal(editing.editablePreparation.protectionRemoved, true);
  assert.equal(viewing.editablePreparation.protectionRemoved, false);
  const editedFile = await store.workingDocument(editing.id);
  const settings = unzipFixture(await fs.readFile(editedFile.absolute)).get('word/settings.xml').bytes.toString();
  assert.doesNotMatch(settings, /documentProtection/);
  assert.deepEqual(await fs.readFile(sourcePath), sourceBytes);
  assert.deepEqual(await fs.readFile((await store.workingDocument(viewing.id)).absolute), sourceBytes);
  assert.equal(editing.baseVersion, 0);
});

test('initial version list includes version 0 with original and source-key links', async (t) => {
  const { store, source } = await fixture(t);
  const history = await store.versions(source.id);
  assert.equal(history.latestVersion, 0);
  assert.equal(history.sourceKey, 'enterprise:123');
  assert.deepEqual(history.versions.map((item) => item.version), [0]);
  assert.equal(history.versions[0].isCurrent, true);
  assert.equal(history.versions[0].isOriginal, true);
  assert.match(history.originalUrl, /\/original$/);
});

test('timer and close callbacks preserve drafts but never create formal versions or ask for a save decision', async (t) => {
  const { store, open, callback, source } = await fixture(t);
  const session = await open();
  await callback(session, 'timer update', { forcesavetype: 2 });
  let state = await store.sessionState(session.id);
  assert.equal(state.draftRevision, 1);
  assert.equal(state.needsDecision, false);
  await callback(session, 'close update', { status: 2, forcesavetype: undefined });
  state = await store.sessionState(session.id);
  assert.equal(state.draftRevision, 2);
  assert.equal(state.needsDecision, false);
  assert.deepEqual((await store.versions(source.id)).versions.map((item) => item.version), [0]);
});

test('native Save asks for a decision then a no-new-changes forcesave commits the pending draft once', async (t) => {
  const { store, open, callback, source } = await fixture(t);
  const session = await open();
  await callback(session, 'native save content');
  assert.equal((await store.sessionState(session.id)).needsDecision, true);
  await store.beginSave(session.id, { requestId: 'native-save-1', strategy: 'new-version' });
  await store.forceSaveResult(session.id, 'native-save-1', { error: 4 });
  const state = await store.sessionState(session.id);
  assert.equal(state.savedVersion, 1);
  assert.equal(state.savedRevision, 1);
  assert.equal(state.baseVersion, 1);
  assert.equal(state.lastSaveRequestId, 'native-save-1');
  assert.equal(state.needsDecision, false);
  assert.equal(state.pendingSave, null);
  assert.deepEqual((await store.versions(source.id)).versions.map((item) => item.version), [1, 0]);
});

test('an API save commits only the callback belonging to its request', async (t) => {
  const { store, open, callback } = await fixture(t);
  const session = await open();
  await store.beginSave(session.id, { requestId: 'save-current', strategy: 'new-version' });
  await callback(session, 'unrelated native save');
  assert.equal((await store.sessionState(session.id)).savedVersion, null);
  await callback(session, 'latest force save', { forcesavetype: 0, userdata: JSON.stringify({ saveRequestId: 'save-current' }) });
  assert.equal((await store.sessionState(session.id)).savedVersion, 1);
});

test('overwrite saves selected version without adding numbered versions and preserves a recovery copy plus mounted original', async (t) => {
  const { store, source, sourceBytes, sourcePath, open, save } = await fixture(t);
  const session = await open();
  const state = await save(session, 'overwrite-original', 'overwrite', 'Modified original overlay');
  assert.equal(state.savedVersion, 0);
  assert.equal(state.savedRevision, 1);
  const history = await store.versions(source.id);
  assert.deepEqual(history.versions.map((item) => item.version), [0]);
  assert.equal(history.recoveryBackups.length, 1);
  assert.deepEqual(await fs.readFile(sourcePath), sourceBytes);
  const backup = await store.recoveryDocument(source.id, history.recoveryBackups[0].id);
  assert.deepEqual(await fs.readFile(backup.absolute), sourceBytes);
  assert.notDeepEqual(await fs.readFile((await store.document(source.id, 0)).absolute), sourceBytes);
});

test('new version then overwrite in the same editing session advances the baseline and emits another savedRevision', async (t) => {
  const { store, source, open, save } = await fixture(t);
  const session = await open();
  await save(session, 'new-1', 'new-version', 'first edit');
  const state = await save(session, 'overwrite-1', 'overwrite', 'second edit');
  assert.equal(state.baseVersion, 1);
  assert.equal(state.savedVersion, 1);
  assert.equal(state.savedRevision, 2);
  assert.equal(state.lastSaveRequestId, 'overwrite-1');
  assert.deepEqual((await store.versions(source.id)).versions.map((item) => item.version), [1, 0]);
});

test('selected historical versions open their own snapshot instead of the current latest', async (t) => {
  const { store, source, sourceBytes, open, save } = await fixture(t);
  const first = await open();
  await save(first, 'v1', 'new-version', 'revision one');
  await save(first, 'v2', 'new-version', 'revision two');
  const older = await open({ version: 1, displayName: 'User visible title.docx' });
  const original = await open({ version: 0, mode: 'view' });
  assert.equal(older.baseVersion, 1);
  assert.equal(older.name, 'User visible title.docx');
  assert.equal((await open()).baseVersion, 2);
  assert.deepEqual(await fs.readFile((await store.workingDocument(original.id)).absolute), sourceBytes);
  const content = unzipFixture(await fs.readFile((await store.workingDocument(older.id)).absolute)).get('word/document.xml').bytes.toString();
  assert.match(content, /revision one/);
  assert.equal(await store.document(source.id, 99), null);
});

test('concurrent overwrite never replaces another session change and the rejected draft can be saved as a new version', async (t) => {
  const { store, open, save, callback, source } = await fixture(t);
  const a = await open();
  const b = await open();
  await store.beginSave(b.id, { requestId: 'b-overwrite', strategy: 'overwrite' });
  await save(a, 'a-overwrite', 'overwrite', 'session A');
  await callback(b, 'session B', { forcesavetype: 0, userdata: JSON.stringify({ saveRequestId: 'b-overwrite' }) });
  let state = await store.sessionState(b.id);
  assert.equal(state.saveError.code, 'version-conflict');
  assert.equal(state.savedVersion, null);
  assert.equal(state.needsDecision, true);
  await store.beginSave(b.id, { requestId: 'b-new', strategy: 'new-version' });
  await store.forceSaveResult(b.id, 'b-new', { error: 4 });
  state = await store.sessionState(b.id);
  assert.equal(state.savedVersion, 1);
  assert.deepEqual((await store.versions(source.id)).versions.map((item) => item.version), [1, 0]);
});

test('parallel new-version saves allocate distinct increasing versions', async (t) => {
  const { store, open, save, source } = await fixture(t);
  const sessions = await Promise.all([open(), open()]);
  const states = await Promise.all(sessions.map((session, index) => save(session, `parallel-${index}`, 'new-version', `content ${index}`)));
  assert.deepEqual(states.map((state) => state.savedVersion).sort(), [1, 2]);
  assert.deepEqual((await store.versions(source.id)).versions.map((item) => item.version), [2, 1, 0]);
});

test('duplicate callbacks and request ids are idempotent and a request id cannot change strategy', async (t) => {
  const { store, open, source } = await fixture(t);
  const session = await open();
  await store.beginSave(session.id, { requestId: 'same-id', strategy: 'new-version' });
  const body = { key: session.key, status: 6, filetype: 'docx', url: 'same-event', userdata: JSON.stringify({ saveRequestId: 'same-id' }) };
  const bytes = protectedDocx('same', '');
  await store.receiveCallback(session.id, body, bytes);
  await store.receiveCallback(session.id, body, bytes);
  const duplicate = await store.beginSave(session.id, { requestId: 'same-id', strategy: 'new-version' });
  assert.equal(duplicate.reused, true);
  assert.equal((await store.sessionState(session.id)).savedRevision, 1);
  assert.equal((await store.versions(source.id)).versions.length, 2);
  await assert.rejects(store.beginSave(session.id, { requestId: 'same-id', strategy: 'overwrite' }), { code: 'idempotency-conflict' });
});

test('session metadata survives restart and interrupted saves preserve drafts without auto-committing', async (t) => {
  const { store, open, callback, options, source } = await fixture(t);
  const session = await open();
  await callback(session, 'draft that must survive');
  await store.beginSave(session.id, { requestId: 'interrupted', strategy: 'new-version' });
  const reloaded = new DocumentStore(options);
  await reloaded.initialize();
  const state = await reloaded.sessionState(session.id);
  assert.equal(state.draftRevision, 1);
  assert.equal(state.pendingSave, null);
  assert.equal(state.saveError.code, 'bridge-restarted');
  assert.equal(state.saveError.requestId, 'interrupted');
  assert.equal(state.needsDecision, true);
  assert.equal((await reloaded.versions(source.id)).versions.length, 1);
});

test('reused successful save ids stay idempotent after restart', async (t) => {
  const { open, save, options } = await fixture(t);
  const session = await open();
  await save(session, 'persisted-id', 'new-version', 'saved once');
  const reloaded = new DocumentStore(options);
  await reloaded.initialize();
  assert.equal((await reloaded.beginSave(session.id, { requestId: 'persisted-id', strategy: 'new-version' })).reused, true);
  assert.equal((await reloaded.sessionState(session.id)).savedRevision, 1);
});

test('forcesave errors, timeouts and late callbacks cannot unexpectedly create a version', async (t) => {
  const { store, open, callback, source } = await fixture(t);
  const session = await open();
  await store.beginSave(session.id, { requestId: 'network-failed', strategy: 'new-version' });
  await store.forceSaveResult(session.id, 'network-failed', { error: 'network' });
  assert.equal((await store.sessionState(session.id)).saveError.code, 'force-save-failed');
  assert.equal((await store.sessionState(session.id)).saveError.requestId, 'network-failed');
  await store.beginSave(session.id, { requestId: 'timed-out', strategy: 'new-version' });
  session.pendingSave.startedAt = new Date(0).toISOString();
  assert.equal((await store.sessionState(session.id)).saveError.code, 'save-timeout');
  await callback(session, 'late snapshot', { forcesavetype: 0, userdata: JSON.stringify({ saveRequestId: 'timed-out' }) });
  assert.equal((await store.versions(source.id)).versions.length, 1);
  assert.equal((await store.sessionState(session.id)).draftRevision, 1);
});

test('read-only sessions, mismatched callback keys and invalid save parameters are rejected', async (t) => {
  const { store, open, callback } = await fixture(t);
  const session = await open({ mode: 'view' });
  await assert.rejects(store.beginSave(session.id, { requestId: 'viewer', strategy: 'overwrite' }), { code: 'read-only-session' });
  await assert.rejects(callback(session, 'bad', { key: 'another-session-key' }), { code: 'callback-key-mismatch' });
  await assert.rejects(store.beginSave(session.id, { requestId: '', strategy: 'overwrite' }), { code: 'invalid-save-request' });
  assert.equal((await store.sessionState(session.id)).draftRevision, 0);
  const publicState = JSON.stringify(await store.sessionState(session.id));
  assert.doesNotMatch(publicState, /absolute|baseHash|workingFile|draftFile|handledEvents/);
});

test('legacy DOC can save an OOXML revision with its actual format without changing the source extension', async (t) => {
  const { store, source, sourceBytes, sourcePath, open, save } = await fixture(t, { legacy: true });
  const session = await open();
  await save(session, 'converted-doc', 'new-version', 'docx revision');
  const history = await store.versions(source.id);
  assert.equal(history.versions[0].fileType, 'docx');
  assert.equal(history.versions[0].fileName, 'original.docx');
  assert.equal(history.versions[1].fileType, 'doc');
  assert.equal(history.versions[1].fileName, 'original.doc');
  assert.deepEqual(await fs.readFile(sourcePath), sourceBytes);
});

test('legacy converted editing copy removes protection and retains original DOC snapshot independently', async (t) => {
  const { store, sourceBytes, sourcePath, open } = await fixture(t, { legacy: true });
  const session = await open();
  const originalWorking = (await store.workingDocument(session.id)).absolute;
  await store.setConvertedWorkingCopy(session.id, protectedDocx('converted'), 'docx');
  assert.equal(session.fileType, 'docx');
  assert.equal(session.editablePreparation.convertedFrom, 'doc');
  assert.equal(session.editablePreparation.protectionRemoved, true);
  const content = unzipFixture(await fs.readFile((await store.workingDocument(session.id)).absolute));
  assert.doesNotMatch(content.get('word/settings.xml').bytes.toString(), /documentProtection/);
  assert.deepEqual(await fs.readFile(originalWorking), sourceBytes);
  assert.deepEqual(await fs.readFile(sourcePath), sourceBytes);
});

test('explicit new-version without typed edits saves the prepared unprotected copy', async (t) => {
  const { store, open, source, sourceBytes, sourcePath } = await fixture(t);
  const session = await open();
  await store.beginSave(session.id, { requestId: 'prepared-new', strategy: 'new-version' });
  await store.forceSaveResult(session.id, 'prepared-new', { error: 4 });
  assert.equal((await store.sessionState(session.id)).savedVersion, 1);
  const saved = await fs.readFile((await store.document(source.id, 1)).absolute);
  assert.doesNotMatch(unzipFixture(saved).get('word/settings.xml').bytes.toString(), /documentProtection/);
  assert.deepEqual(await fs.readFile(sourcePath), sourceBytes);
});

test('overwrite without typed edits keeps protection preparation and preserves original bytes in recovery', async (t) => {
  const { store, open, source, sourceBytes } = await fixture(t);
  const session = await open();
  await store.beginSave(session.id, { requestId: 'prepared-overwrite', strategy: 'overwrite' });
  await store.forceSaveResult(session.id, 'prepared-overwrite', { error: 4 });
  assert.equal((await store.sessionState(session.id)).savedVersion, 0);
  assert.doesNotMatch(unzipFixture(await fs.readFile((await store.document(source.id, 0)).absolute)).get('word/settings.xml').bytes.toString(), /documentProtection/);
  const history = await store.versions(source.id);
  const backup = await store.recoveryDocument(source.id, history.recoveryBackups[0].id);
  assert.deepEqual(await fs.readFile(backup.absolute), sourceBytes);
});

test('new-version after a completed save copies the latest saved content, never the initial working document', async (t) => {
  const { store, open, save, source } = await fixture(t);
  const session = await open();
  await save(session, 'edited-first', 'new-version', 'latest saved words');
  await store.beginSave(session.id, { requestId: 'copy-latest', strategy: 'new-version' });
  await store.forceSaveResult(session.id, 'copy-latest', { error: 4 });
  const state = await store.sessionState(session.id);
  assert.equal(state.savedVersion, 2);
  const current = unzipFixture(await fs.readFile((await store.document(source.id, 2)).absolute)).get('word/document.xml').bytes.toString();
  assert.match(current, /latest saved words/);
});

test('repeated native Save of the same content advances decisionRevision without inventing another draft', async (t) => {
  const { store, open } = await fixture(t);
  const session = await open();
  const body = { key: session.key, status: 6, forcesavetype: 1, filetype: 'docx', url: 'native-same-bytes' };
  const bytes = protectedDocx('unchanged snapshot', '');
  await store.receiveCallback(session.id, body, bytes);
  assert.equal((await store.sessionState(session.id)).decisionRevision, 1);
  await store.receiveCallback(session.id, body, bytes);
  const state = await store.sessionState(session.id);
  assert.equal(state.decisionRevision, 2);
  assert.equal(state.draftRevision, 1);
  assert.equal(state.needsDecision, true);
});

test('download names follow the real converted file type while source extensions stay unchanged', () => {
  assert.equal(officeFileNameWithExtension('合同条款（空白）.doc', 'docx'), '合同条款（空白）.docx');
  assert.equal(officeFileNameWithExtension('报价.XLS', 'xlsx'), '报价.xlsx');
  assert.equal(officeFileNameWithExtension('报告.doc', 'doc'), '报告.doc');
  assert.equal(officeFileNameWithExtension('My document', 'docx'), 'My document.docx');
});
