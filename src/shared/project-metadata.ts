/** Compatibility storage in the existing server-side project note, not browser storage.
 * Package number is deliberately distinct from the procurement/tender number.
 * Keep human notes and unknown metadata untouched until native fields are available.
 */
const START = '[BidVolt 项目扩展信息 v1]';
const END = '[/BidVolt 项目扩展信息]';

export type ProjectMetadata = { authorName?: string; packageNo?: string };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function parse(note: string | null | undefined) {
  const original = note ?? '';
  const start = original.indexOf(START);
  if (start < 0) return { original, start, end: -1, data: {} as Record<string, unknown> };
  const end = original.indexOf(END, start + START.length);
  if (end < 0) throw new Error('项目扩展信息不完整，请先保留原备注并联系管理员处理。');
  const data: unknown = JSON.parse(original.slice(start + START.length, end).trim());
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('项目扩展信息格式无效，未覆盖原备注。');
  return { original, start, end: end + END.length, data: data as Record<string, unknown> };
}

export function readProjectMetadata(note: string | null | undefined): ProjectMetadata {
  try {
    const { data } = parse(note);
    return { authorName: text(data.authorName) || undefined, packageNo: text(data.packageNo) || undefined };
  } catch { return {}; }
}

export function updateProjectMetadata(note: string | null | undefined, patch: ProjectMetadata): string {
  const { original, start, end, data } = parse(note);
  const next = { ...data };
  for (const key of ['authorName', 'packageNo'] as const) {
    if (patch[key] !== undefined) next[key] = patch[key]!.trim();
  }
  const block = `${START}\n${JSON.stringify(next)}\n${END}`;
  return start < 0 ? `${original}${original ? '\n\n' : ''}${block}`
    : `${original.slice(0, start)}${block}${original.slice(end)}`;
}

export function projectMetadataFields(project: {
  note?: string | null; author_name?: string | null; package_no?: string | null;
}): ProjectMetadata {
  const compatibility = readProjectMetadata(project.note);
  return {
    authorName: text(project.author_name) || compatibility.authorName,
    packageNo: text(project.package_no) || compatibility.packageNo,
  };
}
