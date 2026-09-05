import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Plugin } from 'vite';

const PREFIX = '/__office-download/';
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const maximumDownloadBytes = 100 * 1024 * 1024;

export function officeDownloadTarget(value = 'http://127.0.0.1:8081'): string {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol) || !loopbackHosts.has(target.hostname)
    || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('Office download target must be a loopback HTTP(S) origin');
  }
  // Avoid resolving a user-configured arbitrary hostname or following redirects.
  if (target.hostname === 'localhost' && target.protocol === 'http:') target.hostname = '127.0.0.1';
  return target.origin;
}

function permittedRequest(req: IncomingMessage) {
  if (!loopbackAddresses.has(req.socket.remoteAddress ?? '')) return false;
  const host = req.headers.host;
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)
    || req.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    const local = new URL(`http://${host}`);
    if (!loopbackHosts.has(local.hostname)) return false;
    if (req.headers.origin) {
      if (typeof req.headers.origin !== 'string') return false;
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || !loopbackHosts.has(origin.hostname)
        || origin.origin !== req.headers.origin || origin.host !== local.host) return false;
    }
    return true;
  } catch { return false; }
}

type DownloadOptions = { bridgeUrl?: string; fetch?: typeof globalThis.fetch; maxBytes?: number; timeoutMs?: number };

export function createOfficeDownloadHandler(options: DownloadOptions = {}) {
  const bridge = officeDownloadTarget(options.bridgeUrl);
  const fetchUpstream = options.fetch ?? globalThis.fetch;
  const limit = options.maxBytes ?? maximumDownloadBytes;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith(PREFIX)) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const fail = (status: number, message: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    if (!permittedRequest(req)) return fail(403, '仅允许本机同源下载。');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return fail(405, '下载仅支持 GET 或 HEAD。');
    }
    // Match the raw request target: no URL input, query, encoded path or traversal.
    const match = /^\/__office-download\/([a-f0-9]{16})\/versions\/(0|[1-9]\d{0,8})$/i.exec(req.url);
    if (!match) return fail(404, '下载路径无效。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
    const onClosed = () => { if (!res.writableFinished) controller.abort(); };
    res.once('close', onClosed);
    try {
      // The bridge currently has GET-only binary routes. HEAD checks the same
      // immutable version headers with GET, then cancels its body immediately.
      const upstream = await fetchUpstream(`${bridge}/files/${match[1].toLowerCase()}/versions/${match[2]}`, {
        method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal,
      });
      if (upstream.status !== 200) {
        await upstream.body?.cancel();
        return fail(upstream.status === 404 ? 404 : 502, upstream.status === 404 ? '文件版本不存在。' : '本地 Office 下载暂不可用。');
      }
      const declared = upstream.headers.get('content-length');
      const length = declared && /^\d+$/.test(declared) ? Number(declared) : undefined;
      if (length !== undefined && (!Number.isSafeInteger(length) || length > limit)) {
        await upstream.body?.cancel();
        return fail(413, '文件超过本地下载大小限制。');
      }
      if (!upstream.body) return fail(502, '文件内容不可用。');
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      const disposition = upstream.headers.get('content-disposition');
      res.setHeader('Content-Disposition', disposition?.replace(/^(?:inline|attachment)/i, 'attachment') || 'attachment');
      if (length !== undefined) res.setHeader('Content-Length', length);
      if (req.method === 'HEAD') { await upstream.body.cancel(); res.end(); return; }
      let transferred = 0;
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          transferred += value.byteLength;
          if (transferred > limit) throw new Error('Office download exceeds limit');
          if (!res.write(value)) await once(res, 'drain', { signal: controller.signal });
        }
        if (length !== undefined && transferred !== length) throw new Error('Office download size mismatch');
        res.end();
      } finally { await reader.cancel().catch(() => undefined); }
    } catch {
      controller.abort();
      if (res.destroyed) return;
      if (res.headersSent) res.destroy();
      else {
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Disposition');
        fail(502, '本地 Office 下载失败，请稍后重试。');
      }
    } finally {
      clearTimeout(timer);
      res.removeListener('close', onClosed);
    }
  };
}

export function officeDownloadPlugin(bridgeUrl?: string): Plugin {
  return {
    name: 'local-office-download', apply: 'serve',
    configureServer(server) { server.middlewares.use(createOfficeDownloadHandler({ bridgeUrl })); },
    configurePreviewServer(server) { server.middlewares.use(createOfficeDownloadHandler({ bridgeUrl })); },
  };
}
