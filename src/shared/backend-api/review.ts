import { idPath, type BackendApiClient } from './client';
import type {
  BackendId, JsonObject, ReviewItem, ReviewProvider, ReviewRun, ReviewRunDetail,
  ReviewItemBatchConfirmRequest, ReviewItemBatchConfirmResponse, ReviewItemConfirmRequest,
  ReviewItemMutationResult, ReviewReEvaluateResponse, ReviewRunRequest, ScoreSummary,
} from './types';

export const createReviewApi = (client: BackendApiClient) => ({
  listProviders: () => client.request<ReviewProvider[]>('/review-providers'),
  updateProvider: (providerId: BackendId, body: { enabled?: boolean; config?: JsonObject }) =>
    client.request<Record<string, unknown>>(`/review-providers/${idPath(providerId)}/config`, { method: 'PUT', body }),
  listRuns: (projectId: BackendId) =>
    client.request<{ items: ReviewRun[] }>(`/projects/${idPath(projectId)}/reviews`),
  getRun: (projectId: BackendId, runId: BackendId) =>
    client.request<ReviewRunDetail>(`/projects/${idPath(projectId)}/reviews/${idPath(runId)}`),
  evaluate: (projectId: BackendId, body?: ReviewRunRequest) =>
    client.request<Record<string, unknown>>(`/projects/${idPath(projectId)}/evaluate`, {
      method: 'POST',
      ...(body?.provider_id === undefined ? {} : { body }),
    }),
  latestScore: (projectId: BackendId) =>
    client.request<ScoreSummary>(`/projects/${idPath(projectId)}/scores`),
  listItems: (projectId: BackendId, scoreId: BackendId) =>
    client.request<ReviewItem[]>(`/projects/${idPath(projectId)}/scores/${idPath(scoreId)}/items`),
  updateSuggestion: (projectId: BackendId, scoreId: BackendId, itemId: BackendId, suggestion: string) =>
    client.request<Record<string, unknown>>(
      `/projects/${idPath(projectId)}/scores/${idPath(scoreId)}/items/${idPath(itemId)}/suggestion`,
      { method: 'PUT', body: { suggestion } },
    ),
  confirmItem: (
    projectId: BackendId,
    scoreId: BackendId,
    itemId: BackendId,
    body: ReviewItemConfirmRequest,
  ) => client.request<ReviewItemMutationResult>(
    `/projects/${idPath(projectId)}/scores/${idPath(scoreId)}/items/${idPath(itemId)}/confirm`,
    { method: 'PUT', body },
  ),
  confirmItems: (
    projectId: BackendId,
    scoreId: BackendId,
    body: ReviewItemBatchConfirmRequest,
  ) => client.request<ReviewItemBatchConfirmResponse>(
    `/projects/${idPath(projectId)}/scores/${idPath(scoreId)}/items/confirm`,
    { method: 'POST', body },
  ),
  reEvaluate: (projectId: BackendId, itemIds: number[]) =>
    client.request<ReviewReEvaluateResponse>(`/projects/${idPath(projectId)}/re-evaluate`, {
      method: 'POST', body: { item_ids: itemIds },
    }),
});
