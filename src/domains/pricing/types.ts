export type HistoryPriceSample = {
  id: string;
  materialName: string;
  specification: string;
  price: string;
  currency: string;
  taxIncluded: boolean;
  occurredAt: string;
  sourceLabel: string;
  usable: boolean;
  excludedReason?: string;
};

export type QuoteStrategy = {
  id: string;
  name: string;
  description: string;
  amount: string;
  currency: string;
  confidenceLow: string;
  confidenceHigh: string;
  recommended?: boolean;
};

export type QuoteCalculationView = {
  id: string;
  status: 'calculated' | 'needs_input' | 'insufficient_data' | 'constraint_violation';
  algorithmVersion: string;
  sampleSnapshotId: string;
  querySnapshotId: string;
  message?: string;
  strategies: QuoteStrategy[];
};
