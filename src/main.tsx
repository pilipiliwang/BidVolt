import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { App } from './app/App';
import { queryClient } from './app/query-client';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('AI电网投标助手根节点缺失');
}

const renderApp = () => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
};

const enableMocking = async () => {
  if (import.meta.env.VITE_API_MODE !== 'mock') return;

  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith('/api/')) {
        print.error();
      }
    },
  });
};

enableMocking().then(renderApp).catch(() => {
  console.error('BIDVOLT_MOCK_BOOTSTRAP_FAILED');
  renderApp();
});
