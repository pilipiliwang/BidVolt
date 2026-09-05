import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

type LocalManifest = {
  projectId: string;
  taskId: string;
  directory: string;
  files: { id: string; name: string; extension: string }[];
};

/** Development-only bridge. Private files are never copied into public/ or dist/. */
export function localPackagePlugin(): Plugin {
  return {
    name: 'local-response-package',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__local-package/')) return next();
        const localAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
        const isLocalUrl = (value: string) => {
          try { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname); }
          catch { return false; }
        };
        if (!localAddresses.includes(req.socket.remoteAddress ?? '')
          || !isLocalUrl(`http://${req.headers.host}`)
          || (req.headers.origin && !isLocalUrl(req.headers.origin))
          || req.headers['sec-fetch-site'] === 'cross-site') {
          res.writeHead(403).end();
          return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' }).end();
          return;
        }
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const match = /^\/__local-package\/207\/(manifest\.json|file-\d+\/(preview|download|model))$/.exec(pathname);
        if (!match) { res.writeHead(404).end(); return; }
        try {
          const root = path.resolve(server.config.root, '.local-artifacts/project-207');
          const raw = await readFile(path.join(root, 'manifest.json'), 'utf8');
          const manifest = JSON.parse(raw) as LocalManifest;
          if (manifest.projectId !== '207' || manifest.taskId !== '3499'
            || !/^[a-f0-9]{12}$/.test(manifest.directory)) throw new Error('Invalid package scope');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          if (match[1] === 'manifest.json') {
            const { directory: _directory, ...publicManifest } = manifest;
            void _directory;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(req.method === 'HEAD' ? undefined : JSON.stringify(publicManifest));
            return;
          }
          const id = match[1].split('/')[0];
          const file = manifest.files.find(item => item.id === id);
          if (!file || !['.docx', '.xlsx'].includes(file.extension)) {
            res.writeHead(404).end(); return;
          }
          const preview = match[2] === 'preview';
          const model = match[2] === 'model';
          const suffix = preview ? '.html' : model ? '.json' : file.extension;
          const data = await readFile(path.join(root, manifest.directory, `${id}${suffix}`));
          if (preview) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox");
          } else if (model) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          } else {
            res.setHeader('Content-Type', file.extension === '.docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${id}${file.extension}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
          }
          res.setHeader('Content-Length', data.length);
          res.end(req.method === 'HEAD' ? undefined : data);
        } catch {
          if (match[2] === 'preview') {
            res.writeHead(404, {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Security-Policy': "default-src 'none'; sandbox",
            }).end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><p>本地预览暂时不可用，请下载原件查看。</p></html>');
          } else res.writeHead(404).end();
        }
      });
    },
  };
}
