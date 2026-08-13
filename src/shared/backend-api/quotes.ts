import { idPath, queryString, type BackendApiClient } from './client';
import type { BackendId } from './types';

export type QuoteCalculationBody = {
  material_ref: string; cost: number; project_id?: BackendId; min_profit_rate?: number;
  adjustments?: Record<string, number>; method?: string; cap?: number; score_formula?: string;
};

export const createQuotesApi = (client: BackendApiClient) => ({
  history: (materialRef?: string) =>
    client.request<Record<string, unknown>>(`/quotes/history${queryString({ material_ref: materialRef })}`),
  samples: (materialRef: string) =>
    client.request<Array<Record<string, unknown>>>(`/quotes/history/${idPath(materialRef)}/samples`),
  sourceMetadata: () => client.request<Array<Record<string, unknown>>>('/quotes/history/source-metadata'),
  calculate: (body: QuoteCalculationBody) =>
    client.request<Record<string, unknown>>('/quotes/calculate', { method: 'POST', body }),
  recalculate: (calcId: BackendId) =>
    client.request<Record<string, unknown>>('/quotes/recalc', { method: 'POST', body: { calc_id: calcId } }),
  strategy: (calcId: BackendId, strategy: 'win' | 'balance' | 'profit') =>
    client.request<Record<string, unknown>>('/quotes/strategies', { method: 'POST', body: { calc_id: calcId, strategy } }),
  list: (projectId?: BackendId) =>
    client.request<{ items: Array<Record<string, unknown>> }>(`/quotes${queryString({ project_id: projectId })}`),
  get: (calcId: BackendId) => client.request<Record<string, unknown>>(`/quotes/${idPath(calcId)}`),
  apply: (body: {
    calc_id: BackendId; deliverable_id: BackendId; note?: string; expected_version_no?: number;
    idempotency_key?: string;
  }) => client.request<Record<string, unknown>>('/quotes/apply', { method: 'POST', body }),
});
