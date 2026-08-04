import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the Web frontend product boundary', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: /投标工作/ })).toBeInTheDocument();
    expect(screen.getByText('企业资料独立归档')).toBeInTheDocument();
    expect(screen.getByText('项目材料严格隔离')).toBeInTheDocument();
  });
});
