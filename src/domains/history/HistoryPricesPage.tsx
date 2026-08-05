import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import { historyRecordsDemo } from './demo-data';
import type { HistoricalQuoteRecord, HistoryPricesPageProps } from './types';
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
  materialName: '10kV开关柜',
  materialCode: '',
  specification: 'KYN28A-12',
  tenderer: '',
  region: '',
  years: '2021—2024',
};

const HISTORY_PAGE_SIZE = 5;

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function price(value: number) {
  return currencyFormatter.format(value);
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
  const values = records.map((record) => record.unitPrice).sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const middleIndex = Math.floor(values.length / 2);
  const median = values.length
    ? values.length % 2
      ? values[middleIndex]
      : (values[middleIndex - 1] + values[middleIndex]) / 2
    : 0;
  const latest = [...records].sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))[0];

  return {
    min: values[0] ?? 0,
    max: values.at(-1) ?? 0,
    median,
    average: values.length ? total / values.length : 0,
    latest: latest?.unitPrice ?? 0,
  };
}

export function HistoryPricesPage({
  records = historyRecordsDemo,
  totalCount = 1268,
}: HistoryPricesPageProps) {
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [detailMaterial, setDetailMaterial] = useState<HistoricalQuoteRecord | null>(null);
  const [page, setPage] = useState(1);

  const visibleRecords = useMemo(
    () =>
      records.filter((record) => {
        const materialQuery = filters.materialName.replace('开关柜', '').trim();
        return (
          (!materialQuery || matchesText(record.materialName, materialQuery)) &&
          (!filters.materialCode || matchesText(record.materialCode, filters.materialCode)) &&
          (!filters.specification || matchesText(record.specification, filters.specification)) &&
          (!filters.tenderer || matchesText(record.tenderer, filters.tenderer)) &&
          (!filters.region || matchesText(record.region, filters.region)) &&
          matchesYear(record.year, filters.years)
        );
      }),
    [filters, records],
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
        records={records.filter((record) => record.materialCode === detailMaterial.materialCode)}
        onBack={() => setDetailMaterial(null)}
      />
    );
  }

  const stats = calculateStats(visibleRecords);
  const isReferenceOverview =
    records === historyRecordsDemo && visibleRecords.length === historyRecordsDemo.length;
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

  const filterFields: Array<{
    key: keyof Filters;
    label: string;
    placeholder: string;
  }> = [
    { key: 'materialName', label: '物料名称', placeholder: '输入物料名称' },
    { key: 'materialCode', label: '物料编码', placeholder: '输入编码' },
    { key: 'specification', label: '规格型号', placeholder: '输入规格型号' },
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
          <Stat label="历史样本数量" value={(isReferenceOverview ? totalCount : visibleRecords.length).toLocaleString('zh-CN')} />
          <Stat accent label="最低中标价" value={isReferenceOverview ? '10,200' : price(stats.min)} />
          <Stat accent label="最高中标价" value={isReferenceOverview ? '15,800' : price(stats.max)} />
          <Stat label="中位数" value={isReferenceOverview ? '12,450' : price(stats.median)} />
          <Stat label="平均价" value={isReferenceOverview ? '12,610' : price(stats.average)} />
          <Stat label="最近一次中标价" value={price(stats.latest)} />
          <Stat accent label="近一年价格变化" value="−2.35%" />
        </div>

        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>项目名称</th>
                <th>招标人</th>
                <th>年份</th>
                <th>分标/分包</th>
                <th>物料编码</th>
                <th>规格型号</th>
                <th>数量</th>
                <th>中标供应商</th>
                <th>中标单价</th>
                <th>税率</th>
                <th>中标日期</th>
                <th>数据来源</th>
              </tr>
            </thead>
            <tbody>
              {pageRecords.map((record) => (
                <tr key={record.id}>
                  <td>
                    <button type="button" onClick={() => setDetailMaterial(record)}>
                      {record.projectName}
                    </button>
                  </td>
                  <td>{record.tenderer}</td>
                  <td>{record.year}</td>
                  <td>{record.packageName}</td>
                  <td>{record.materialCode}</td>
                  <td>{record.specification}</td>
                  <td>{record.quantity} 台</td>
                  <td>{record.supplier}</td>
                  <td className="history-price-cell">{price(record.unitPrice)}</td>
                  <td>{record.taxRate}</td>
                  <td>{record.awardedAt}</td>
                  <td>{record.source}</td>
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
            当前匹配 {visibleRecords.length} 条 · 外部总计 {totalCount.toLocaleString('zh-CN')} 条
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
  onBack,
}: {
  focus: HistoricalQuoteRecord;
  records: HistoricalQuoteRecord[];
  onBack: () => void;
}) {
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
            <div><dt>额定电压</dt><dd>12kV</dd></div>
            <div><dt>额定电流</dt><dd>1250A</dd></div>
            <div><dt>短路开断</dt><dd>31.5kA</dd></div>
            <div><dt>关键参数</dt><dd>真空断路器、金属铠装、空气绝缘</dd></div>
            <div><dt>数据时间</dt><dd>2021-01 至 2024-08</dd></div>
          </dl>
          <div className="history-sample-summary">
            <span>历史样本数量</span>
            <strong>128 <small>条</small></strong>
            <em>高度相似样本 56 条</em>
          </div>
        </aside>

        <div className="history-detail-main">
          <PriceTrendChart />
          <ComparableTable records={records.slice(0, 5)} />
        </div>

        <aside className="history-detail-aside">
          <Stat label="最高价" value="15,800.00" />
          <Stat label="最低价" value="10,200.00" />
          <Stat accent label="中位数" value="12,450.00" />
          <Stat label="平均价" value="12,610.00" />
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

function PriceTrendChart() {
  const medianPoints = '52,196 128,178 204,188 280,150 356,169 432,132 508,146 584,112 660,136 736,91 812,105 888,72 964,85 1040,55 1116,69 1190,42';
  const averagePoints = '52,222 128,210 204,218 280,195 356,205 432,178 508,190 584,172 660,181 736,162 812,171 888,150 964,158 1040,137 1116,146 1190,126';
  return (
    <section className="history-chart-card" aria-labelledby="history-chart-title">
      <h3 id="history-chart-title">价格趋势（单位：元 / 台）</h3>
      <svg className="history-chart" viewBox="0 0 1240 300" role="img" aria-labelledby="price-chart-svg-title price-chart-svg-desc">
        <title id="price-chart-svg-title">10kV高压开关柜历史中标价趋势</title>
        <desc id="price-chart-svg-desc">2023年1月至2024年8月，中标价中位数与平均价整体呈上升趋势。</desc>
        <defs>
          <linearGradient id="history-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2db57c" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2db57c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[42, 92, 142, 192, 242].map((y, index) => (
          <g key={y}>
            <line x1="52" x2="1190" y1={y} y2={y} stroke="#e4eaec" strokeWidth="1" />
            <text x="42" y={y + 4} textAnchor="end">{(20 - index * 4).toLocaleString()},000</text>
          </g>
        ))}
        <polygon points={`52,242 ${medianPoints} 1190,242`} fill="url(#history-chart-fill)" />
        <polyline points={medianPoints} fill="none" stroke="#09905b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={averagePoints} fill="none" stroke="#3b82e6" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {['52,196', '280,150', '584,112', '1040,55', '1190,42'].map((point) => {
          const [cx, cy] = point.split(',');
          return <circle key={point} cx={cx} cy={cy} r="6" fill="#09905b" />;
        })}
        <text x="52" y="270">2023-01</text>
        <text x="330" y="270">2023-06</text>
        <text x="625" y="270">2023-12</text>
        <text x="910" y="270">2024-05</text>
        <text x="1190" y="270" textAnchor="end">2024-08</text>
      </svg>
      <div className="history-chart-legend">
        <span><i className="history-chart-line history-chart-line--median" />中标价中位数</span>
        <span><i className="history-chart-line history-chart-line--average" />平均价</span>
      </div>
    </section>
  );
}

function ComparableTable({ records }: { records: HistoricalQuoteRecord[] }) {
  const similarityLabel = { high: '高度相似', partial: '部分相似', reference: '仅供参考' } as const;
  return (
    <div className="history-comparable-wrap">
      <table className="history-comparable-table">
        <thead><tr><th>项目名称</th><th>招标人</th><th>地区</th><th>数量</th><th>中标单价</th><th>中标日期</th><th>参数差异</th><th>相似度</th></tr></thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{record.projectName}</td><td>{record.tenderer}</td><td>{record.region}</td><td>{record.quantity} 台</td>
              <td className="history-price-cell">{price(record.unitPrice)}</td><td>{record.awardedAt}</td><td>{record.parameterDifference}</td>
              <td><span className={`history-similarity history-similarity--${record.similarity}`}>{similarityLabel[record.similarity]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
