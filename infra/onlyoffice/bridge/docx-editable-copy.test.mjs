import assert from 'node:assert/strict';
import test from 'node:test';
import { removeDocxProtection, prepareDocxForEditing } from './docx-editable-copy.mjs';
import { protectedDocx, unzipFixture, zipFixture } from './office-test-fixtures.mjs';

test('removes comments-only protection only from settings and keeps every other compressed entry byte-identical', () => {
  const original = protectedDocx();
  const originalCopy = Buffer.from(original);
  const result = removeDocxProtection(original);
  assert.equal(result.protectionRemoved, true);
  assert.deepEqual(original, originalCopy, 'input bytes remain untouched');
  const before = unzipFixture(original);
  const after = unzipFixture(result.bytes);
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [name, entry] of before) {
    if (name !== 'word/settings.xml') assert.deepEqual(after.get(name).raw, entry.raw, name);
  }
  const settings = after.get('word/settings.xml').bytes.toString();
  assert.doesNotMatch(settings, /documentProtection/);
  assert.match(settings, /zoom w:percent="100"/);
});

test('unprotected or missing settings returns exactly the same archive', () => {
  for (const original of [protectedDocx('No protection', ''), zipFixture({ 'word/document.xml': '<document/>' })]) {
    const result = removeDocxProtection(original);
    assert.equal(result.protectionRemoved, false);
    assert.equal(result.bytes, original);
  }
});

test('supports namespace aliases and paired protection elements without stripping unrelated names', () => {
  const original = zipFixture({ 'word/settings.xml': '<s:settings xmlns:s="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:o="other"><s:documentProtection s:edit="readOnly"></s:documentProtection><o:documentProtection keep="yes"/></s:settings>' });
  const result = removeDocxProtection(original);
  const xml = unzipFixture(result.bytes).get('word/settings.xml').bytes.toString();
  assert.equal(result.protectionRemoved, true);
  assert.doesNotMatch(xml, /s:documentProtection/);
  assert.match(xml, /o:documentProtection keep="yes"/);
});

test('rejects truncated, multidisk, duplicate, oversized and corrupt settings archives', () => {
  assert.throws(() => removeDocxProtection(Buffer.from('not a zip')));
  const truncated = protectedDocx().subarray(0, -10);
  assert.throws(() => removeDocxProtection(truncated));
  const multidisk = Buffer.from(protectedDocx());
  multidisk.writeUInt16LE(1, multidisk.length - 18);
  assert.throws(() => removeDocxProtection(multidisk));
  const oversized = zipFixture({ 'word/settings.xml': 'x'.repeat(8 * 1024 * 1024 + 1) });
  assert.throws(() => removeDocxProtection(oversized));
  const corrupt = Buffer.from(protectedDocx());
  const offset = corrupt.indexOf(Buffer.from('word/settings.xml')) + 'word/settings.xml'.length;
  corrupt[offset + 5] ^= 0xff;
  assert.throws(() => removeDocxProtection(corrupt));
});

test('rejects XML entity declarations rather than processing external references', () => {
  const original = zipFixture({ 'word/settings.xml': '<!DOCTYPE settings SYSTEM "http://example.com/secret"><settings/>' });
  assert.throws(() => removeDocxProtection(original), /declarations/);
});

test('font substitution is opt-in, recorded and never changes media or relationship entries', () => {
  const original = protectedDocx();
  const withoutMapping = prepareDocxForEditing(original);
  assert.deepEqual(withoutMapping.fontSubstitutions, []);
  const withMapping = prepareDocxForEditing(original, { Arial: 'Liberation Sans' });
  assert.deepEqual(withMapping.fontSubstitutions, [{ from: 'Arial', to: 'Liberation Sans', count: 2 }]);
  const before = unzipFixture(original);
  const after = unzipFixture(withMapping.bytes);
  assert.match(after.get('word/document.xml').bytes.toString(), /Liberation Sans/);
  for (const name of ['word/media/image.png', 'word/_rels/document.xml.rels', '[Content_Types].xml']) {
    assert.deepEqual(after.get(name).raw, before.get(name).raw);
  }
});
