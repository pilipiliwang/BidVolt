import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['scripts/office-download-plugin.spec.node.ts'], setupFiles: [] },
});
