import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { localPackagePlugin } from './scripts/local-package-plugin.ts';
import { officeDownloadPlugin } from './scripts/office-download-plugin.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const proxy = env.VITE_API_PROXY_TARGET
    ? {
        '/api': {
          target: env.VITE_API_PROXY_TARGET,
          changeOrigin: true,
        },
      }
    : undefined;

  return {
    plugins: [react(), localPackagePlugin(), officeDownloadPlugin(env.VITE_ONLYOFFICE_BRIDGE_URL)],
    build: {
      outDir: env.VITE_BUILD_OUT_DIR || 'dist',
    },
    server: {
      port: 4173,
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local-artifacts/**'],
      },
      proxy,
      watch: {
        ignored: ['**/.worktrees/**'],
      },
    },
    preview: {
      port: 4173,
      proxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/outputs/**', '**/infra/**', '**/.local-artifacts/**'],
      coverage: {
        reporter: ['text', 'html'],
      },
    },
  };
});
