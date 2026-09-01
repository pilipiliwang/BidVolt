import { idPath, queryString, type BackendApiClient } from './client';
import type {
  BackendId, JsonObject, QuoteAiSuggestion, QuoteCalculationDetail,
  QuoteCalculationListItem, QuoteHistoryImportResponse, QuoteHistoryQuery,
  QuoteHistoryResponse, QuoteHistorySample, QuoteSourceMetadata, QuoteTrend,
} from './types';

export type QuoteCalculationBody = {
  material_ref: string; cost: number; project_id?: BackendId; min_profit_rate?: number;
  unit?: string; adjustments?: Record<string, number>; method?: string; cap?: number;
  score_formula?: string;
};

export const createQuotesApi = (client: BackendApiClient) => ({
  history: (params: QuoteHistoryQuery = {}) =>
    client.request<QuoteHistoryResponse>(`/quotes/history${queryString(params)}`),
  importHistory: (file: File, target: 'public' | 'private') => {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('target', target);
    return client.request<QuoteHistoryImportResponse>('/quotes/history/import', {
      method: 'POST', body: form,
    });
  },
  samples: (materialRef: string) =>
    client.request<QuoteHistorySample[]>(`/quotes/history/${idPath(materialRef)}/samples`),
  sampleDetail: (sampleId: BackendId) =>
    client.request<QuoteHistorySample>(`/quotes/history/samples/${idPath(sampleId)}`),
  trend: (materialRef: string) =>
    client.request<QuoteTrend>(`/quotes/history/${idPath(materialRef)}/trend`),
  sourceMetadata: () => client.request<QuoteSourceMetadata[]>('/quotes/history/source-metadata'),
  calculate: (body: QuoteCalculationBody) =>
    client.request<{ calc_id: number; result: JsonObject }>('/quotes/calculate', { method: 'POST', body }),
  recalculate: (calcId: BackendId) =>
    client.request<{
      calc_id: number; recalc: JsonObject; matches_original: boolean; engine_version: string;
    }>('/quotes/recalc', { method: 'POST', body: { calc_id: calcId } }),
  strategy: (calcId: BackendId, strategy: 'win' | 'balance' | 'profit') =>
    client.request<JsonObject>('/quotes/strategies', {
      method: 'POST', body: { calc_id: calcId, strategy },
    }),
  aiSuggest: (calcId: BackendId, basis: string) =>
    client.request<QuoteAiSuggestion>('/quotes/ai-suggest', {
      method: 'POST', body: { calc_id: calcId, basis },
    }),
  list: (projectId?: BackendId) =>
    client.request<{ items: QuoteCalculationListItem[] }>(
      `/quotes${queryString({ project_id: projectId })}`,
    ),
  get: (calcId: BackendId) =>
    client.request<QuoteCalculationDetail>(`/quotes/${idPath(calcId)}`),
  apply: (body: {
    calc_id: BackendId; deliverable_id: BackendId; note?: string; expected_version_no?: number;
    idempotency_key?: string;
  }) => client.request<{ new_version_no: number; calc_status: number }>(
    '/quotes/apply', { method: 'POST', body },
  ),
});
