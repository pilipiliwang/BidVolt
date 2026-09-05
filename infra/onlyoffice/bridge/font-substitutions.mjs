// Explicit, disclosed substitution in an editable COPY only. This does not rename font binaries.
const WORD_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);
const DRAWING_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main',
]);
const FONT_ATTRIBUTES = new Set(['ascii', 'hAnsi', 'eastAsia', 'cs']);
const DRAWING_FONT_ELEMENTS = new Set(['latin', 'ea', 'cs', 'font']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function validateFontSubstitutions(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Font substitutions must be a plain JSON object.');
  }
  const entries = Object.entries(value);
  if (entries.length > 128) throw new TypeError('Too many font substitutions.');
  for (const [from, to] of entries) {
    for (const name of [from, to]) {
      if (typeof name !== 'string' || !name.trim() || name !== name.trim()
          // Reject control characters in external configuration intentionally.
          // eslint-disable-next-line no-control-regex
          || name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name) || UNSAFE_KEYS.has(name)) {
        throw new TypeError('Invalid font substitution family name.');
      }
    }
    // Chained rewrites would change again when a previously edited file is reopened.
    if (to !== from && Object.hasOwn(value, to) && value[to] !== to) {
      throw new TypeError('Chained font substitutions are not supported.');
    }
  }
  return Object.fromEntries(entries.filter(([from, to]) => from !== to));
}

function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    if (!entity.startsWith('&#')) return entity;
    const code = entity[2].toLowerCase() === 'x'
      ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : entity;
  });
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function nameParts(name) {
  const colon = name.indexOf(':');
  return colon < 0 ? ['', name] : [name.slice(0, colon), name.slice(colon + 1)];
}

/**
 * Patch only explicit OOXML font-name attributes, preserving all other bytes.
 * A namespace-aware tag scanner avoids reserializing the document (including images).
 * Comments, CDATA, processing instructions and body text are never edited.
 */
export function substituteFontNamesInXml(xml, substitutions) {
  if (typeof xml !== 'string') throw new TypeError('Expected an XML string.');
  const mapping = validateFontSubstitutions(substitutions);
  if (!Object.keys(mapping).length) return { xml, substitutions: [] };
  const stack = [{ name: '', namespaces: new Map() }];
  const edits = [];
  const counts = new Map();
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE\b[\s\S]*?(?:\]>|>)|<(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  for (const token of xml.matchAll(tokens)) {
    const tag = token[0];
    if (/^<!DOCTYPE/i.test(tag)) throw new TypeError('DTD is not supported in OOXML font substitution.');
    if (tag.startsWith('<!') || tag.startsWith('<?')) continue;
    const tagName = /^<\/?\s*([A-Za-z_][\w.:-]*)/.exec(tag)?.[1];
    if (!tagName) continue;
    if (tag.startsWith('</')) {
      if (stack.length === 1 || stack[stack.length - 1].name !== tagName) {
        throw new TypeError('Unbalanced XML during font substitution.');
      }
      stack.pop();
      continue;
    }
    const namespaces = new Map(stack[stack.length - 1].namespaces);
    const attributes = [...tag.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g)];
    for (const attribute of attributes) {
      if (attribute[1] === 'xmlns') namespaces.set('', decodeXml(attribute[3]));
      else if (attribute[1].startsWith('xmlns:')) namespaces.set(attribute[1].slice(6), decodeXml(attribute[3]));
    }
    const [prefix, element] = nameParts(tagName);
    const elementNamespace = namespaces.get(prefix);
    for (const attribute of attributes) {
      const [attributePrefix, name] = nameParts(attribute[1]);
      const attributeNamespace = attributePrefix ? namespaces.get(attributePrefix) : undefined;
      const isWordFont = WORD_NAMESPACES.has(elementNamespace)
        && WORD_NAMESPACES.has(attributeNamespace)
        && ((element === 'rFonts' && FONT_ATTRIBUTES.has(name)) || (element === 'font' && name === 'name'));
      const isDrawingFont = DRAWING_NAMESPACES.has(elementNamespace)
        && DRAWING_FONT_ELEMENTS.has(element) && name === 'typeface'
        && (!attributePrefix || DRAWING_NAMESPACES.has(attributeNamespace));
      if (!isWordFont && !isDrawingFont) continue;
      const from = decodeXml(attribute[3]);
      if (!Object.hasOwn(mapping, from)) continue;
      const to = mapping[from];
      const quoteIndex = attribute[0].indexOf(attribute[2]);
      const start = token.index + attribute.index + quoteIndex + 1;
      edits.push({ start, end: start + attribute[3].length, value: escapeXml(to) });
      const existing = counts.get(from);
      counts.set(from, { from, to, count: (existing?.count ?? 0) + 1 });
    }
    if (!/\/\s*>$/.test(tag)) stack.push({ name: tagName, namespaces });
  }
  if (stack.length !== 1) throw new TypeError('Unclosed XML during font substitution.');
  // Large technical volumes contain thousands of runs: assemble once, not one
  // full-document string allocation per changed attribute.
  const chunks = [];
  let cursor = 0;
  for (const edit of edits) {
    chunks.push(xml.slice(cursor, edit.start), edit.value);
    cursor = edit.end;
  }
  chunks.push(xml.slice(cursor));
  return { xml: chunks.join(''), substitutions: [...counts.values()] };
}
