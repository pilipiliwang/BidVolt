import { createAuthApi } from './auth';
import { createBackendApiClient, type TokenProvider } from './client';
import { createChatApi } from './chat';
import { createDeliverablesApi } from './deliverables';
import { createEditorApi } from './editor';
import { createEnterpriseApi } from './enterprise';
import { createFilesApi } from './files';
import { createProjectsApi } from './projects';
import { createQuotesApi } from './quotes';
import { createRequirementsApi } from './requirements';
import { createReviewApi } from './review';
import { createSnapshotsApi } from './snapshots';
import { createTasksApi } from './tasks';
import { createTenderNoticesApi } from './tender-notices';

export { BackendApiError, createBackendApiClient } from './client';
export type { BackendApiClient, BackendRequestOptions, TokenProvider } from './client';
export type * from './types';
export type { QuoteCalculationBody } from './quotes';
export type { EditorSession } from './editor';
export * from './adapters';

export const createBackendApi = ({
  baseUrl, tokenProvider, fetchImpl,
}: { baseUrl?: string; tokenProvider?: TokenProvider; fetchImpl?: typeof fetch } = {}) => {
  const client = createBackendApiClient({ baseUrl, tokenProvider, fetchImpl });
  return {
    client,
    auth: createAuthApi(client), projects: createProjectsApi(client), files: createFilesApi(client),
    enterprise: createEnterpriseApi(client), requirements: createRequirementsApi(client),
    snapshots: createSnapshotsApi(client), tasks: createTasksApi(client),
    tenderNotices: createTenderNoticesApi(client),
    deliverables: createDeliverablesApi(client), editor: createEditorApi(client), review: createReviewApi(client),
    quotes: createQuotesApi(client), chat: createChatApi(client),
  };
};

const runtimeTokenProvider: TokenProvider = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('bidvolt.access-token') ?? window.sessionStorage.getItem('bidvolt.access-token');
};

export const backendApi = createBackendApi({ tokenProvider: runtimeTokenProvider });
