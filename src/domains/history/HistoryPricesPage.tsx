import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type {
  HistoricalQuoteRecord,
  HistoryMaterialDetail,
  HistoryPricesPageProps,
  HistoryPriceSource,
} from './types';
import './history-prices.css';

type Filters = {
  materialName: string;
  materialCode: string;
  specification: string;
  tenderer: string;
  region: string;
  years: string;
};

const initialFilters: Filters = {
  materialName: '',
  materialCode: '',
  specification: '',
  tenderer: '',
  region: '',
  years: '',
};

const HISTORY_PAGE_SIZE = 5;
const EMPTY_HISTORY_RECORDS: HistoricalQuoteRecord[] = [];

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function price(value: number) {
  return currencyFormatter.format(value);
}

function optionalPrice(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : price(value);
}

function optionalRatio(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(2)}%`;
}

function safeEvidenceUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function matchesText(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function matchesYear(year: number, query: string) {
  const normalizedQuery = query.trim().replace(/[—–]/g, '-');
  if (!normalizedQuery) return true;

  const range = normalizedQuery.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const firstYear = Number(range[1]);
    const lastYear = Number(range[2]);
    return year >= Math.min(firstYear, lastYear) && year <= Math.max(firstYear, lastYear);
  }

  const requestedYears = normalizedQuery
    .split(/[,，、\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  return requestedYears.length > 0
    ? requestedYears.includes(year)
    : String(year).includes(normalizedQuery);
}

function calculateStats(records: HistoricalQuoteRecord[]) {
  const values = records
    .map((record) => record.unitPrice)
    .filter((value): value is number => value !== undefined && Number.isFinite(value))
    .sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const middleIndex = Math.floor(values.length / 2);
  const median = values.length
    ? values.length % 2
      ? values[middleIndex]
      : (values[middleIndex - 1] + values[middleIndex]) / 2
    : 0;
  const latest = [...records].sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))[0];

  return {
    min: values[0] ?? null,
    max: values.at(-1) ?? null,
    median: values.length ? median : null,
    average: values.length ? total / values.length : null,
    latest: latest?.unitPrice ?? null,
  };
}

function calculatePriceChange(records: HistoricalQuoteRecord[]) {
  const ordered = [...records]
    .filter((record): record is HistoricalQuoteRecord & { unitPrice: number } =>
      record.unitPrice !== undefined && Number.isFinite(record.unitPrice) && record.unitPrice > 0)
    .sort((a, b) => a.awardedAt.localeCompare(b.awardedAt));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last || first.id === last.id) return null;
  return ((last.unitPrice - first.unitPrice) / first.unitPrice) * 100;
}

export function HistoryPricesPage({
  records,
  totalCount,
  onLoadSources,
  onOpenMaterial,
  onImportHistory,
  onOpenSampleDetail,
}: HistoryPricesPageProps) {
  const resolvedRecords = records ?? EMPTY_HISTORY_RECORDS;
  const resolvedTotalCount = totalCount ?? resolvedRecords.length;
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [detailMaterial, setDetailMaterial] = useState<HistoricalQuoteRecord | null>(null);
  const [materialDetail, setMaterialDetail] = useState<HistoryMaterialDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [sources, setSources] = useState<HistoryPriceSource[]>([]);
  const [sourcesError, setSourcesError] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTarget, setImportTarget] = useState<'public' | 'private'>('private');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!onLoadSources) return undefined;
    let active = true;
    setSourcesError('');
    void onLoadSources().then((value) => {
      if (active) setSources(value);
    }).catch((error: unknown) => {
      if (active) setSourcesError(error instanceof Error ? error.message : '行情来源加载失败');
    });
    return () => { active = false; };
  }, [onLoadSources]);

  const visibleRecords = useMemo(
    () =>
      resolvedRecords.filter((record) => {
        const materialQuery = filters.materialName.trim();
        return (
          (!materialQuery || matchesText(
            `${record.materialName} ${record.category ?? ''} ${record.packageName}`,
            materialQuery,
          )) &&
          (!filters.materialCode || matchesText(
            `${record.materialCode} ${record.noticeId ?? ''}`,
            filters.materialCode,
          )) &&
          (!filters.specification || matchesText(
            `${record.specification} ${record.priceMode ?? ''}`,
            filters.specification,
          )) &&
          (!filters.tenderer || matchesText(record.tenderer, filters.tenderer)) &&
          (!filters.region || matchesText(record.region, filters.region)) &&
          matchesYear(record.year, filters.years)
        );
      }),
    [filters, resolvedRecords],
  );
  const pageCount = Math.max(1, Math.ceil(visibleRecords.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRecords = visibleRecords.slice(
    (currentPage - 1) * HISTORY_PAGE_SIZE,
    currentPage * HISTORY_PAGE_SIZE,
  );

  if (detailMaterial) {
    return (
      <HistoryPriceDetail
        focus={detailMaterial}
        records={materialDetail?.records ?? []}
        trend={materialDetail?.trend}
        loading={detailLoading}
        error={detailError}
        onOpenSampleDetail={onOpenSampleDetail}
        onBack={() => {
          setDetailMaterial(null);
          setMaterialDetail(null);
          setDetailError('');
        }}
      />
    );
  }

  const openMaterial = async (record: HistoricalQuoteRecord) => {
    const materialRef = record.materialRef?.trim();
    if (!onOpenMaterial) {
      const fallbackRecords = resolvedRecords.filter((candidate) => candidate.materialCode === record.materialCode);
      const fallbackStats = calculateStats(fallbackRecords);
      setMaterialDetail({
        records: fallbackRecords,
        trend: {
          materialRef: materialRef ?? record.materialCode,
          sampleCount: fallbackRecords.length,
          minimum: fallbackStats.min,
          maximum: fallbackStats.max,
          average: fallbackStats.average,
          median: fallbackStats.median,
          latest: fallbackStats.latest,
          latestAt: '',
          readonly: true,
        },
      });
      setDetailMaterial(record);
      return;
    }
    if (!materialRef) {
      setDetailError('当前行情记录没有后端可查询的物料标识，无法读取样本与趋势。');
      setDetailMaterial(record);
      return;
    }
    setDetailMaterial(record);
    setMaterialDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      setMaterialDetail(await onOpenMaterial(materialRef));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '物料样本与趋势加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const stats = calculateStats(visibleRecords);
  const priceChange = calculatePriceChange(visibleRecords);
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters(draftFilters);
    setPage(1);
  };
  const resetSearch = () => {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
  };

  const submitImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onImportHistory || !importFile || importing) return;
    setImporting(true);
    setImportMessage('');
    setImportError('');
    try {
      const result = await onImportHistory(importFile, importTarget);
      setImportMessage(
        `已导入 ${result.imported} 条，跳过 ${result.skipped} 条重复记录、${result.skippedRows} 条无效行。`,
      );
      setImportFile(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '历史报价导入失败。');
    } finally {
      setImporting(false);
    }
  };

  const filterFields: Array<{
    key: keyof Filters;
    label: string;
    placeholder: string;
  }> = [
    { key: 'materialName', label: '品类 / 标包', placeholder: '输入品类或标包名称' },
    { key: 'materialCode', label: '公告编号', placeholder: '输入公告编号' },
    { key: 'specification', label: '报价方式', placeholder: '输入报价方式' },
    { key: 'tenderer', label: '招标人', placeholder: '全部招标人' },
    { key: 'region', label: '地区', placeholder: '全部地区' },
    { key: 'years', label: '年份', placeholder: '例如 2021—2024' },
  ];

  return (
    <section className="history-page">
      <div className="history-breadcrumbs" aria-label="面包屑">
        <span>历史报价</span>
        <span>/</span>
        <strong>数据查询总览</strong>
      </div>
      <header className="history-heading">
        <h2>历史报价｜数据查询总览</h2>
        <p>检索电网行业历史中标价格，为当前报价提供可解释的数据依据</p>
      </header>

      {onLoadSources ? (
        <section className="history-sources" aria-label="历史报价数据来源">
          <strong>真实行情来源</strong>
          {sources.map((source) => (
            <span key={source.id} title={`${source.coverage}；${source.updatePolicy}`}>
              {source.name}
              <small>{source.readonlyVerified ? '只读已验证' : '只读状态未验证'} · {source.coverage}</small>
            </span>
          ))}
          {sources.length === 0 && !sourcesError ? <em>正在读取来源元数据…</em> : null}
          {sourcesError ? <em role="alert">来源元数据加载失败：{sourcesError}</em> : null}
        </section>
      ) : null}

      {onImportHistory ? (
        <form className="history-import" aria-label="导入历史报价样本" onSubmit={(event) => void submitImport(event)}>
          <span><strong>导入真实行情样本</strong><small>仅支持后端约定的 .xlsx 文件</small></span>
          <label>
            <span className="bv-visually-hidden">导入范围</span>
            <select value={importTarget} onChange={(event) => setImportTarget(event.currentTarget.value as 'public' | 'private')}>
              <option value="private">本企业私有库</option>
              <option value="public">平台公共库</option>
            </select>
          </label>
          <label className="history-import__file">
            <span>{importFile?.name ?? '选择 XLSX 文件'}</span>
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              type="file"
              onChange={(event) => setImportFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button disabled={!importFile || importing} type="submit">{importing ? '正在导入…' : '导入行情'}</button>
          {importMessage ? <p role="status">{importMessage}</p> : null}
          {importError ? <p className="history-import__error" role="alert">{importError}</p> : null}
        </form>
      ) : null}

      <form className="history-filter" aria-label="历史报价查询条件" onSubmit={submitSearch}>
        {filterFields.map((field) => (
          <label key={field.key}>
            <span>{field.label}</span>
            <input
              value={draftFilters[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraftFilters((current) => ({
                  ...current,
                  [field.key]: value,
                }));
              }}
            />
          </label>
        ))}
        <div className="history-filter__actions">
          <button className="history-button history-button--secondary" type="button" onClick={resetSearch}>
            <RotateCcw aria-hidden="true" size={14} />
            重置
          </button>
          <button className="history-button history-button--primary" type="submit">
            <Search aria-hidden="true" size={14} />
            查询
          </button>
        </div>
      </form>

      <section className="history-results" aria-label="历史报价查询结果">
        <div className="history-stats" aria-label="历史报价统计">
          <Stat label="历史样本数量" value={visibleRecords.length.toLocaleString('zh-CN')} />
          <Stat accent label="最低中标价" value={optionalPrice(stats.min)} />
          <Stat accent label="最高中标价" value={optionalPrice(stats.max)} />
          <Stat label="中位数" value={optionalPrice(stats.median)} />
          <Stat label="平均价" value={optionalPrice(stats.average)} />
          <Stat label="最近一次中标价" value={optionalPrice(stats.latest)} />
          <Stat
            accent
            label="样本区间价格变化"
            value={priceChange === null ? '—' : `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`}
          />
        </div>

        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>标包 / 项目</th>
                <th>发布单位</th>
                <th>品类</th>
                <th>公告编号</th>
                <th>报价方式</th>
                <th>最高限价</th>
                <th>中标价</th>
                <th>中标 / 限价</th>
                <th>发布日期</th>
                <th>数据来源</th>
                <th>价格证据</th>
              </tr>
            </thead>
            <tbody>
              {pageRecords.map((record) => (
                <tr key={record.id}>
                  <td>
                    <button type="button" onClick={() => void openMaterial(record)}>
                      {record.projectName}
                    </button>
                  </td>
                  <td>{record.tenderer}</td>
                  <td>{record.category ?? record.materialName}</td>
                  <td>{record.noticeId ?? record.materialCode}</td>
                  <td>{record.priceMode ?? record.specification}</td>
                  <td className="history-price-cell">{optionalPrice(record.limitPrice)}</td>
                  <td className="history-price-cell">{optionalPrice(record.unitPrice)}</td>
                  <td>{optionalRatio(record.winRatio)}</td>
                  <td>{record.awardedAt}</td>
                  <td>{record.source}</td>
                  <td><HistoryEvidence record={record} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRecords.length === 0 ? (
            <div className="history-empty">没有匹配的只读历史报价记录。</div>
          ) : null}
        </div>

        <footer className="history-pagination">
          <span>
            当前匹配 {visibleRecords.length} 条 · 外部总计 {resolvedTotalCount.toLocaleString('zh-CN')} 条
          </span>
          <div aria-label="历史报价分页">
            <button
              type="button"
              aria-label="上一页"
              disabled={currentPage === 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              <ChevronLeft aria-hidden="true" size={14} />
            </button>
            <span className="history-page-status" aria-current="page">
              第 {currentPage} / {pageCount} 页
            </span>
            <button
              type="button"
              aria-label="下一页"
              disabled={currentPage === pageCount}
              onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
            >
              <ChevronRight aria-hidden="true" size={14} />
            </button>
          </div>
          <span>{HISTORY_PAGE_SIZE} 条 / 页</span>
        </footer>
      </section>
    </section>
  );
}

function HistoryEvidence({ record }: { record: HistoricalQuoteRecord }) {
  const limitUrl = safeEvidenceUrl(record.limitEvidenceUrl);
  const winUrl = safeEvidenceUrl(record.winEvidenceUrl);
  const entries = [
    { key: 'limit', label: '限价证据', text: record.limitEvidence, url: limitUrl },
    { key: 'win', label: '中标证据', text: record.winEvidence, url: winUrl },
  ].filter((entry) => entry.text || entry.url);
  if (entries.length === 0) return <span>—</span>;
  return (
    <span className="history-evidence-links">
      {entries.map((entry) => entry.url ? (
        <a
          key={entry.key}
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          title={entry.text || entry.label}
        >
          {entry.label}
        </a>
      ) : (
        <span key={entry.key} title={entry.text}>{entry.label}原文</span>
      ))}
    </span>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <article className="history-stat">
      <span>{label}</span>
      <strong className={accent ? 'history-stat__accent' : undefined}>{value}</strong>
    </article>
  );
}

function HistoryPriceDetail({
  focus,
  records,
  trend,
  loading,
  error,
  onOpenSampleDetail,
  onBack,
}: {
  focus: HistoricalQuoteRecord;
  records: HistoricalQuoteRecord[];
  trend?: HistoryMaterialDetail['trend'];
  loading: boolean;
  error: string;
  onOpenSampleDetail?: (sampleId: string) => Promise<HistoricalQuoteRecord>;
  onBack: () => void;
}) {
  const [sampleDetail, setSampleDetail] = useState<HistoricalQuoteRecord | null>(null);
  const [sampleLoadingId, setSampleLoadingId] = useState('');
  const [sampleError, setSampleError] = useState('');
  const localStats = calculateStats(records);
  const stats = trend ? {
    average: trend.average,
    latest: trend.latest,
    max: trend.maximum,
    median: trend.median,
    min: trend.minimum,
  } : localStats;
  const orderedRecords = [...records].sort((a, b) => a.awardedAt.localeCompare(b.awardedAt));
  const firstRecord = orderedRecords[0];
  const lastRecord = orderedRecords.at(-1);
  const highSimilarityCount = records.filter((record) => record.similarity === 'high').length;
  const regions = [...new Set(records.map((record) => record.region).filter(Boolean))];
  const sources = [...new Set(records.map((record) => record.source).filter(Boolean))];
  const openSample = async (record: HistoricalQuoteRecord) => {
    if (!onOpenSampleDetail || !record.sampleId || sampleLoadingId) return;
    setSampleLoadingId(record.sampleId);
    setSampleError('');
    try {
      setSampleDetail(await onOpenSampleDetail(record.sampleId));
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : '样本详情加载失败。');
    } finally {
      setSampleLoadingId('');
    }
  };
  return (
    <section className="history-page history-detail-page">
      <button className="history-detail-back" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={15} />
        返回数据查询总览
      </button>
      <div className="history-breadcrumbs" aria-label="面包屑">
        <span>历史报价</span><span>/</span><strong>物料价格详情</strong>
      </div>
      <header className="history-heading">
        <h2>历史报价｜物料价格详情</h2>
        <p>查看单一物料的价格趋势、历史成交明细与样本相似度</p>
      </header>

      <div className="history-detail-layout">
        <aside className="history-material-card">
          <h3>{focus.materialName}</h3>
          <dl>
            <div><dt>物料编码</dt><dd>{focus.materialCode}</dd></div>
            <div><dt>规格型号</dt><dd>{focus.specification}</dd></div>
            <div><dt>覆盖地区</dt><dd>{regions.join('、') || '—'}</dd></div>
            <div><dt>数据来源</dt><dd>{sources.join('、') || '—'}</dd></div>
            <div><dt>数据时间</dt><dd>{firstRecord && lastRecord ? `${firstRecord.awardedAt} 至 ${lastRecord.awardedAt}` : '—'}</dd></div>
          </dl>
          <div className="history-sample-summary">
            <span>历史样本数量</span>
            <strong>{trend?.sampleCount ?? records.length} <small>条</small></strong>
            <em>高度相似样本 {highSimilarityCount} 条</em>
          </div>
        </aside>

        <div className="history-detail-main">
          {loading ? <div className="history-detail-state" role="status">正在从后端读取物料样本与趋势…</div> : null}
          {error ? <div className="history-detail-state history-detail-state--error" role="alert">{error}</div> : null}
          {!loading && !error ? (
            records.length > 0 ? (
              <>
                <PriceTrendChart records={records} materialName={focus.materialName} />
                {sampleDetail ? (
                  <section className="history-sample-detail" aria-label="单条历史报价样本详情">
                    <header><strong>样本详情 #{sampleDetail.sampleId}</strong><button type="button" onClick={() => setSampleDetail(null)}>关闭</button></header>
                    <dl>
                      <div><dt>材料 / 标包</dt><dd>{sampleDetail.materialName}</dd></div>
                      <div><dt>规格 / 品类</dt><dd>{sampleDetail.specification}</dd></div>
                      <div><dt>地区 / 发布单位</dt><dd>{sampleDetail.region}</dd></div>
                      <div><dt>中标价</dt><dd>{optionalPrice(sampleDetail.unitPrice)}</dd></div>
                      <div><dt>日期</dt><dd>{sampleDetail.awardedAt}</dd></div>
                      <div><dt>数据源</dt><dd>{sampleDetail.source}</dd></div>
                    </dl>
                  </section>
                ) : null}
                {sampleError ? <div className="history-detail-state history-detail-state--error" role="alert">{sampleError}</div> : null}
                <ComparableTable
                  records={records.slice(0, 5)}
                  loadingSampleId={sampleLoadingId}
                  onOpenSample={onOpenSampleDetail ? openSample : undefined}
                />
              </>
            ) : <div className="history-detail-state" role="status">后端未返回该物料的可比样本。</div>
          ) : null}
        </div>

        <aside className="history-detail-aside">
          <Stat label="最高价" value={optionalPrice(stats.max)} />
          <Stat label="最低价" value={optionalPrice(stats.min)} />
          <Stat accent label="中位数" value={optionalPrice(stats.median)} />
          <Stat label="平均价" value={optionalPrice(stats.average)} />
          <section className="history-similarity-legend">
            <h3>相似度说明</h3>
            <div><span className="history-dot history-dot--high" /><p><strong>高度相似</strong><small>规格型号与关键参数一致</small></p></div>
            <div><span className="history-dot history-dot--partial" /><p><strong>部分相似</strong><small>存在少量参数差异</small></p></div>
            <div><span className="history-dot history-dot--reference" /><p><strong>仅供参考</strong><small>规格或场景差异较大</small></p></div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function PriceTrendChart({ records, materialName }: { records: HistoricalQuoteRecord[]; materialName: string }) {
  const grouped = new Map<string, number[]>();
  records.forEach((record) => {
    if (record.unitPrice === undefined || !Number.isFinite(record.unitPrice)) return;
    const month = record.awardedAt.slice(0, 7);
    const values = grouped.get(month) ?? [];
    values.push(record.unitPrice);
    grouped.set(month, values);
  });
  const series = [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([month, values]) => {
      const ordered = [...values].sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      const median = ordered.length % 2
        ? ordered[middle]
        : (ordered[middle - 1] + ordered[middle]) / 2;
      return {
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
        median,
        month,
      };
    });
  const values = series.flatMap((point) => [point.average, point.median]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(maximum * 0.1, 1);
  const lowerBound = minimum - spread * 0.1;
  const upperBound = maximum + spread * 0.1;
  const chartWidth = 1138;
  const chartHeight = 200;
  const xFor = (index: number) => 52 + (series.length === 1 ? chartWidth / 2 : (index / (series.length - 1)) * chartWidth);
  const yFor = (value: number) => 42 + ((upperBound - value) / (upperBound - lowerBound)) * chartHeight;
  const averagePoints = series.map((point, index) => `${xFor(index)},${yFor(point.average)}`).join(' ');
  const medianPoints = series.map((point, index) => `${xFor(index)},${yFor(point.median)}`).join(' ');
  const labels = series.length <= 3
    ? series.map((_, index) => index)
    : [0, Math.floor((series.length - 1) / 2), series.length - 1];
  return (
    <section className="history-chart-card" aria-labelledby="history-chart-title">
      <h3 id="history-chart-title">价格趋势（单位：元 / 台）</h3>
      <svg className="history-chart" viewBox="0 0 1240 300" role="img" aria-labelledby="price-chart-svg-title price-chart-svg-desc">
        <title id="price-chart-svg-title">{materialName}历史中标价趋势</title>
        <desc id="price-chart-svg-desc">根据当前加载的 {records.length} 条历史样本按月计算中位数与平均价。</desc>
        <defs>
          <linearGradient id="history-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2db57c" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2db57c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[42, 92, 142, 192, 242].map((y, index) => (
          <g key={y}>
            <line x1="52" x2="1190" y1={y} y2={y} stroke="#e4eaec" strokeWidth="1" />
            <text x="42" y={y + 4} textAnchor="end">
              {Math.round(upperBound - ((upperBound - lowerBound) * index) / 4).toLocaleString('zh-CN')}
            </text>
          </g>
        ))}
        {medianPoints ? <polygon points={`52,242 ${medianPoints} 1190,242`} fill="url(#history-chart-fill)" /> : null}
        <polyline points={medianPoints} fill="none" stroke="#09905b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={averagePoints} fill="none" stroke="#3b82e6" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => (
          <circle key={point.month} cx={xFor(index)} cy={yFor(point.median)} r="5" fill="#09905b" />
        ))}
        {labels.map((index) => series[index] ? (
          <text
            key={series[index].month}
            x={xFor(index)}
            y="270"
            textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}
          >
            {series[index].month}
          </text>
        ) : null)}
      </svg>
      <div className="history-chart-legend">
        <span><i className="history-chart-line history-chart-line--median" />中标价中位数</span>
        <span><i className="history-chart-line history-chart-line--average" />平均价</span>
      </div>
    </section>
  );
}

function ComparableTable({
  records,
  loadingSampleId,
  onOpenSample,
}: {
  records: HistoricalQuoteRecord[];
  loadingSampleId?: string;
  onOpenSample?: (record: HistoricalQuoteRecord) => void;
}) {
  const similarityLabel = { high: '高度相似', partial: '部分相似', reference: '仅供参考' } as const;
  return (
    <div className="history-comparable-wrap">
      <table className="history-comparable-table">
        <thead><tr><th>项目名称</th><th>招标人</th><th>地区</th><th>数量</th><th>中标单价</th><th>中标日期</th><th>参数差异</th><th>相似度</th>{onOpenSample ? <th>样本详情</th> : null}</tr></thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{record.projectName}</td><td>{record.tenderer}</td><td>{record.region}</td><td>{record.quantity === undefined ? '—' : `${record.quantity} 台`}</td>
              <td className="history-price-cell">{optionalPrice(record.unitPrice)}</td><td>{record.awardedAt}</td><td>{record.parameterDifference}</td>
              <td><span className={`history-similarity history-similarity--${record.similarity}`}>{similarityLabel[record.similarity]}</span></td>
              {onOpenSample ? (
                <td>
                  <button
                    className="history-sample-detail-button"
                    disabled={!record.sampleId || Boolean(loadingSampleId)}
                    title={record.sampleId ? '调用后端单样本详情接口' : '后端样本列表未返回 sample_id'}
                    type="button"
                    onClick={() => onOpenSample(record)}
                  >
                    {loadingSampleId === record.sampleId ? '读取中…' : record.sampleId ? '查看' : 'ID 未提供'}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
