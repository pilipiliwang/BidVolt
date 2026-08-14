import { idPath, type BackendApiClient } from './client';
import type { BackendId, ChatMessage, Conversation } from './types';

export const createChatApi = (client: BackendApiClient) => ({
  listConversations: (projectId: BackendId) =>
    client.request<{ items: Conversation[] }>(`/projects/${idPath(projectId)}/conversations`),
  createConversation: (projectId: BackendId, title?: string) =>
    client.request<Conversation>(`/projects/${idPath(projectId)}/conversations`, {
      method: 'POST', body: { title },
    }),
  listMessages: (projectId: BackendId, conversationId: BackendId) =>
    client.request<{ items: ChatMessage[] }>(
      `/projects/${idPath(projectId)}/conversations/${idPath(conversationId)}/messages`,
    ),
  sendMessage: (projectId: BackendId, conversationId: BackendId, message: string) =>
    client.request<{ user_message_id: number; assistant_message_id: number; reply: string; mode: string }>(
      `/projects/${idPath(projectId)}/conversations/${idPath(conversationId)}/messages`,
      { method: 'POST', body: { message } },
    ),
});
