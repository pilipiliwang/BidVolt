import { createAuthApi } from './auth';
import {
  BackendApiError,
  createBackendApiClient,
  type RefreshHandler,
  type TokenProvider,
} from './client';
import {
  expireBackendSessionIfCurrent,
  getBackendAccessToken,
  getBackendRefreshToken,
  replaceBackendSessionTokens,
} from '../../app/backend-session';
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
  baseUrl, tokenProvider, fetchImpl, onAuthExpired, refreshHandler,
}: {
  baseUrl?: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
  onAuthExpired?: (accessToken: string | null) => void;
  refreshHandler?: RefreshHandler;
} = {}) => {
  const client = createBackendApiClient({
    baseUrl, tokenProvider, fetchImpl, onAuthExpired, refreshHandler,
  });
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

const runtimeBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const refreshClient = createBackendApiClient({ baseUrl: runtimeBaseUrl });
const refreshApi = createAuthApi(refreshClient);

const runtimeRefreshHandler: RefreshHandler = async () => {
  const accessToken = getBackendAccessToken();
  const refreshToken = getBackendRefreshToken();
  if (!accessToken || !refreshToken) return false;

  try {
    const tokens = await refreshApi.refresh(refreshToken);
    return replaceBackendSessionTokens(tokens, { accessToken, refreshToken });
  } catch (error) {
    if (error instanceof BackendApiError && [400, 401, 403].includes(error.status)) {
      expireBackendSessionIfCurrent({ accessToken, refreshToken });
    }
    return false;
  }
};

export const backendApi = createBackendApi({
  baseUrl: runtimeBaseUrl,
  onAuthExpired: (accessToken) => {
    const refreshToken = getBackendRefreshToken();
    if (accessToken && refreshToken) {
      expireBackendSessionIfCurrent({ accessToken, refreshToken });
    }
  },
  refreshHandler: runtimeRefreshHandler,
  tokenProvider: runtimeTokenProvider,
});
