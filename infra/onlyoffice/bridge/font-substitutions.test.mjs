import assert from 'node:assert/strict';
import test from 'node:test';
import { substituteFontNamesInXml, validateFontSubstitutions } from './font-substitutions.mjs';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const mapping = { '宋体': 'Source Han Serif CN', '黑体': 'Source Han Sans CN', 'Calibri': 'Liberation Sans' };

test('default empty configuration is opt-in and unchanged', () => {
  assert.deepEqual(validateFontSubstitutions(undefined), {});
  assert.deepEqual(substituteFontNamesInXml('<invalid but not edited', undefined), { xml: '<invalid but not edited', substitutions: [] });
});

test('validates mapping shape, family values, prototype keys and chains', () => {
  for (const value of [null, [], '', 1, { x: 1 }, { x: '' }, { x: ' x' }, { x: 'a\n' }, JSON.parse('{"__proto__":"x"}'), { x: 'y', y: 'z' }]) {
    assert.throws(() => validateFontSubstitutions(value), TypeError);
  }
  assert.deepEqual(validateFontSubstitutions({ x: 'x', y: 'z' }), { y: 'z' });
});

test('replaces only explicit Word font attrs and preserves body, drawings and whitespace', () => {
  const xml = `<w:document xmlns:w="${w}"><w:r><w:rPr><w:rFonts w:ascii='Calibri' w:hAnsi="Calibri" w:eastAsia="宋体" w:cs="黑体" w:hint="宋体" /></w:rPr><w:t>宋体 Calibri 黑体</w:t><w:drawing r:embed="宋体" xmlns:r="urn:r"/></w:r></w:document>`;
  const result = substituteFontNamesInXml(xml, mapping);
  assert.ok(result.xml.includes("w:ascii='Liberation Sans'"));
  assert.ok(result.xml.includes('w:eastAsia="Source Han Serif CN"'));
  assert.ok(result.xml.includes('w:hint="宋体"'));
  assert.ok(result.xml.includes('<w:t>宋体 Calibri 黑体</w:t>'));
  assert.ok(result.xml.includes('r:embed="宋体"'));
  assert.deepEqual(result.substitutions, [
    { from: 'Calibri', to: 'Liberation Sans', count: 2 },
    { from: '宋体', to: 'Source Han Serif CN', count: 1 },
    { from: '黑体', to: 'Source Han Sans CN', count: 1 },
  ]);
  assert.deepEqual(substituteFontNamesInXml(result.xml, mapping), { xml: result.xml, substitutions: [] });
});

test('handles fontTable, alternate prefixes, strict namespace and scoped namespaces', () => {
  const xml = `<x:fonts xmlns:x="${w}"><x:font x:name="宋体"/><inner xmlns:x="urn:other"><x:font x:name="宋体"/></inner><x:font x:name="黑体"/></x:fonts>`;
  const result = substituteFontNamesInXml(xml, mapping);
  assert.equal(result.substitutions.length, 2);
  assert.ok(result.xml.includes('<x:font x:name="宋体"/></inner>'));
  const strict = `<p:rFonts xmlns:p="http://purl.oclc.org/ooxml/wordprocessingml/main" p:eastAsia="宋体"/>`;
  assert.ok(substituteFontNamesInXml(strict, mapping).xml.includes('Source Han Serif CN'));
});

test('replaces theme font typefaces without replacing script names or theme language', () => {
  const xml = `<a:theme xmlns:a="${a}"><a:latin typeface="Calibri"/><a:ea typeface="宋体"/><a:cs typeface="黑体"/><a:font script="宋体" typeface="宋体"/><a:other typeface="宋体"/></a:theme>`;
  const result = substituteFontNamesInXml(xml, mapping);
  assert.equal(result.substitutions.reduce((sum, item) => sum + item.count, 0), 4);
  assert.ok(result.xml.includes('script="宋体"'));
  assert.ok(result.xml.includes('<a:other typeface="宋体"/>'));
});

test('decodes named/numeric entities and escapes replacement font names correctly', () => {
  const xml = `<w:rFonts xmlns:w="${w}" w:ascii="A&amp;B" w:hAnsi='&#x5B8B;&#20307;'/>`;
  const result = substituteFontNamesInXml(xml, { 'A&B': `C&<D>"'`, '宋体': 'Source Han Serif CN' });
  assert.ok(result.xml.includes('w:ascii="C&amp;&lt;D&gt;&quot;&apos;"'));
  assert.ok(result.xml.includes("w:hAnsi='Source Han Serif CN'"));
});

test('does not touch comments, CDATA, processing instructions or wrong namespaces', () => {
  const sample = `<w:rFonts w:ascii="Calibri"/>`;
  const xml = `<root xmlns:w="${w}"><!-- ${sample} --><![CDATA[${sample}]]><?test value='${sample}'?><z:rFonts xmlns:z="urn:wrong" z:ascii="Calibri"/></root>`;
  assert.deepEqual(substituteFontNamesInXml(xml, mapping), { xml, substitutions: [] });
});

test('rejects DTD and malformed nesting rather than rewriting ambiguous XML', () => {
  for (const xml of ['<!DOCTYPE x [<!ENTITY y "宋体">]><x/>', '<x><y></x>', '<x>']) {
    assert.throws(() => substituteFontNamesInXml(xml, mapping), TypeError);
  }
});
