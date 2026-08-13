import {
  AlertTriangle,
  CircleDollarSign,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  AppLink,
  deliverableEditorPath,
  type DeliverableRouteId,
} from '../../app/router';
import type { ProjectSummary } from '../projects/project-view-model';
import {
  ProjectWorkbench,
  type WorkspaceMaterial,
} from '../projects/ProjectWorkbench';
import { SpreadsheetEditor } from './SpreadsheetMockEditor';
import type { OfficeEditorSavePayload, QuoteSheetRow } from './types';
import { WordEditor } from './WordMockEditor';
import './office-mock-editor.css';

type DeliverableEditorPageProps = {
  deliverableId: DeliverableRouteId;
  draftScopeId: string;
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  onAssistantSend?: (value: string) => void;
  onSave?: (payload: OfficeEditorSavePayload) => Promise<void> | void;
  project?: ProjectSummary;
  projectId: string;
  versionId: string;
  versionIds?: Partial<Record<DeliverableRouteId, string>>;
  deliverableLabels?: Partial<Record<DeliverableRouteId, string>>;
  deliverableLabel?: string;
  deliverableTitle?: string;
  editorKind?: 'word' | 'spreadsheet';
  downloadHref?: string;
  downloadLabel?: string;
  onDownload?: () => Promise<void> | void;
  editorContent?: unknown;
  isBackendConnected?: boolean;
  initialQuoteRows?: QuoteSheetRow[];
  reviewOverview?: DeliverableReviewOverview;
};

export type DeliverableReviewOverview = {
  current?: number;
  lift?: number;
  predicted?: number;
  items: Array<{ label: string; allocation?: string; score?: string }>;
};

type SaveState = 'ready' | 'dirty' | 'saving' | 'saved' | 'error';

const currency = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const QUOTE_DRAFT_SCHEMA_VERSION = 1;
const MAX_QUOTE_DRAFT_ROWS = 500;
const MAX_QUOTE_TEXT_LENGTH = 500;

export function DeliverableEditorPage({
  deliverableId,
  draftScopeId,
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  onAssistantSend,
  onSave,
  project: projectOverride,
  projectId,
  versionId,
  versionIds,
  deliverableLabels,
  deliverableLabel,
  deliverableTitle,
  editorKind,
  downloadHref,
  downloadLabel,
  onDownload,
  editorContent,
  isBackendConnected = false,
  initialQuoteRows: initialBackendQuoteRows,
  reviewOverview,
}: DeliverableEditorPageProps) {
  const project = projectOverride;
  const expectedEditorKind = deliverableId === 'quote' ? 'spreadsheet' : 'word';
  const resolvedEditorKind = editorKind ?? expectedEditorKind;
  const definition = {
    label: deliverableLabel ?? deliverableLabels?.[deliverableId] ?? deliverableTypeLabel(deliverableId),
    title: deliverableTitle ?? `${deliverableTypeLabel(deliverableId)}文件`,
  };
  const quoteDraftKey = useMemo(
    () => officeDraftStorageKey(draftScopeId, deliverableId, versionId),
    [deliverableId, draftScopeId, versionId],
  );
  const [quoteRows, setQuoteRows] = useState<QuoteSheetRow[]>(() =>
    loadQuoteRows(quoteDraftKey, initialBackendQuoteRows),
  );
  const [saveState, setSaveState] = useState<SaveState>('ready');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [assistantFocusRequest, setAssistantFocusRequest] = useState(0);
  const resolvedVersions = useMemo(
    () => ({ ...versionIds, [deliverableId]: versionId }),
    [deliverableId, versionId, versionIds],
  );

  useEffect(() => {
    setQuoteRows(loadQuoteRows(quoteDraftKey, initialBackendQuoteRows));
    setSaveState('ready');
    setAssistantDraft('');
    setAssistantFocusRequest(0);
  }, [initialBackendQuoteRows, quoteDraftKey]);

  if (!project) {
    return (
      <section className="office-editor-missing" aria-labelledby="editor-project-missing">
        <h1 id="editor-project-missing">无法打开这个项目成果</h1>
        <p>项目不存在或不属于当前企业，未加载任何其他项目的内容。</p>
        <AppLink to="/projects">返回投标工作台</AppLink>
      </section>
    );
  }

  const persist = async (payload: OfficeEditorSavePayload) => {
    setSaveState('saving');
    try {
      await onSave?.(payload);
      if (payload.kind === 'spreadsheet') {
        saveQuoteRows(quoteDraftKey, quoteRows);
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const total = quoteRows.reduce(
    (sum, row) => sum + row.quantity * row.userPrice,
    0,
  );
  const sendSelectionToAssistant = (selection: string) => {
    const selectedText = selection
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!selectedText) return;
    setAssistantDraft(
      `请针对以下选中内容进行修改：\n${selectedText}\n\n修改要求：`,
    );
    setAssistantFocusRequest((request) => request + 1);
  };

  return (
    <div className="office-mock-editor">
      <ProjectWorkbench
        assistantDraft={assistantDraft}
        assistantFocusRequest={assistantFocusRequest}
        enterpriseMaterials={enterpriseMaterials}
        footerHint="请输入您的问题，如“检查当前成果中仍需人工确认的内容”"
        materials={materials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
        onAssistantDraftChange={setAssistantDraft}
        onAssistantSend={onAssistantSend}
        rightRail={
          deliverableId === 'quote' ? (
            <QuoteOverview projectId={projectId} rows={quoteRows} total={total} />
          ) : (
            <DocumentReviewOverview
              deliverableId={deliverableId}
              projectId={projectId}
              overview={reviewOverview}
            />
          )
        }
      >
        <section className="office-editor-panel" aria-labelledby="office-editor-title">
          <h1 className="bv-visually-hidden" id="office-editor-title">
            {project.title} · {definition.title} · {versionId}
          </h1>
          <nav className="office-deliverable-tabs" aria-label="成果文件">
            <AppLink to={`/projects/${encodeURIComponent(projectId)}/overview`}>
              标书成果总览
            </AppLink>
            {(['technical', 'business', 'quote'] as DeliverableRouteId[]).map((id) => {
              const targetVersion = resolvedVersions[id];
              const label = deliverableLabels?.[id] ?? deliverableTypeLabel(id);
              return targetVersion ? (
                <AppLink
                  aria-current={id === deliverableId ? 'page' : undefined}
                  key={id}
                  to={deliverableEditorPath(projectId, id, targetVersion)}
                >
                  {label}
                </AppLink>
              ) : (
                <span aria-disabled="true" key={id} title="尚未加载该成果的版本">
                  {label}
                </span>
              );
            })}
          </nav>

          <div className="office-editor-meta">
            <span><strong>{definition.title}</strong> · {versionId}</span>
            <span className="office-editor-demo-badge">
              {isBackendConnected ? '后端编辑会话 · 保存将创建受控成果版本' : '在线编辑器 · 保存到当前成果版本'}
            </span>
          </div>

          <div className={`office-editor-save-state office-editor-save-state--${saveState}`} role="status">
            {saveStateLabel(saveState)}
          </div>

          {resolvedEditorKind !== expectedEditorKind ? (
            <div className="office-sheet-empty" role="alert">
              成果类型与编辑器类型不匹配，请刷新成果版本信息。
            </div>
          ) : deliverableId === 'quote' ? (
            <SpreadsheetEditor
              key={`spreadsheet:${draftScopeId}:${deliverableId}:${versionId}`}
              downloadHref={downloadHref}
              downloadLabel={downloadLabel ?? `下载${definition.title}`}
              onDownload={onDownload}
              onSendSelectionToAssistant={sendSelectionToAssistant}
              rows={quoteRows}
              onRowsChange={(rows) => {
                setQuoteRows(rows);
                setSaveState('dirty');
              }}
              onSave={() =>
                void persist({
                  kind: 'spreadsheet',
                  projectId,
                  deliverableId,
                  versionId,
                  rows: quoteRows.map(toWritableQuoteRow),
                  total,
                })
              }
            />
          ) : (
            <WordEditor
              key={`word:${draftScopeId}:${deliverableId}:${versionId}`}
              deliverableId={deliverableId}
              downloadHref={downloadHref}
              downloadLabel={downloadLabel ?? `下载${definition.title}`}
              onDownload={onDownload}
              storageKey={officeDraftStorageKey(draftScopeId, deliverableId, versionId)}
              initialHtml={extractWordHtml(editorContent)}
              onDirty={() => setSaveState('dirty')}
              onSendSelectionToAssistant={sendSelectionToAssistant}
              onSave={(content) =>
                void persist({
                  kind: 'word',
                  projectId,
                  deliverableId,
                  versionId,
                  content,
                })
              }
            />
          )}
        </section>
      </ProjectWorkbench>
    </div>
  );
}

function extractWordHtml(content: unknown) {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const model = content as Record<string, unknown>;
  for (const key of ['html', 'content', 'body']) {
    if (typeof model[key] === 'string') return model[key];
  }
  if (Array.isArray(model.nodes)) {
    return model.nodes
      .flatMap((node) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
        const item = node as Record<string, unknown>;
        if (typeof item.text !== 'string') return [];
        const safeText = item.text
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
        const tag = item.type === 'heading' ? 'h2' : 'p';
        return [`<${tag}>${safeText}</${tag}>`];
      })
      .join('');
  }
  return undefined;
}

function wordHtmlToBackendContent(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks = Array.from(template.content.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li'));
  const textBlocks = blocks.length > 0 ? blocks : [template.content];
  return {
    html,
    nodes: textBlocks.flatMap((block, index) => {
      const text = block.textContent?.trim();
      if (!text) return [];
      return [{
        id: `web-node-${index + 1}`,
        type: block instanceof HTMLHeadingElement ? 'heading' : 'paragraph',
        text,
      }];
    }),
  };
}

export function toBackendEditorContent(payload: OfficeEditorSavePayload) {
  if (payload.kind === 'word') return wordHtmlToBackendContent(payload.content);
  return {
    rows: payload.rows,
    total: payload.total,
  };
}

export function backendQuoteRows(content: unknown): QuoteSheetRow[] | undefined {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const model = content as Record<string, unknown>;
  const sheet = Array.isArray(model.sheets) && model.sheets[0] && typeof model.sheets[0] === 'object'
    ? (model.sheets[0] as Record<string, unknown>)
    : undefined;
  if (!sheet || !Array.isArray(sheet.rows)) return undefined;
  const dataRows = sheet.rows.slice(1).filter((row) => Array.isArray(row));
  const rows = dataRows.flatMap((rawRow, index) => {
    const values = rawRow as unknown[];
    const name = typeof values[0] === 'string' ? values[0] : '';
    const quantity = Number(values[1]);
    const price = Number(values[2]);
    if (!name || !Number.isFinite(quantity)) return [];
    const validPrice = Number.isFinite(price) ? price : 0;
    return [{
      id: `backend-row-${index + 1}`,
      code: name,
      name,
      specification: '后端成果未提供规格',
      quantity,
      unit: '项',
      tenderPrice: validPrice,
      historyPrice: 0,
      suggestedPrice: validPrice,
      userPrice: validPrice,
    }];
  });
  return rows.length > 0 ? rows : undefined;
}

function cloneQuoteRows(rows: readonly QuoteSheetRow[] = []) {
  return rows.map((row) => ({ ...row }));
}

function toWritableQuoteRow(row: QuoteSheetRow) {
  const {
    id,
    code,
    name,
    specification,
    quantity,
    unit,
    tenderPrice,
    userPrice,
  } = row;
  return { id, code, name, specification, quantity, unit, tenderPrice, userPrice };
}

function officeDraftStorageKey(
  draftScopeId: string,
  deliverableId: DeliverableRouteId,
  versionId: string,
) {
  return [
    'bidvolt:office-draft:v1',
    encodeURIComponent(draftScopeId),
    encodeURIComponent(deliverableId),
    encodeURIComponent(versionId),
  ].join(':');
}

function loadQuoteRows(storageKey: string, fallbackRows?: readonly QuoteSheetRow[]) {
  if (typeof window === 'undefined') return cloneQuoteRows(fallbackRows);

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return cloneQuoteRows(fallbackRows);
    const parsed = JSON.parse(stored) as { rows?: unknown; schemaVersion?: unknown };
    if (
      parsed.schemaVersion !== QUOTE_DRAFT_SCHEMA_VERSION
      || !Array.isArray(parsed.rows)
      || parsed.rows.length > MAX_QUOTE_DRAFT_ROWS
      || !parsed.rows.every(isQuoteSheetWritableRow)
      || new Set(parsed.rows.map((row) => row.id)).size !== parsed.rows.length
    ) {
      return cloneQuoteRows(fallbackRows);
    }
    const readonlyValues = new Map(
      (fallbackRows ?? []).map((row) => [
        row.id,
        { historyPrice: row.historyPrice, suggestedPrice: row.suggestedPrice },
      ]),
    );
    return parsed.rows.map((row) => ({
      ...row,
      historyPrice: readonlyValues.get(row.id)?.historyPrice ?? 0,
      suggestedPrice: readonlyValues.get(row.id)?.suggestedPrice ?? 0,
    }));
  } catch {
    return cloneQuoteRows(fallbackRows);
  }
}

function saveQuoteRows(storageKey: string, rows: QuoteSheetRow[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      schemaVersion: QUOTE_DRAFT_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      rows: rows.map(toWritableQuoteRow),
    }),
  );
}

function isQuoteSheetWritableRow(
  value: unknown,
): value is ReturnType<typeof toWritableQuoteRow> {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Record<keyof QuoteSheetRow, unknown>>;
  return (
    isBoundedText(row.id, 160) &&
    isBoundedText(row.code, MAX_QUOTE_TEXT_LENGTH) &&
    isBoundedText(row.name, MAX_QUOTE_TEXT_LENGTH) &&
    isBoundedText(row.specification, MAX_QUOTE_TEXT_LENGTH) &&
    isBoundedText(row.unit, 80) &&
    isFiniteNumberInRange(row.quantity, Number.EPSILON, 1_000_000_000) &&
    isFiniteNumberInRange(row.tenderPrice, 0, 1_000_000_000_000) &&
    isFiniteNumberInRange(row.userPrice, 0, 1_000_000_000_000)
  );
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function saveStateLabel(state: SaveState) {
  const labels: Record<SaveState, string> = {
    ready: '可在页面内修改，尚无未保存内容',
    dirty: '有未保存的修改',
    saving: '正在保存修改…',
    saved: '修改已保存到当前成果版本',
    error: '保存失败，请重试',
  };
  return labels[state];
}

function deliverableTypeLabel(id: DeliverableRouteId) {
  const labels: Record<DeliverableRouteId, string> = {
    technical: '技术标',
    business: '商务标',
    quote: '报价单',
  };
  return labels[id];
}

function DocumentReviewOverview({
  deliverableId,
  projectId,
  overview,
}: {
  deliverableId: Exclude<DeliverableRouteId, 'quote'>;
  projectId: string;
  overview?: DeliverableReviewOverview;
}) {
  const isTechnical = deliverableId === 'technical';

  return (
    <section className="office-review-rail" aria-label={`${isTechnical ? '技术' : '商务'}评分项`}>
      <header><h2>{isTechnical ? '技术' : '商务'}评分项</h2><RefreshCw aria-hidden="true" size={17} /></header>
      {overview ? (
        <>
          <div className="office-review-metrics">
            <div><span>当前得分</span><strong>{overview.current ?? '--'}</strong><small>分</small></div>
            <div><span>可提升</span><strong>{overview.lift == null ? '--' : `+${overview.lift}`}</strong><small>分</small></div>
            <div><span>提升后</span><strong>{overview.predicted ?? '--'}</strong><small>分</small></div>
          </div>
          <div className="office-review-items">
            {overview.items.map(({ label, allocation, score }) => (
              <article key={label}>
                <ShieldCheck aria-hidden="true" size={17} />
                <span><strong>{label}</strong><small>{allocation ?? '待评审'}</small></span>
                <b>{score ?? '--'}</b>
              </article>
            ))}
          </div>
        </>
      ) : <p className="office-review-rail__demo">暂无评审结果</p>}
      <AppLink to={`/projects/${encodeURIComponent(projectId)}/review`}>
        前往评审中心确认建议
      </AppLink>
    </section>
  );
}

function QuoteOverview({
  projectId,
  rows,
  total,
}: {
  projectId: string;
  rows: QuoteSheetRow[];
  total: number;
}) {
  const tenderLimit = rows.reduce(
    (sum, row) => sum + row.quantity * row.tenderPrice,
    0,
  );
  const abnormalCount = rows.filter(
    (row) => row.userPrice <= 0 || row.userPrice > row.tenderPrice,
  ).length;
  const missingEvidenceCount = rows.filter((row) => row.historyPrice <= 0).length;

  return (
    <section className="office-quote-rail" aria-label="报价概览">
      <header><h2>报价概览</h2><RefreshCw aria-hidden="true" size={17} /></header>
      <p className="office-review-rail__demo">随当前表格重算；得分与毛利以服务端测算为准</p>
      <dl>
        <div><dt>当前投标总价（元）</dt><dd>{currency.format(total)}</dd></div>
        <div><dt>当前明细限价（元）</dt><dd>{currency.format(tenderLimit)}</dd></div>
        <div><dt>预计报价得分</dt><dd><small>待服务端测算</small></dd></div>
        <div><dt>预计毛利率</dt><dd><small>待服务端测算</small></dd></div>
      </dl>
      <ul>
        <li><ShieldCheck aria-hidden="true" size={17} /><span>超限价风险</span><strong>{total > tenderLimit ? '高' : '低'}</strong></li>
        <li><AlertTriangle aria-hidden="true" size={17} /><span>异常价格数量</span><strong>{abnormalCount} 项</strong></li>
        <li><TrendingUp aria-hidden="true" size={17} /><span>缺少报价依据数量</span><strong>{missingEvidenceCount} 项</strong></li>
      </ul>
      <AppLink to={`/projects/${encodeURIComponent(projectId)}/pricing`}>
        <CircleDollarSign aria-hidden="true" size={18} /> 查看报价策略
      </AppLink>
    </section>
  );
}
