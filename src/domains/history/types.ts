export type HistoricalQuoteRecord = {
  id: string;
  sampleId?: string;
  materialRef?: string;
  projectName: string;
  tenderer: string;
  year: number;
  packageName: string;
  materialName: string;
  materialCode: string;
  specification: string;
  region: string;
  quantity?: number;
  supplier: string;
  unitPrice?: number;
  taxRate: string;
  awardedAt: string;
  source: string;
  parameterDifference: string;
  similarity: 'high' | 'partial' | 'reference';
  category?: string;
  priceMode?: string;
  limitPrice?: number;
  winRatio?: number;
  noticeId?: string;
  scope?: 'public' | 'private';
  limitEvidence?: string;
  winEvidence?: string;
  limitEvidenceUrl?: string;
  winEvidenceUrl?: string;
};

export type HistoryPriceSource = {
  id: string;
  name: string;
  fetchedAt: string;
  coverage: string;
  updatePolicy: string;
  readonlyVerified: boolean;
};

export type HistoryPriceTrend = {
  materialRef: string;
  sampleCount: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  median: number | null;
  latest: number | null;
  latestAt: string;
  readonly: boolean;
};

export type HistoryMaterialDetail = {
  records: HistoricalQuoteRecord[];
  trend: HistoryPriceTrend;
};

export type HistoryPriceImportResult = {
  imported: number;
  skipped: number;
  parsedTotal: number;
  skippedRows: number;
  scope: 'public' | 'private';
};

export type HistoryPricesPageProps = {
  records?: HistoricalQuoteRecord[];
  totalCount?: number;
  onLoadSources?: () => Promise<HistoryPriceSource[]>;
  onOpenMaterial?: (materialRef: string) => Promise<HistoryMaterialDetail>;
  onImportHistory?: (file: File, target: 'public' | 'private') => Promise<HistoryPriceImportResult>;
  onOpenSampleDetail?: (sampleId: string) => Promise<HistoricalQuoteRecord>;
};
