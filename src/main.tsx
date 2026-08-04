import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { App } from './app/App';
import { queryClient } from './app/query-client';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('BidVolt root element is missing');
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
  await worker.start({ onUnhandledRequest: 'bypass' });
};

enableMocking().then(renderApp).catch((error: unknown) => {
  console.error('BidVolt mock service worker failed to start', error);
  renderApp();
});
