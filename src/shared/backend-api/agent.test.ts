import { describe, expect, it, vi } from 'vitest';
import { createAgentApi } from './agent';
import { createBackendApiClient } from './client';

const historyPage = (start: number, count: number) => new Response(
  Array.from({ length: count }, (_, index) => `event: message\ndata: ${JSON.stringify({
    seq: start + index, kind: 'final', content: `记录 ${start + index}`,
  })}\n\n`).join('') + 'event: end\ndata: {"status":3,"outcome":"complete"}\n\n',
  { headers: { 'Content-Type': 'text/event-stream' } },
);

describe('completed agent history recovery', () => {
  it('drains capped history pages so recent replies after the first 200 records are delivered', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(historyPage(8, 200))
      .mockResolvedValueOnce(historyPage(208, 200))
      .mockResolvedValueOnce(historyPage(408, 2));
    const api = createAgentApi(createBackendApiClient({ baseUrl: '/api/v1', fetchImpl }));
    const onMessage = vi.fn();
    await expect(api.stream(7, 4, { since: 7, onMessage })).resolves.toMatchObject({ status: 3 });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/projects/7/agent-run/4/stream?since=7',
      '/api/v1/projects/7/agent-run/4/stream?since=207',
      '/api/v1/projects/7/agent-run/4/stream?since=407',
    ]);
    expect(onMessage).toHaveBeenCalledTimes(402);
    expect(onMessage.mock.lastCall?.[0]).toMatchObject({ seq: 409, content: '记录 409' });
  });

  it('does not silently complete or loop when the backend repeats a full old page', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => historyPage(1, 200));
    const api = createAgentApi(createBackendApiClient({ baseUrl: '/api/v1', fetchImpl }));
    const onMessage = vi.fn();
    await expect(api.stream(7, 4, { onMessage })).rejects.toThrow('历史记录读取未能继续');
    expect(onMessage).toHaveBeenCalledTimes(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('honors cancellation between history pages', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(historyPage(1, 200));
    const api = createAgentApi(createBackendApiClient({ baseUrl: '/api/v1', fetchImpl }));
    await expect(api.stream(7, 4, {
      signal: controller.signal,
      onMessage: ({ seq }) => { if (seq === 200) controller.abort(); },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
