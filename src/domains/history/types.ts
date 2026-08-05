export type HistoricalQuoteRecord = {
  id: string;
  projectName: string;
  tenderer: string;
  year: number;
  packageName: string;
  materialName: string;
  materialCode: string;
  specification: string;
  region: string;
  quantity: number;
  supplier: string;
  unitPrice: number;
  taxRate: string;
  awardedAt: string;
  source: '公开公告' | '企业历史';
  parameterDifference: string;
  similarity: 'high' | 'partial' | 'reference';
};

export type HistoryPricesPageProps = {
  records?: HistoricalQuoteRecord[];
  totalCount?: number;
};
