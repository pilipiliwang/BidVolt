/* global AbortSignal, console, fetch */

import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const readProxyTarget = () => {
  for (const filename of ['.env.backend.local', '.env.backend']) {
    if (!existsSync(filename)) continue;
    const match = readFileSync(filename, 'utf8')
      .match(/^VITE_API_PROXY_TARGET=(.+)$/m);
    if (match?.[1]) return match[1].trim().replace(/\/+$/, '');
  }
  return null;
};

const openApiUrl = process.env.BIDVOLT_OPENAPI_URL
  ?? `${readProxyTarget() ?? 'http://127.0.0.1:8123'}/openapi.json`;

const requiredOperations = [
  ['POST', '/api/v1/auth/login'],
  ['POST', '/api/v1/auth/register'],
  ['POST', '/api/v1/auth/refresh'],
  ['POST', '/api/v1/auth/logout'],
  ['GET', '/api/v1/auth/me'],
  ['GET', '/api/v1/projects'],
  ['POST', '/api/v1/projects'],
  ['GET', '/api/v1/projects/{project_id}'],
  ['POST', '/api/v1/projects/{project_id}/archive'],
  ['GET', '/api/v1/files'],
  ['POST', '/api/v1/files/upload'],
  ['POST', '/api/v1/files/archive'],
  ['GET', '/api/v1/enterprise/categories'],
  ['GET', '/api/v1/enterprise/assets'],
  ['GET', '/api/v1/enterprise/assets/{asset_id}'],
  ['GET', '/api/v1/enterprise/assets/{asset_id}/revisions'],
  ['GET', '/api/v1/enterprise/ingest'],
  ['POST', '/api/v1/enterprise/ingest'],
  ['PUT', '/api/v1/enterprise/facts/{fact_id}'],
  ['GET', '/api/v1/requirements'],
  ['GET', '/api/v1/projects/{project_id}/snapshots'],
  ['GET', '/api/v1/projects/{project_id}/snapshots/{snapshot_id}'],
  ['GET', '/api/v1/projects/{project_id}/tasks'],
  ['POST', '/api/v1/projects/{project_id}/tasks'],
  ['GET', '/api/v1/tasks/{task_id}'],
  ['GET', '/api/v1/tasks/{task_id}/stream'],
  ['GET', '/api/v1/deliverables'],
  ['GET', '/api/v1/deliverables/{deliverable_id}/versions'],
  ['GET', '/api/v1/deliverables/{deliverable_id}/versions/{version_no}'],
  ['GET', '/api/v1/deliverables/{deliverable_id}/versions/{version_no}/download'],
  ['GET', '/api/v1/review-providers'],
  ['POST', '/api/v1/projects/{project_id}/evaluate'],
  ['GET', '/api/v1/projects/{project_id}/scores'],
  ['GET', '/api/v1/projects/{project_id}/reviews'],
  ['GET', '/api/v1/projects/{project_id}/reviews/{run_id}'],
  ['PUT', '/api/v1/projects/{project_id}/scores/{score_id}/items/{item_id}/suggestion'],
  ['GET', '/api/v1/quotes/history'],
  ['GET', '/api/v1/quotes'],
  ['GET', '/api/v1/quotes/{calc_id}'],
  ['POST', '/api/v1/quotes/strategies'],
  ['POST', '/api/v1/quotes/apply'],
  ['GET', '/api/v1/projects/{project_id}/conversations'],
  ['POST', '/api/v1/projects/{project_id}/conversations'],
  ['POST', '/api/v1/projects/{project_id}/conversations/{conversation_id}/messages'],
  ['GET', '/api/v1/deliverables/{deliverable_id}/editor-sessions'],
  ['POST', '/api/v1/deliverables/{deliverable_id}/editor-sessions'],
  ['GET', '/api/v1/deliverables/{deliverable_id}/editor-sessions/{session_id}'],
  ['PUT', '/api/v1/deliverables/{deliverable_id}/editor-sessions/{session_id}/checkpoint'],
  ['POST', '/api/v1/deliverables/{deliverable_id}/editor-sessions/{session_id}/complete'],
  ['POST', '/api/v1/deliverables/{deliverable_id}/editor-sessions/{session_id}/cancel'],
];

const knownUnavailableOperations = [
  ['POST', '/api/v1/auth/forgot-password'],
  ['POST', '/api/v1/projects/{project_id}/tender-notices/import-url'],
  ['GET', '/api/v1/projects/{project_id}/tender-notices/imports'],
  ['GET', '/api/v1/projects/{project_id}/tender-notices/imports/{import_id}'],
  ['POST', '/api/v1/projects/{project_id}/requirements/{requirement_id}/confirm'],
  ['POST', '/api/v1/projects/{project_id}/completed-bids/uploads'],
  ['GET', '/api/v1/projects/{project_id}/completed-bids/summary'],
  ['GET', '/api/v1/projects/{project_id}/check/latest'],
  ['GET', '/api/v1/enterprise/assets/{asset_id}/revisions/{revision_id}'],
];

const response = await fetch(openApiUrl, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) {
  throw new Error(`读取后端 OpenAPI 失败：HTTP ${response.status} (${openApiUrl})`);
}

const document = await response.json();
const supports = ([method, path]) => Boolean(document.paths?.[path]?.[method.toLowerCase()]);
const label = ([method, path]) => `${method} ${path}`;
const missingRequired = requiredOperations.filter((operation) => !supports(operation));
const newlyAvailable = knownUnavailableOperations.filter(supports);

console.log(`OpenAPI: ${openApiUrl}`);
console.log(`已验证前端必需接口：${requiredOperations.length - missingRequired.length}/${requiredOperations.length}`);
console.log(`后端仍未提供的已知能力：${knownUnavailableOperations.length - newlyAvailable.length}/${knownUnavailableOperations.length}`);

if (missingRequired.length > 0) {
  console.error('\n缺少前端已接入的必需接口：');
  missingRequired.forEach((operation) => console.error(`- ${label(operation)}`));
}
if (newlyAvailable.length > 0) {
  console.error('\n以下接口已由后端提供，请更新前端“后端未提供”标记并完成接线：');
  newlyAvailable.forEach((operation) => console.error(`- ${label(operation)}`));
}
if (missingRequired.length > 0 || newlyAvailable.length > 0) process.exitCode = 1;
