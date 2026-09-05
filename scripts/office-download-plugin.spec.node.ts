import { createServer, request, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOfficeDownloadHandler, officeDownloadTarget } from './office-download-plugin';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const versionPath = '/__office-download/1234567890abcdef/versions/2';
async function start(fetcher: typeof fetch, options = {}) {
  const handler = createOfficeDownloadHandler({ fetch: fetcher, ...options });
  const server = createServer((req, res) => void handler(req, res, () => { res.writeHead(404).end(); }));
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return { port: address.port, host: `127.0.0.1:${address.port}` };
}
async function get(port: number, path = versionPath, method = 'GET', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: Buffer; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('aborted', () => reject(new Error('aborted')));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject); req.end();
  });
}

describe('local Office download proxy', () => {
  it('only accepts fixed loopback target origins', () => {
    expect(officeDownloadTarget('http://localhost:8081')).toBe('http://127.0.0.1:8081');
    for (const value of ['https://example.test', 'http://127.0.0.1:8081/path', 'http://user@localhost:8081', 'http://127.0.0.1:8081/?url=x']) {
      expect(() => officeDownloadTarget(value)).toThrow();
    }
  });
  it('streams the exact version bytes without forwarding cookies or authorization', async () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 3, 4, 8]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes, { headers: { 'content-length': '5', 'content-type': 'application/octet-stream', 'content-disposition': "inline; filename*=UTF-8''fixture.docx", 'set-cookie': 'secret=1' } }));
    const { port } = await start(fetcher);
    const result = await get(port, versionPath, 'GET', { cookie: 'session=secret', authorization: 'Bearer secret' });
    expect(result.status).toBe(200); expect(result.body).toEqual(Buffer.from(bytes));
    expect(result.headers['content-disposition']).toBe("attachment; filename*=UTF-8''fixture.docx");
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8081/files/1234567890abcdef/versions/2', expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'manual' }));
    expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
  });
  it('supports HEAD with no transferred response body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('hello', { headers: { 'content-length': '5' } }));
    const { port } = await start(fetcher);
    const result = await get(port, versionPath, 'HEAD');
    expect(result.status).toBe(200); expect(result.body.length).toBe(0); expect(result.headers['content-length']).toBe('5');
  });
  it('rejects foreign hosts, origins and cross-site requests before contacting the bridge', async () => {
    const fetcher = vi.fn<typeof fetch>(); const { port, host } = await start(fetcher);
    for (const headers of [{ host: 'evil.test' }, { origin: 'https://evil.test' }, { origin: 'http://localhost:9999' }, { origin: `http://${host}/path` }, { 'sec-fetch-site': 'cross-site' }]) {
      expect((await get(port, versionPath, 'GET', headers)).status).toBe(403);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects writes, traversal, query targets and non-canonical version numbers', async () => {
    const fetcher = vi.fn<typeof fetch>(); const { port } = await start(fetcher);
    expect((await get(port, versionPath, 'POST')).status).toBe(405);
    for (const path of [versionPath + '?url=http://evil.test', versionPath + '/../0', versionPath.replace('/2', '/-1'), versionPath.replace('/2', '/02'), versionPath.replace('/2', '/9999999999'), '/__office-download/http://evil.test']) {
      expect((await get(port, path)).status).toBe(404);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not follow redirects and does not leak upstream failure bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('private upstream data', { status: 302, headers: { location: 'http://evil.test' } })).mockResolvedValueOnce(new Response('private', { status: 404 })).mockRejectedValueOnce(new Error('secret'));
    const { port } = await start(fetcher);
    const redirected = await get(port); expect(redirected.status).toBe(502); expect(redirected.headers.location).toBeUndefined(); expect(redirected.body.toString()).not.toContain('private');
    expect((await get(port)).status).toBe(404); expect((await get(port)).status).toBe(502);
  });
  it('enforces both declared and actually streamed size limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('huge', { headers: { 'content-length': '999' } })).mockResolvedValueOnce(new Response('01234567890123456789'));
    const { port } = await start(fetcher, { maxBytes: 10 });
    expect((await get(port)).status).toBe(413); expect((await get(port)).status).toBe(502);
  });
});
