import {
  AlertTriangle,
  BadgeCheck,
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
import { initialQuoteRows, mockDeliverables, quoteTotal } from './mock-data';
import { SpreadsheetMockEditor } from './SpreadsheetMockEditor';
import type { OfficeMockSavePayload, QuoteSheetRow } from './types';
import { WordMockEditor } from './WordMockEditor';
import './office-mock-editor.css';

type DeliverableEditorPageProps = {
  deliverableId: DeliverableRouteId;
  draftScopeId: string;
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  onSave?: (payload: OfficeMockSavePayload) => Promise<void> | void;
  project?: ProjectSummary;
  projectId: string;
  versionId: string;
  versionIds?: Partial<Record<DeliverableRouteId, string>>;
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
  onSave,
  project: projectOverride,
  projectId,
  versionId,
  versionIds,
}: DeliverableEditorPageProps) {
  const project = projectOverride;
  const definition = mockDeliverables[deliverableId];
  const quoteDraftKey = useMemo(
    () => officeDraftStorageKey(draftScopeId, deliverableId, versionId),
    [deliverableId, draftScopeId, versionId],
  );
  const [quoteRows, setQuoteRows] = useState<QuoteSheetRow[]>(() =>
    loadQuoteRows(quoteDraftKey),
  );
  const [saveState, setSaveState] = useState<SaveState>('ready');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [assistantFocusRequest, setAssistantFocusRequest] = useState(0);
  const resolvedVersions = useMemo(
    () => ({
      business: versionIds?.business ?? mockDeliverables.business.versionId,
      technical: versionIds?.technical ?? mockDeliverables.technical.versionId,
      quote: versionIds?.quote ?? mockDeliverables.quote.versionId,
      [deliverableId]: versionId,
    }),
    [deliverableId, versionId, versionIds],
  );

  useEffect(() => {
    setQuoteRows(loadQuoteRows(quoteDraftKey));
    setSaveState('ready');
    setAssistantDraft('');
    setAssistantFocusRequest(0);
  }, [quoteDraftKey]);

  if (!project) {
    return (
      <section className="office-editor-missing" aria-labelledby="editor-project-missing">
        <h1 id="editor-project-missing">无法打开这个项目成果</h1>
        <p>项目不存在或不属于当前企业，未加载任何其他项目的演示内容。</p>
        <AppLink to="/projects">返回投标工作台</AppLink>
      </section>
    );
  }

  const persist = async (payload: OfficeMockSavePayload) => {
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

  const total = quoteTotal(quoteRows);
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
        rightRail={
          deliverableId === 'quote' ? (
            <QuoteOverview projectId={projectId} rows={quoteRows} total={total} />
          ) : (
            <DocumentReviewOverview deliverableId={deliverableId} projectId={projectId} />
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
            {(Object.keys(mockDeliverables) as DeliverableRouteId[]).map((id) => (
              <AppLink
                aria-current={id === deliverableId ? 'page' : undefined}
                key={id}
                to={deliverableEditorPath(projectId, id, resolvedVersions[id])}
              >
                {mockDeliverables[id].label}
              </AppLink>
            ))}
          </nav>

          <div className="office-editor-meta">
            <span><strong>{definition.title}</strong> · {versionId}</span>
            <span className="office-editor-demo-badge">演示编辑器 · 不会回写真实 Office 文件</span>
          </div>

          <div className={`office-editor-save-state office-editor-save-state--${saveState}`} role="status">
            {saveStateLabel(saveState)}
          </div>

          {deliverableId === 'quote' ? (
            <SpreadsheetMockEditor
              key={`spreadsheet:${draftScopeId}:${deliverableId}:${versionId}`}
              downloadHref={definition.downloadHref}
              downloadLabel={definition.downloadLabel}
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
            <WordMockEditor
              key={`word:${draftScopeId}:${deliverableId}:${versionId}`}
              deliverableId={deliverableId}
              downloadHref={definition.downloadHref}
              downloadLabel={definition.downloadLabel}
              storageKey={officeDraftStorageKey(draftScopeId, deliverableId, versionId)}
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

function cloneQuoteRows() {
  return initialQuoteRows.map((row) => ({ ...row }));
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

function loadQuoteRows(storageKey: string) {
  if (typeof window === 'undefined') return cloneQuoteRows();

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return cloneQuoteRows();
    const parsed = JSON.parse(stored) as { rows?: unknown; schemaVersion?: unknown };
    if (
      parsed.schemaVersion !== QUOTE_DRAFT_SCHEMA_VERSION
      || !Array.isArray(parsed.rows)
      || parsed.rows.length > MAX_QUOTE_DRAFT_ROWS
      || !parsed.rows.every(isQuoteSheetWritableRow)
      || new Set(parsed.rows.map((row) => row.id)).size !== parsed.rows.length
    ) {
      return cloneQuoteRows();
    }
    const readonlyValues = new Map(
      initialQuoteRows.map((row) => [
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
    return cloneQuoteRows();
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
    ready: '演示模式：可在页面内修改，尚无未保存内容',
    dirty: '有未保存的演示修改',
    saving: '正在保存演示修改…',
    saved: '演示修改已保存到当前浏览器，可在刷新后恢复',
    error: '演示保存失败，请重试',
  };
  return labels[state];
}

function DocumentReviewOverview({
  deliverableId,
  projectId,
}: {
  deliverableId: Exclude<DeliverableRouteId, 'quote'>;
  projectId: string;
}) {
  const isTechnical = deliverableId === 'technical';
  const metrics = isTechnical
    ? { current: 86.8, lift: 4.6, predicted: 91.4 }
    : { current: 26.8, lift: 1.8, predicted: 28.6 };
  const items = isTechnical
    ? [
        ['技术参数响应', '20 分', '18.5 分'],
        ['方案完整性', '15 分', '12.0 分'],
        ['项目针对性', '15 分', '13.2 分'],
        ['供货方案', '10 分', '8.6 分'],
        ['质量保障', '10 分', '8.8 分'],
        ['售后方案', '10 分', '8.9 分'],
      ]
    : [
        ['投标函完整性', '8 分', '7.6 分'],
        ['资质响应', '8 分', '7.2 分'],
        ['商务偏离', '7 分', '6.4 分'],
        ['交付承诺', '7 分', '5.6 分'],
      ];

  return (
    <section className="office-review-rail" aria-label={`${isTechnical ? '技术' : '商务'}评分项`}>
      <header><h2>{isTechnical ? '技术' : '商务'}评分项</h2><RefreshCw aria-hidden="true" size={17} /></header>
      <p className="office-review-rail__demo">演示评分，仅用于还原 P08 交互布局</p>
      <div className="office-review-metrics">
        <div><span>当前得分</span><strong>{metrics.current}</strong><small>分</small></div>
        <div><span>可提升</span><strong>+{metrics.lift}</strong><small>分</small></div>
        <div><span>提升后</span><strong>{metrics.predicted}</strong><small>分</small></div>
      </div>
      <div className="office-review-items">
        {items.map(([label, allocation, score]) => (
          <article key={label}>
            <BadgeCheck aria-hidden="true" size={17} />
            <span><strong>{label}</strong><small>{allocation}</small></span>
            <b>{score}</b>
          </article>
        ))}
      </div>
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
