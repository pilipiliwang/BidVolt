import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { substituteFontNamesInXml, validateFontSubstitutions } from './font-substitutions.mjs';

const MAX_ENTRIES = 20_000;
const MAX_SETTINGS_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readEntries(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARCHIVE_BYTES || bytes.length < 22) throw new Error('Invalid DOCX archive');
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      end = offset;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new Error('Unsupported DOCX archive');
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || count !== bytes.readUInt16LE(end + 8) || centralOffset + centralSize !== end) throw new Error('Invalid DOCX directory');
  const entries = [];
  const names = new Set();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid DOCX entry');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const length = 46 + nameLength + extraLength + commentLength;
    if (offset + length > end) throw new Error('Invalid DOCX entry bounds');
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    if (names.has(name) || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50
      || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error('Unsupported DOCX entry');
    names.add(name);
    const localHeaderSize = 30 + bytes.readUInt16LE(localOffset + 26) + bytes.readUInt16LE(localOffset + 28);
    if (localOffset + localHeaderSize + compressedSize > centralOffset) throw new Error('Invalid DOCX data bounds');
    entries.push({ name, central: Buffer.from(bytes.subarray(offset, offset + length)), localOffset, localHeaderSize,
      compressedSize, uncompressedSize, method: bytes.readUInt16LE(offset + 10), flags: bytes.readUInt16LE(offset + 8) });
    offset += length;
  }
  if (offset !== end) throw new Error('Invalid DOCX directory size');
  const byOffset = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  for (let index = 0; index < byOffset.length; index += 1) {
    const entry = byOffset[index];
    entry.localEnd = byOffset[index + 1]?.localOffset ?? centralOffset;
    if (entry.localOffset + entry.localHeaderSize + entry.compressedSize > entry.localEnd) throw new Error('Overlapping DOCX entries');
  }
  return { entries, byOffset, end };
}

function removeProtectionXml(xml) {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Unsupported DOCX XML declarations');
  const prefixes = [...xml.matchAll(/xmlns(?::([\w.-]+))?\s*=\s*(["'])(.*?)\2/g)]
    .filter((match) => match[3] === WORD_NAMESPACE).map((match) => match[1] ? `${match[1]}:` : '');
  for (const prefix of prefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    xml = xml.replace(new RegExp(`<${escaped}documentProtection\\b[^>]*(?:\\/\\s*>|>[\\s\\S]*?<\\/${escaped}documentProtection\\s*>)`, 'g'), '');
  }
  return xml;
}

export function transformDocxXmlParts(bytes, transform, includePart) {
  const archive = readEntries(bytes);
  const updates = new Map();
  let totalInflated = 0;
  for (const entry of archive.entries) {
    if (!includePart(entry.name)) continue;
    totalInflated += entry.uncompressedSize;
    if (entry.flags & 1 || ![0, 8].includes(entry.method) || entry.uncompressedSize > MAX_SETTINGS_BYTES
      || totalInflated > 64 * 1024 * 1024) throw new Error('Unsupported DOCX XML part');
    const compressed = bytes.subarray(entry.localOffset + entry.localHeaderSize, entry.localOffset + entry.localHeaderSize + entry.compressedSize);
    const plain = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: MAX_SETTINGS_BYTES });
    if (plain.length !== entry.uncompressedSize || crc32(plain) !== entry.central.readUInt32LE(16)) throw new Error('Corrupted DOCX XML part');
    const xml = plain.toString('utf8');
    const changed = transform(entry.name, xml);
    if (changed !== xml) {
      const updatedPlain = Buffer.from(changed);
      if (updatedPlain.length > MAX_SETTINGS_BYTES) throw new Error('Updated DOCX XML part is too large');
      updates.set(entry, { plain: updatedPlain, compressed: deflateRawSync(updatedPlain), crc: crc32(updatedPlain) });
    }
  }
  if (!updates.size) return bytes;
  const chunks = [];
  let cursor = 0;
  for (const entry of archive.byOffset) {
    entry.central.writeUInt32LE(cursor, 42);
    let local;
    const updated = updates.get(entry);
    if (updated) {
      const header = Buffer.from(bytes.subarray(entry.localOffset, entry.localOffset + entry.localHeaderSize));
      header.writeUInt16LE(entry.flags & ~8, 6);
      header.writeUInt16LE(8, 8);
      header.writeUInt32LE(updated.crc, 14);
      header.writeUInt32LE(updated.compressed.length, 18);
      header.writeUInt32LE(updated.plain.length, 22);
      entry.central.writeUInt16LE(entry.flags & ~8, 8);
      entry.central.writeUInt16LE(8, 10);
      entry.central.writeUInt32LE(updated.crc, 16);
      entry.central.writeUInt32LE(updated.compressed.length, 20);
      entry.central.writeUInt32LE(updated.plain.length, 24);
      local = Buffer.concat([header, updated.compressed]);
    } else {
      local = bytes.subarray(entry.localOffset, entry.localEnd);
    }
    chunks.push(local);
    cursor += local.length;
  }
  const central = Buffer.concat(archive.entries.map((entry) => entry.central));
  const end = Buffer.from(bytes.subarray(archive.end));
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(cursor, 16);
  return Buffer.concat([...chunks, central, end]);
}

export function removeDocxProtection(bytes) {
  const edited = transformDocxXmlParts(bytes, (_name, xml) => removeProtectionXml(xml), (name) => name === 'word/settings.xml');
  return { bytes: edited, protectionRemoved: edited !== bytes };
}

export function prepareDocxForEditing(bytes, fontMapping) {
  const mapping = validateFontSubstitutions(fontMapping);
  const hasFonts = Object.keys(mapping).length > 0;
  let protectionRemoved = false;
  const substitutions = new Map();
  const edited = transformDocxXmlParts(bytes, (name, xml) => {
    let changed = xml;
    if (name === 'word/settings.xml') {
      changed = removeProtectionXml(xml);
      protectionRemoved = changed !== xml;
    }
    if (hasFonts) {
      const result = substituteFontNamesInXml(changed, mapping);
      changed = result.xml;
      for (const item of result.substitutions) {
        const key = `${item.from}\0${item.to}`;
        const prior = substitutions.get(key);
        substitutions.set(key, { ...item, count: item.count + (prior?.count || 0) });
      }
    }
    return changed;
  }, (name) => name === 'word/settings.xml' || hasFonts && /^word\/.*\.xml$/.test(name));
  return { bytes: edited, protectionRemoved, fontSubstitutions: [...substitutions.values()] };
}
