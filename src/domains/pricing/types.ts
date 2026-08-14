export type HistoryPriceSample = {
  id: string;
  materialRef?: string;
  materialName: string;
  materialCode?: string;
  specification: string;
  region?: string;
  price: string;
  currency: string;
  taxIncluded?: boolean;
  occurredAt: string;
  sourceLabel: string;
  sourceHash?: string;
  usable: boolean;
  excludedReason?: string;
};

export type QuoteStrategy = {
  id: string;
  name: string;
  description: string;
  amount: string;
  currency: string;
  confidenceLow?: string;
  confidenceHigh?: string;
  predictedScore?: string;
  grossMargin?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  recommended?: boolean;
};

export type QuoteCalculationView = {
  id: string;
  status: 'calculated' | 'applied' | 'abandoned' | 'needs_input' | 'insufficient_data' | 'constraint_violation';
  algorithmVersion: string;
  sampleSnapshotId: string;
  querySnapshotId: string;
  message?: string;
  strategies: QuoteStrategy[];
};
