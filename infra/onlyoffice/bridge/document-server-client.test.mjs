import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentServerClient } from './document-server-client.mjs';

function client(fetchImpl, extra = {}) {
  return createDocumentServerClient({ internalUrl: 'http://document-server', publicUrl: 'http://localhost:8080',
    signJwt: () => 'signed-token', fetchImpl, ...extra });
}

test('force save signs the command and correlates the request id in callback userdata', async () => {
  const calls = [];
  const api = client(async (url, options) => { calls.push({ url, options }); return Response.json({ error: 0 }); });
  assert.deepEqual(await api.forceSave('document-key', 'request-uuid'), { error: 0 });
  assert.equal(calls[0].url.href, 'http://document-server/coauthoring/CommandService.ashx');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.c, 'forcesave');
  assert.equal(body.key, 'document-key');
  assert.deepEqual(JSON.parse(body.userdata), { saveRequestId: 'request-uuid' });
  assert.equal(body.token, 'signed-token');
  assert.equal(calls[0].options.headers.AuthorizationJwt, 'Bearer signed-token');
  assert.equal(calls[0].options.redirect, 'error');
});

test('legacy DOC conversion downloads actual OOXML bytes and uses a separate conversion key', async () => {
  const requests = [];
  const bytes = Buffer.from('converted bytes');
  const api = client(async (url, options) => {
    requests.push({ url, options });
    return url.pathname === '/converter'
      ? Response.json({ endConvert: true, fileUrl: 'http://localhost:8080/cache/converted.docx' })
      : new Response(bytes);
  });
  const result = await api.convertLegacy({ key: 'session-key', url: 'http://editor-bridge:8081/working', fileType: 'doc', title: 'source.doc' });
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.fileType, 'docx');
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.filetype, 'doc');
  assert.equal(payload.outputtype, 'docx');
  assert.equal(payload.async, false);
  assert.equal(payload.key, 'session-key-working-copy');
  assert.equal(requests[1].url.href, 'http://document-server/cache/converted.docx');
});

test('conversion failure is explicit and never claims the source is editable', async () => {
  const api = client(async () => Response.json({ error: -3 }));
  await assert.rejects(api.convertLegacy({ key: 'k', fileType: 'doc' }), { code: 'legacy-conversion-failed' });
});

test('callback downloads reject unexpected origins, credentials and URL origin prefix attacks', async () => {
  let requested = false;
  const api = client(async () => { requested = true; return new Response('bad'); });
  for (const url of ['http://evil.test/docx', 'http://localhost:8080.evil.test/file', 'http://document-server:81/file', 'http://user:pass@document-server/file']) {
    await assert.rejects(api.download(url));
  }
  assert.equal(requested, false);
});

test('streamed and declared download sizes are enforced before full buffering', async () => {
  const api = client(async () => new Response('12345'), { maxDocumentBytes: 4 });
  await assert.rejects(api.download('http://document-server/docx'), { code: 'document-too-large' });
  const declared = client(async () => new Response('1', { headers: { 'content-length': '5' } }), { maxDocumentBytes: 4 });
  await assert.rejects(declared.download('http://document-server/docx'), { code: 'document-too-large' });
});
