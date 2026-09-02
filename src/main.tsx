import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { App } from './app/App';
import { queryClient } from './app/query-client';
import { PRODUCT_NAME } from './shared/product-brand';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error(`${PRODUCT_NAME}根节点缺失`);
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
