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

export function DeliverableEditorPage({
  deliverableId,
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
  const [quoteRows, setQuoteRows] = useState<QuoteSheetRow[]>(() => cloneQuoteRows());
  const [saveState, setSaveState] = useState<SaveState>('ready');
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
    setQuoteRows(cloneQuoteRows());
    setSaveState('ready');
  }, [deliverableId, projectId, versionId]);

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
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const total = quoteTotal(quoteRows);

  return (
    <div className="office-mock-editor">
      <ProjectWorkbench
        enterpriseMaterials={enterpriseMaterials}
        footerHint="请输入您的问题，如“检查当前成果中仍需人工确认的内容”"
        materials={materials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
        rightRail={
          deliverableId === 'quote' ? (
            <QuoteOverview projectId={projectId} total={total} />
          ) : (
            <DocumentReviewOverview deliverableId={deliverableId} />
          )
        }
      >
        <section className="office-editor-panel" aria-labelledby="office-editor-title">
          <h1 className="bv-visually-hidden" id="office-editor-title">
            {project.title} · {definition.title} · {versionId}
          </h1>
          <nav className="office-deliverable-tabs" aria-label="成果文件">
            <AppLink to={`/projects/${encodeURIComponent(projectId)}/overview`}>
              招标文件成果
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
              downloadHref={definition.downloadHref}
              downloadLabel={definition.downloadLabel}
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
                  rows: quoteRows,
                  total,
                })
              }
            />
          ) : (
            <WordMockEditor
              key={`${deliverableId}:${versionId}`}
              deliverableId={deliverableId}
              downloadHref={definition.downloadHref}
              downloadLabel={definition.downloadLabel}
              onDirty={() => setSaveState('dirty')}
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

function saveStateLabel(state: SaveState) {
  const labels: Record<SaveState, string> = {
    ready: '演示模式：可在页面内修改，尚无未保存内容',
    dirty: '有未保存的演示修改',
    saving: '正在保存演示修改…',
    saved: '演示修改已保存到当前浏览器会话',
    error: '演示保存失败，请重试',
  };
  return labels[state];
}

function DocumentReviewOverview({
  deliverableId,
}: {
  deliverableId: Exclude<DeliverableRouteId, 'quote'>;
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
      <button disabled title="演示编辑器不会自动修改冻结成果" type="button">
        上传资料一键修改（演示）
      </button>
    </section>
  );
}

function QuoteOverview({ projectId, total }: { projectId: string; total: number }) {
  return (
    <section className="office-quote-rail" aria-label="报价概览">
      <header><h2>报价概览</h2><RefreshCw aria-hidden="true" size={17} /></header>
      <p className="office-review-rail__demo">随“用户报价”单元格实时重算</p>
      <dl>
        <div><dt>当前投标总价（元）</dt><dd>{currency.format(total)}</dd></div>
        <div><dt>招标限价（元）</dt><dd>428,000.00</dd></div>
        <div><dt>预计报价得分</dt><dd>82.5 <small>/ 100</small></dd></div>
        <div><dt>预计毛利率</dt><dd>12.36%</dd></div>
      </dl>
      <ul>
        <li><ShieldCheck aria-hidden="true" size={17} /><span>超限价风险</span><strong>低</strong></li>
        <li><AlertTriangle aria-hidden="true" size={17} /><span>异常价格数量</span><strong>2 项</strong></li>
        <li><TrendingUp aria-hidden="true" size={17} /><span>缺少报价依据数量</span><strong>3 项</strong></li>
      </ul>
      <AppLink to={`/projects/${encodeURIComponent(projectId)}/pricing`}>
        <CircleDollarSign aria-hidden="true" size={18} /> 查看报价策略
      </AppLink>
    </section>
  );
}
