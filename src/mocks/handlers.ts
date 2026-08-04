import { http, HttpResponse } from 'msw';

import {
  calculatedQuoteFixture,
  documentBlockFixture,
  enterpriseAssetFixture,
  enterpriseAssetRevisionFixture,
  historyQueryFixture,
  insufficientQuoteFixture,
  projectMaterialFixture,
  publicTaskEventFixture,
  requirementFixture,
  reviewProvidersFixture,
  reviewRunFixture,
  taskFixture,
} from './fixtures';

const apiPath = (path: string) => `*/api/v1${path}`;
const success = <T>(data: T) => ({
  code: 'OK' as const,
  message: '',
  data,
  meta: { request_id: crypto.randomUUID() },
});

const forbiddenScope = () =>
  HttpResponse.json(
    {
      code: 'PERMISSION_DENIED',
      message: '上传入口决定资料归属，禁止通过 target 改变数据域',
      request_id: crypto.randomUUID(),
      retryable: false,
    },
    { status: 422 },
  );

const missingIdempotencyKey = () =>
  HttpResponse.json(
    {
      code: 'IDEMPOTENCY_CONFLICT',
      message: '写接口必须携带 Idempotency-Key',
      request_id: crypto.randomUUID(),
      retryable: false,
    },
    { status: 409 },
  );

export const handlers = [
  http.get(apiPath('/enterprise-assets'), () =>
    HttpResponse.json(
      success({ items: [enterpriseAssetFixture], total: 1, page: 1, size: 20 }),
    ),
  ),

  http.get(apiPath('/enterprise-assets/:assetId'), () =>
    HttpResponse.json(success(enterpriseAssetFixture)),
  ),

  http.get(apiPath('/enterprise-assets/:assetId/revisions'), () =>
    HttpResponse.json(success([enterpriseAssetRevisionFixture])),
  ),

  http.patch(apiPath('/enterprise-assets/:assetId/classification'), async ({ request }) => {
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    const body = (await request.json()) as {
      category?: typeof enterpriseAssetFixture.category;
      expected_revision_id?: string;
    };
    if (body.expected_revision_id !== enterpriseAssetFixture.current_revision_id) {
      return HttpResponse.json(
        {
          code: 'VERSION_CONFLICT',
          message: '企业资料已产生新版本，请刷新后重试',
          details: { current_revision_id: enterpriseAssetFixture.current_revision_id },
          request_id: crypto.randomUUID(),
          retryable: false,
        },
        { status: 409 },
      );
    }
    return HttpResponse.json(
      success({ ...enterpriseAssetFixture, category: body.category ?? enterpriseAssetFixture.category }),
    );
  }),

  http.post(apiPath('/enterprise-assets/uploads'), async ({ request }) => {
    const form = await request.formData();
    if (form.has('target') || form.has('project_id')) return forbiddenScope();
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    return HttpResponse.json(
      success({
        task_id: 'enterprise_ingestion_001',
        asset_ids: ['asset_001'],
        status: 'queued',
      }),
      { status: 202 },
    );
  }),

  http.get(apiPath('/projects/:projectId/materials'), ({ params }) =>
    HttpResponse.json(
      success({
        items:
          params.projectId === projectMaterialFixture.project_id ? [projectMaterialFixture] : [],
        total: params.projectId === projectMaterialFixture.project_id ? 1 : 0,
        page: 1,
        size: 20,
      }),
    ),
  ),

  http.post(apiPath('/projects/:projectId/materials/uploads'), async ({ request, params }) => {
    const form = await request.formData();
    if (form.has('target') || form.has('enterprise_asset_id')) return forbiddenScope();
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    return HttpResponse.json(
      success({
        task_id: 'project_material_ingestion_001',
        project_id: String(params.projectId),
        material_ids: ['material_001'],
        status: 'queued',
      }),
      { status: 202 },
    );
  }),

  http.get(
    apiPath('/project-materials/:materialId/revisions/:revisionId/blocks'),
    () =>
      HttpResponse.json(
        success({ items: [documentBlockFixture], total: 1, page: 1, size: 20 }),
      ),
  ),

  http.get(apiPath('/projects/:projectId/requirements'), ({ params }) =>
    HttpResponse.json(
      success(params.projectId === requirementFixture.project_id ? [requirementFixture] : []),
    ),
  ),

  http.get(apiPath('/tasks/:taskId'), ({ params }) =>
    HttpResponse.json(
      success({ ...taskFixture, task_id: String(params.taskId) }),
    ),
  ),

  http.get(apiPath('/tasks/:taskId/stream'), () => {
    const body = [
      'event: task.progress',
      `id: ${publicTaskEventFixture.event_id}`,
      `data: ${JSON.stringify(publicTaskEventFixture)}`,
      '',
      '',
    ].join('\n');
    return new HttpResponse(body, {
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      },
    });
  }),

  http.get(apiPath('/review-providers'), () =>
    HttpResponse.json(success(reviewProvidersFixture)),
  ),

  http.post(apiPath('/projects/:projectId/review-runs'), async ({ request }) => {
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      success({
        review_run_id: 'review_run_001',
        task_id: 'review_task_001',
        project_snapshot_id: String(body.project_snapshot_id),
        status: 'queued',
      }),
      { status: 202 },
    );
  }),

  http.get(apiPath('/review-runs/:reviewRunId'), () =>
    HttpResponse.json(success(reviewRunFixture)),
  ),

  http.get(apiPath('/quotes/history'), () => HttpResponse.json(success(historyQueryFixture))),

  http.get(apiPath('/quotes/history/:sampleId'), ({ params }) => {
    const sample = historyQueryFixture.samples.find((item) => item.sample_id === params.sampleId);
    if (!sample) {
      return HttpResponse.json(
        {
          code: 'RESOURCE_NOT_FOUND',
          message: '历史报价样本不存在',
          request_id: crypto.randomUUID(),
          retryable: false,
        },
        { status: 404 },
      );
    }
    return HttpResponse.json(success(sample));
  }),

  http.post(apiPath('/quotes/calculations'), async ({ request }) => {
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    const body = (await request.json()) as { material_ref?: string };
    const result = body.material_ref?.includes('insufficient')
      ? insufficientQuoteFixture
      : calculatedQuoteFixture;
    return HttpResponse.json(success(result), { status: 201 });
  }),

  http.get(apiPath('/quotes/calculations/:calculationId'), ({ params }) =>
    HttpResponse.json(
      success(
        params.calculationId === insufficientQuoteFixture.calc_id
          ? insufficientQuoteFixture
          : calculatedQuoteFixture,
      ),
    ),
  ),

  http.post(apiPath('/quotes/calculations/:calculationId/apply'), async ({ request }) => {
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    const body = (await request.json()) as { expected_version_id?: string; confirmed?: boolean };
    if (!body.expected_version_id || body.confirmed !== true) {
      return HttpResponse.json(
        {
          code: 'VERSION_CONFLICT',
          message: '应用报价必须确认并指定 expected_version_id',
          request_id: crypto.randomUUID(),
          retryable: false,
        },
        { status: 409 },
      );
    }
    return HttpResponse.json(
      success({
        deliverable_id: 'deliverable_quote_001',
        new_version_id: 'dv_quote_002',
        audit_log_id: 'audit_quote_001',
      }),
      { status: 201 },
    );
  }),
];
