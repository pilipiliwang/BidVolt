import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { validateFontSubstitutions } from '../bridge/font-substitutions.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('all fonts have pinned official sources, matching licenses and safe filenames', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fonts.length, 6);
  const files = new Set();
  for (const font of manifest.fonts) {
    assert.match(font.file, /^[A-Za-z0-9][A-Za-z0-9._-]+\.(otf|ttf)$/);
    assert.ok(!files.has(font.file));
    files.add(font.file);
    assert.match(font.sha256, /^[a-f0-9]{64}$/);
    assert.ok(font.url.includes(`/${font.version}/`));
    assert.ok(['github.com', 'raw.githubusercontent.com'].includes(new URL(font.url).hostname));
    assert.ok(manifest.licenses.some((license) => license.file === font.license));
    if (font.archive) {
      assert.equal(font.archive.entry, font.file);
      assert.match(font.archive.sha256, /^[a-f0-9]{64}$/);
    }
  }
});

test('copyright and OFL texts are included byte-for-byte', () => {
  for (const license of manifest.licenses) {
    const path = join(root, 'licenses', license.file);
    assert.equal(hash(path), license.sha256);
    const content = readFileSync(path, 'utf8');
    assert.match(content, /Copyright/);
    assert.match(content, /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});

test('fontconfig aliases preserve real font names and use installed family names', () => {
  const config = readFileSync(join(root, '64-bidvolt-cjk.conf'), 'utf8');
  assert.ok(!config.includes('<prefer>'));
  assert.ok(!config.includes('<edit'));
  const aliases = [...config.matchAll(/<alias binding="same"><family>(.*?)<\/family><accept><family>(.*?)<\/family><\/accept><\/alias>/g)];
  assert.equal(aliases.length, 18);
  const families = new Set(manifest.fonts.map((font) => font.family));
  for (const [, , target] of aliases) assert.ok(families.has(target), target);
  assert.ok(aliases.some(([, source]) => source === '仿宋_GB2312'));
});

test('available font binaries exactly match downloaded upstream assets', (context) => {
  const missing = manifest.fonts.filter((font) => !existsSync(join(root, font.file)));
  if (missing.length) {
    if (process.env.BIDVOLT_REQUIRE_FONT_BINARIES === '1') assert.fail(`Missing: ${missing.map((font) => font.file).join(', ')}`);
    context.skip('Fonts are intentionally not committed; run prepare-fonts.ps1 for binary verification.');
    return;
  }
  for (const font of manifest.fonts) assert.equal(hash(join(root, font.file)), font.sha256, font.file);
});

test('refresh is explicit and suppresses upstream service restart', () => {
  const script = readFileSync(join(root, 'refresh-fonts.sh'), 'utf8');
  assert.match(script, /documentserver-generate-allfonts\.sh true/);
  assert.ok(!script.includes('\r'));
  assert.ok(!/supervisorctl|docker restart|systemctl restart/.test(script));
});

test('explicit working-copy mappings target real bundled or existing open-source families', () => {
  const substitutions = validateFontSubstitutions(JSON.parse(readFileSync(join(root, 'substitutions.json'), 'utf8')));
  const families = new Set([...manifest.fonts.map((font) => font.family), 'Liberation Sans']);
  assert.equal(Object.keys(substitutions).length, 19);
  for (const family of Object.values(substitutions)) assert.ok(families.has(family), family);
  assert.equal(substitutions['仿宋_GB2312'], 'Zhuque Fangsong (technical preview)');
});
