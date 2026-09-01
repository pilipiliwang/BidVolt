import { consumeAgentRunStream, type AgentRunStreamEnd, type AgentRunStreamMessage } from './agent-stream';
import { idPath, queryString, type BackendApiClient } from './client';
import type {
  AgentAnswerResponse, AgentChatResponse, AgentCreateAskRequest, AgentCreateAskResponse,
  AgentCustomerState, AgentRunCreated, AgentRunStartRequest, AgentRunStatus, BackendId,
} from './types';

export type AgentRunStreamOptions = {
  since?: number;
  signal?: AbortSignal;
  onMessage: (event: AgentRunStreamMessage) => void;
};

export const createAgentApi = (client: BackendApiClient) => {
  const base = (projectId: BackendId) => `/projects/${idPath(projectId)}`;

  return {
    start: (projectId: BackendId, body: AgentRunStartRequest) =>
      client.request<AgentRunCreated>(`${base(projectId)}/agent-run`, { method: 'POST', body }),
    status: (
      projectId: BackendId,
      taskId: BackendId,
      { signal }: { signal?: AbortSignal } = {},
    ) => client.request<AgentRunStatus>(
      `${base(projectId)}/agent-run/${idPath(taskId)}`,
      { signal },
    ),
    questions: (projectId: BackendId, taskId: BackendId) =>
      client.request<AgentCustomerState>(
        `${base(projectId)}/agent-run/${idPath(taskId)}/questions`,
      ),
    createAsk: (
      projectId: BackendId,
      taskId: BackendId,
      body: AgentCreateAskRequest,
    ) => client.request<AgentCreateAskResponse>(
      `${base(projectId)}/agent-run/${idPath(taskId)}/asks`,
      { method: 'POST', body },
    ),
    answer: (
      projectId: BackendId,
      taskId: BackendId,
      askId: BackendId,
      answer: string | string[],
    ) => client.request<AgentAnswerResponse>(
      `${base(projectId)}/agent-run/${idPath(taskId)}/asks/${idPath(askId)}/answer`,
      { method: 'POST', body: { answer } },
    ),
    preChat: (projectId: BackendId, message: string) =>
      client.request<AgentChatResponse>(`${base(projectId)}/pre-chat`, {
        method: 'POST', body: { message },
      }),
    chat: (
      projectId: BackendId,
      taskId: BackendId,
      body: { message: string; mode?: 'queue' | 'steer' },
    ) => client.request<AgentChatResponse>(
      `${base(projectId)}/agent-run/${idPath(taskId)}/chat`,
      { method: 'POST', body },
    ),
    stream: async (
      projectId: BackendId,
      taskId: BackendId,
      { since = 0, signal, onMessage }: AgentRunStreamOptions,
    ): Promise<AgentRunStreamEnd> => client.requestStream(
        `${base(projectId)}/agent-run/${idPath(taskId)}/stream${queryString({ since })}`,
        { headers: { Accept: 'text/event-stream' }, signal },
        (response) => consumeAgentRunStream(response, { signal, onMessage }),
      ),
    streamUrl: (
      projectId: BackendId,
      taskId: BackendId,
      since = 0,
      baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
    ) => `${baseUrl.replace(/\/+$/, '')}${base(projectId)}/agent-run/${idPath(taskId)}/stream${queryString({ since })}`,
    responsePackage: (projectId: BackendId) =>
      client.requestBlob(`${base(projectId)}/response-package`),
    downloadArtifact: (projectId: BackendId, artifactId: BackendId) =>
      client.requestBlob(`${base(projectId)}/agent-artifact/${idPath(artifactId)}/download`),
  };
};
