import type {
  OutcomeFileKind,
  OutcomeFileSaveStatus,
  OutcomeSpreadsheetCell,
  OutcomeSpreadsheetCellInput,
  OutcomeSpreadsheetSheet,
  OutcomeWordBlock,
  OutcomeWordDocument,
  OutcomeWordOutlineItem,
  OutcomeWordPage,
  OutcomeWorkbook,
  OutcomeWorkspaceFile,
} from './OutcomeFileWorkspace';
import type {
  ProjectEnterpriseCategory,
  ProjectEnterpriseFile,
  ProjectResultCategory,
  ProjectResultFile,
  ProjectTenderMaterial,
  ProjectTenderMaterialKind,
} from './ProjectResourceRail';
import { outcomeImageDimension, safeOutcomeImageSource } from './outcome-image-source';

/**
 * Structural inputs keep this adapter independent from the page components that
 * currently own the legacy view types. ProjectDeliverableView,
 * EnterpriseAssetCategoryFolder and WorkspaceMaterial are all assignable to
 * these contracts without creating a runtime import cycle.
 */
export type ProjectDeliverableAdapterInput = {
  fileId?: number | string;
  id: string;
  mediaType?: string;
  name?: string;
  sizeLabel?: string;
  statusLabel?: string;
  title: string;
  versionId?: number | string;
};

export type WorkspaceMaterialAdapterInput = {
  categoryId?: string | null;
  fileId?: string;
  id: string;
  kind?: string;
  mimeType?: string;
  name: string;
  purpose?: string;
  sizeLabel?: string;
  status?: string;
};

export type EnterpriseCategoryAdapterInput = {
  id: string;
  label: string;
  parentId?: string | null;
};

export type DeliverableContentAdapterInput = {
  model?: unknown;
  version_no?: number | string;
};

export type OutcomeWorkspaceFileAdapterOptions = {
  contentRevision?: number | string;
  downloadUrl?: string;
  fileId?: number | string;
  fileKind?: OutcomeFileKind;
  fileName?: string;
  htmlSource?: string;
  mimeType?: string;
  previewUrl?: string;
  readOnly?: boolean;
  saveStatus?: OutcomeFileSaveStatus;
  version?: number | string;
};

const RESULT_CATEGORY_BY_DELIVERABLE: Readonly<Record<string, ProjectResultCategory>> = {
  business: 'business',
  internal: 'internal',
  quote: 'price',
  technical: 'technical',
};

const RESULT_CATEGORY_LABELS: Readonly<Record<ProjectResultCategory, string>> = {
  business: '商务文件',
  internal: '内部管理文件',
  price: '价格文件',
  technical: '技术文件',
  unclassified: '待分类成果',
};

const DEFAULT_RESULT_MIME_TYPES: Readonly<Record<'business' | 'internal' | 'quote' | 'technical', string>> = {
  business: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  internal: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  quote: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  technical: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function adaptProjectEnterpriseCategories(
  categories: readonly EnterpriseCategoryAdapterInput[],
): ProjectEnterpriseCategory[] {
  return categories.flatMap((category) => {
    const id = category.id.trim();
    if (!id) return [];
    return [{
      id,
      label: category.label.trim() || `分类 #${id}`,
      parentId: category.parentId ?? null,
    }];
  });
}

export function adaptProjectEnterpriseFiles(
  materials: readonly WorkspaceMaterialAdapterInput[],
): ProjectEnterpriseFile[] {
  return materials.flatMap((material) => {
    const id = material.id.trim();
    const name = material.name.trim();
    if (!id || !name) return [];
    return [{
      categoryId: material.categoryId ?? null,
      ...(material.fileId ? { fileId: material.fileId } : {}),
      id,
      name,
      ...(material.sizeLabel ? { sizeLabel: material.sizeLabel } : {}),
      ...(material.status ? { statusLabel: material.status } : {}),
    }];
  });
}

export function adaptProjectTenderMaterials(
  materials: readonly WorkspaceMaterialAdapterInput[],
): ProjectTenderMaterial[] {
  return materials.flatMap((material) => {
    const id = material.id.trim();
    const name = material.name.trim();
    if (!id || !name) return [];
    const kind = tenderMaterialKind(material);
    return [{
      ...(material.fileId ? { fileId: material.fileId } : {}),
      id,
      name,
      ...(kind ? { kind } : {}),
      ...(material.sizeLabel ? { sizeLabel: material.sizeLabel } : {}),
      ...(material.status ? { statusLabel: material.status } : {}),
    }];
  });
}

export function adaptProjectResultFiles(
  deliverables: readonly ProjectDeliverableAdapterInput[],
): ProjectResultFile[] {
  return deliverables.flatMap((deliverable) => {
    const category = RESULT_CATEGORY_BY_DELIVERABLE[deliverable.id];
    if (!category) return [];
    const name = (deliverable.name ?? deliverable.title).trim();
    if (!name) return [];
    const versionLabel = normalizeVersion(deliverable.versionId);
    return [{
      category,
      id: String(deliverable.fileId ?? deliverable.id),
      mediaType: deliverable.mediaType ?? DEFAULT_RESULT_MIME_TYPES[deliverable.id as keyof typeof DEFAULT_RESULT_MIME_TYPES],
      name,
      ...(deliverable.sizeLabel ? { sizeLabel: deliverable.sizeLabel } : {}),
      ...(deliverable.statusLabel ? { statusLabel: deliverable.statusLabel } : {}),
      ...(versionLabel ? { versionLabel } : {}),
    }];
  });
}

/**
 * Creates the file model used by the embedded Office-like workspace. Unknown or
 * malformed document content deliberately becomes an empty pages/sheets model,
 * which lets the view show its explicit "content pending" state.
 */
export function adaptOutcomeWorkspaceFile(
  deliverable: ProjectDeliverableAdapterInput,
  content?: DeliverableContentAdapterInput | null,
  options: OutcomeWorkspaceFileAdapterOptions = {},
): OutcomeWorkspaceFile | undefined {
  const category = RESULT_CATEGORY_BY_DELIVERABLE[deliverable.id];
  if (!category) return undefined;
  const mimeType = options.mimeType ?? deliverable.mediaType
    ?? DEFAULT_RESULT_MIME_TYPES[deliverable.id as keyof typeof DEFAULT_RESULT_MIME_TYPES];
  const kind = options.fileKind ?? outcomeKindFromMimeType(mimeType)
    ?? (deliverable.id === 'quote' ? 'spreadsheet' : 'word');
  const model = content?.model;
  const version = normalizeVersion(options.version ?? content?.version_no ?? deliverable.versionId);
  const file: OutcomeWorkspaceFile = {
    categoryId: category,
    categoryLabel: RESULT_CATEGORY_LABELS[category],
    id: String(options.fileId ?? deliverable.fileId ?? deliverable.id),
    kind,
    mimeType,
    name: (options.fileName ?? deliverable.name ?? deliverable.title).trim()
      || `未命名${RESULT_CATEGORY_LABELS[category]}`,
    // Legacy deliverables carry no edit capability. Stay read-only until the
    // backend explicitly grants an editing session.
    readOnly: options.readOnly ?? true,
    ...(options.contentRevision !== undefined
      ? { contentRevision: options.contentRevision }
      : content?.version_no !== undefined
        ? { contentRevision: content.version_no }
        : {}),
    ...(options.downloadUrl ? { downloadUrl: options.downloadUrl } : {}),
    ...(options.previewUrl ? { previewUrl: options.previewUrl } : {}),
    ...(options.saveStatus ? { saveStatus: options.saveStatus } : {}),
    ...(version ? { version } : {}),
  };

  if (kind === 'word') file.wordDocument = extractOutcomeWordDocument(model);
  if (kind === 'spreadsheet') file.workbook = extractOutcomeWorkbook(model);
  if (kind === 'html') {
    const htmlSource = options.htmlSource ?? firstString(asRecord(model), ['html', 'content', 'body']);
    if (htmlSource) file.htmlSource = htmlSource;
  }
  return file;
}

export function extractOutcomeWordDocument(model: unknown): OutcomeWordDocument {
  const root = documentModelRecord(model);
  if (!root) return { pages: [] };

  let pages = Array.isArray(root.pages)
    ? root.pages.flatMap((page, index) => adaptWordPage(page, index))
    : [];

  if (pages.length === 0) {
    const nodes = Array.isArray(root.nodes)
      ? root.nodes
      : Array.isArray(root.blocks)
        ? root.blocks
        : [];
    pages = pagesFromFlatWordNodes(nodes);
  }

  if (pages.length === 0) {
    const html = firstString(root, ['html', 'content', 'body']);
    if (html) pages = pagesFromWordHtml(html);
  }

  const outline = adaptWordOutline(root.outline, pages);
  return outline.length > 0 ? { outline, pages } : { pages };
}

export function extractOutcomeWorkbook(model: unknown): OutcomeWorkbook {
  const root = workbookModelRecord(model);
  if (!root || !Array.isArray(root.sheets)) return { sheets: [] };
  return {
    sheets: root.sheets.flatMap((sheet, index) => adaptSpreadsheetSheet(sheet, index)),
  };
}

function tenderMaterialKind(
  material: WorkspaceMaterialAdapterInput,
): ProjectTenderMaterialKind | undefined {
  const purpose = material.purpose?.trim().toLocaleLowerCase();
  const kind = material.kind?.trim().toLocaleLowerCase();
  if (purpose === 'supplemental' || kind === 'clarification' || kind === 'supplement') {
    return 'supplement';
  }
  if (kind === 'tender_notice' || kind === 'notice') return 'notice';
  if (kind === 'tender_document' || kind === 'tender') return 'tender';
  // Do not infer a persisted role from a filename such as "公告.html".
  return undefined;
}

function documentModelRecord(model: unknown) {
  const root = asRecord(model);
  if (!root) return undefined;
  for (const key of ['wordDocument', 'word_document', 'document']) {
    const nested = asRecord(root[key]);
    if (nested) return nested;
  }
  return root;
}

function workbookModelRecord(model: unknown) {
  const root = asRecord(model);
  if (!root) return undefined;
  for (const key of ['workbook', 'spreadsheet']) {
    const nested = asRecord(root[key]);
    if (nested) return nested;
  }
  return root;
}

function adaptWordPage(candidate: unknown, index: number): OutcomeWordPage[] {
  const page = asRecord(candidate);
  if (!page) return [];
  const rawBlocks = Array.isArray(page.blocks)
    ? page.blocks
    : Array.isArray(page.nodes)
      ? page.nodes
      : [];
  const blocks = rawBlocks.flatMap((block, blockIndex) => adaptWordBlock(block, blockIndex));
  const id = firstId(page, ['id', 'pageId', 'page_id']) ?? `page-${index + 1}`;
  const label = firstString(page, ['label', 'title']);
  return [{ id, blocks, ...(label ? { label } : {}) }];
}

function adaptWordBlock(candidate: unknown, index: number): OutcomeWordBlock[] {
  const block = asRecord(candidate);
  if (!block) return [];
  const text = firstString(block, ['text', 'content', 'value'])?.trim();
  const rawType = firstString(block, ['type', 'blockType', 'block_type'])?.toLocaleLowerCase();
  const image = asRecord(block.image);
  if (['image', 'img', 'picture', 'figure'].includes(rawType ?? '') || image) {
    const source = safeOutcomeImageSource(firstString(image ?? block, ['src', 'url', 'image_url', 'imageUrl', 'dataUrl']));
    return [{
      id: firstId(block, ['id', 'blockId', 'block_id']) ?? `block-${index + 1}`,
      type: 'image', text: text ?? '',
      image: {
        ...(source ? { src: source } : {}),
        alt: firstString(image ?? block, ['alt', 'alt_text', 'description']) ?? '',
        width: outcomeImageDimension((image ?? block).width),
        height: outcomeImageDimension((image ?? block).height),
      },
    }];
  }
  if (!text) return [];
  const type = outcomeWordBlockType(rawType);
  const level = headingLevel(block.level ?? block.headingLevel ?? block.heading_level);
  const id = firstId(block, ['id', 'blockId', 'block_id']) ?? `block-${index + 1}`;
  return [{
    id,
    text,
    ...(type ? { type } : {}),
    ...(level ? { level } : {}),
  }];
}

function pagesFromFlatWordNodes(nodes: readonly unknown[]): OutcomeWordPage[] {
  const pages = new Map<string, OutcomeWordPage>();
  nodes.forEach((candidate, nodeIndex) => {
    const node = asRecord(candidate);
    if (!node) return;
    const [block] = adaptWordBlock(node, nodeIndex);
    if (!block) return;
    const pageNumber = finitePositiveInteger(node.pageNo ?? node.page_no);
    const pageId = firstId(node, ['pageId', 'page_id'])
      ?? (pageNumber ? `page-${pageNumber}` : 'page-1');
    const page = pages.get(pageId) ?? { id: pageId, blocks: [] };
    page.blocks.push(block);
    pages.set(pageId, page);
  });
  return [...pages.values()];
}

function pagesFromWordHtml(html: string): OutcomeWordPage[] {
  if (typeof document === 'undefined') return [];
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks: OutcomeWordBlock[] = [];
  const visit = (parent: ParentNode, type: OutcomeWordBlock['type'] = 'paragraph', level?: 1 | 2 | 3) => {
    let text = '';
    const flush = () => {
      if (text.trim()) blocks.push({ id: `html-block-${blocks.length + 1}`, level, text: text.trim(), type });
      text = '';
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) { text += node.textContent ?? ''; return; }
      if (!(node instanceof Element)) return;
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg', 'head'].includes(tag)) return;
      if (tag === 'img') {
        flush();
        const source = safeOutcomeImageSource(node.getAttribute('src'));
        blocks.push({ id: `html-block-${blocks.length + 1}`, type: 'image', text: '', image: {
          ...(source ? { src: source } : {}), alt: node.getAttribute('alt') || '',
          width: outcomeImageDimension(node.getAttribute('width')), height: outcomeImageDimension(node.getAttribute('height')),
        } });
      } else if (/^h[1-6]$/.test(tag) || ['p', 'li', 'blockquote', 'div', 'table', 'tr', 'figcaption'].includes(tag)) {
        flush();
        visit(node, /^h[1-6]$/.test(tag) ? 'heading' : tag === 'li' ? 'list-item' : tag === 'blockquote' ? 'quote' : 'paragraph',
          /^h[1-6]$/.test(tag) ? Math.min(3, Number(tag.slice(1))) as 1 | 2 | 3 : undefined);
      } else if (tag === 'br') text += '\n';
      else node.childNodes.forEach(walk);
    };
    parent.childNodes.forEach(walk);
    flush();
  };
  visit(template.content);
  return blocks.length > 0 ? [{ blocks, id: 'page-1', label: '连续内容' }] : [];
}

function adaptWordOutline(
  candidate: unknown,
  pages: readonly OutcomeWordPage[],
): OutcomeWordOutlineItem[] {
  const pageIds = new Set(pages.map((page) => page.id));
  const pageByBlock = new Map<string, string>();
  pages.forEach((page) => page.blocks.forEach((block) => pageByBlock.set(block.id, page.id)));
  const direct = Array.isArray(candidate)
    ? candidate.flatMap((item, index): OutcomeWordOutlineItem[] => {
        const record = asRecord(item);
        if (!record) return [];
        const label = firstString(record, ['label', 'title', 'text'])?.trim();
        const blockId = firstId(record, ['blockId', 'block_id']);
        const pageId = firstId(record, ['pageId', 'page_id'])
          ?? (blockId ? pageByBlock.get(blockId) : undefined);
        if (!label || !pageId || !pageIds.has(pageId)) return [];
        const level = headingLevel(record.level ?? record.headingLevel ?? record.heading_level);
        return [{
          id: firstId(record, ['id', 'outlineId', 'outline_id']) ?? `outline-${index + 1}`,
          label,
          pageId,
          ...(blockId ? { blockId } : {}),
          ...(level ? { level } : {}),
        }];
      })
    : [];
  if (direct.length > 0) return direct;
  return pages.flatMap((page) => page.blocks.flatMap((block): OutcomeWordOutlineItem[] =>
    block.type === 'heading'
      ? [{
          blockId: block.id,
          id: `outline-${page.id}-${block.id}`,
          label: block.text,
          level: block.level ?? 1,
          pageId: page.id,
        }]
      : []));
}

function adaptSpreadsheetSheet(
  candidate: unknown,
  index: number,
): OutcomeSpreadsheetSheet[] {
  const sheet = asRecord(candidate);
  if (!sheet) return [];
  const id = firstId(sheet, ['id', 'sheetId', 'sheet_id']) ?? `sheet-${index + 1}`;
  const name = firstString(sheet, ['name', 'sheetName', 'sheet_name', 'title'])?.trim();
  if (!name) return [];
  const rawRows = Array.isArray(sheet.rows)
    ? sheet.rows
    : Array.isArray(sheet.data)
      ? sheet.data
      : [];
  return [{
    id,
    name,
    rows: rawRows.flatMap((row) => Array.isArray(row)
      ? [row.map(adaptSpreadsheetCell)]
      : []),
  }];
}

function adaptSpreadsheetCell(candidate: unknown): OutcomeSpreadsheetCellInput {
  if (isSpreadsheetPrimitive(candidate)) return candidate;
  const cell = asRecord(candidate);
  if (!cell) return null;
  const rawValue = cell.value;
  const value = isSpreadsheetPrimitive(rawValue) ? rawValue : null;
  const displayValue = firstString(cell, ['displayValue', 'display_value', 'formatted']);
  const formula = firstString(cell, ['formula']);
  const readOnly = firstBoolean(cell, ['readOnly', 'read_only']);
  const result: OutcomeSpreadsheetCell = { value };
  if (displayValue !== undefined) result.displayValue = displayValue;
  if (formula !== undefined) result.formula = formula;
  if (readOnly !== undefined) result.readOnly = readOnly;
  return result;
}

function outcomeKindFromMimeType(mimeType?: string): OutcomeFileKind | undefined {
  const normalized = mimeType?.trim().toLocaleLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('spreadsheet') || normalized.includes('excel')) return 'spreadsheet';
  if (normalized.includes('wordprocessingml') || normalized.includes('msword')) return 'word';
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('html')) return 'html';
  return 'other';
}

function outcomeWordBlockType(value?: string): OutcomeWordBlock['type'] | undefined {
  if (!value) return undefined;
  if (value === 'heading' || value.startsWith('heading_') || /^h[1-6]$/.test(value)) return 'heading';
  if (value === 'paragraph' || value === 'text') return 'paragraph';
  if (value === 'list-item' || value === 'list_item' || value === 'li') return 'list-item';
  if (value === 'quote' || value === 'blockquote') return 'quote';
  return undefined;
}

function headingLevel(value: unknown): 1 | 2 | 3 | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(3, Math.trunc(parsed)) as 1 | 2 | 3;
}

function finitePositiveInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeVersion(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return /^v/i.test(normalized) ? normalized : `v${normalized}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstId(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function firstString(record: Record<string, unknown> | undefined, keys: readonly string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key] as string;
  }
  return undefined;
}

function firstBoolean(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key] as boolean;
  }
  return undefined;
}

function isSpreadsheetPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}
