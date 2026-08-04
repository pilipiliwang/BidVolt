import { http, HttpResponse } from 'msw';

import {
  calculatedQuoteFixture,
  documentBlockFixture,
  enterpriseAssetFixture,
  enterpriseAssetRevisionFixture,
  historyQueryFixture,
  insufficientQuoteFixture,
  projectMaterialFixture,
  projectSnapshotFixture,
  publicTaskEventFixture,
  requirementFixture,
  reviewProvidersFixture,
  reviewRunFixture,
  taskFixture,
} from './fixtures';

const apiPath = (path: string) => `*/api/v1${path}`;
const knownProjectId = projectMaterialFixture.project_id;

const success = <T>(data: T) => ({
  code: 'OK' as const,
  message: '',
  data,
  meta: { request_id: crypto.randomUUID() },
});

const resourceNotFound = () =>
  HttpResponse.json(
    {
      code: 'RESOURCE_NOT_FOUND',
      message: '资源不存在',
      request_id: crypto.randomUUID(),
      retryable: false,
    },
    { status: 404 },
  );

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

const versionConflict = (details: Record<string, unknown>) =>
  HttpResponse.json(
    {
      code: 'VERSION_CONFLICT',
      message: '资源已产生新版本，请刷新后重试',
      details,
      request_id: crypto.randomUUID(),
      retryable: false,
    },
    { status: 409 },
  );

const isKnownProject = (projectId: string | readonly string[] | undefined) =>
  String(projectId) === knownProjectId;

export const handlers = [
  http.get(apiPath('/enterprise-assets'), () =>
    HttpResponse.json(
      success({ items: [enterpriseAssetFixture], total: 1, page: 1, size: 20 }),
    ),
  ),

  http.get(apiPath('/enterprise-assets/:assetId'), ({ params }) => {
    if (String(params.assetId) !== enterpriseAssetFixture.asset_id) return resourceNotFound();
    return HttpResponse.json(success(enterpriseAssetFixture));
  }),

  http.get(apiPath('/enterprise-assets/:assetId/revisions'), ({ params }) => {
    if (String(params.assetId) !== enterpriseAssetFixture.asset_id) return resourceNotFound();
    return HttpResponse.json(success([enterpriseAssetRevisionFixture]));
  }),

  http.patch(
    apiPath('/enterprise-assets/:assetId/classification'),
    async ({ request, params }) => {
      if (String(params.assetId) !== enterpriseAssetFixture.asset_id) return resourceNotFound();
      if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
      const body = (await request.json()) as {
        category?: typeof enterpriseAssetFixture.category;
        expected_revision_id?: string;
      };
      if (body.expected_revision_id !== enterpriseAssetFixture.current_revision_id) {
        return versionConflict({ current_revision_id: enterpriseAssetFixture.current_revision_id });
      }
      return HttpResponse.json(
        success({
          ...enterpriseAssetFixture,
          category: body.category ?? enterpriseAssetFixture.category,
        }),
      );
    },
  ),

  http.patch(
    apiPath('/enterprise-assets/:assetId/facts/:factId'),
    async ({ request, params }) => {
      if (String(params.assetId) !== enterpriseAssetFixture.asset_id) return resourceNotFound();
      const fact = enterpriseAssetFixture.facts.find(
        (candidate) => candidate.fact_id === String(params.factId),
      );
      if (!fact) return resourceNotFound();
      if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
      const body = (await request.json()) as {
        value?: unknown;
        expected_revision_id?: string;
      };
      if (body.expected_revision_id !== enterpriseAssetFixture.current_revision_id) {
        return versionConflict({ current_revision_id: enterpriseAssetFixture.current_revision_id });
      }
      return HttpResponse.json(
        success({
          asset_id: enterpriseAssetFixture.asset_id,
          new_revision_id: 'ear_002',
          fact: { ...fact, value: body.value, status: 'corrected' },
        }),
      );
    },
  ),

  http.post(apiPath('/enterprise-assets/uploads'), async ({ request }) => {
    const form = await request.formData();
    if (form.has('target') || form.has('project_id')) return forbiddenScope();
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    return HttpResponse.json(
      success({
        task_id: 'enterprise_ingestion_001',
        asset_ids: [enterpriseAssetFixture.asset_id],
        status: 'queued',
      }),
      { status: 202 },
    );
  }),

  http.get(apiPath('/projects/:projectId/materials'), ({ params }) => {
    if (!isKnownProject(params.projectId)) return resourceNotFound();
    return HttpResponse.json(
      success({ items: [projectMaterialFixture], total: 1, page: 1, size: 20 }),
    );
  }),

  http.post(apiPath('/projects/:projectId/materials/uploads'), async ({ request, params }) => {
    if (!isKnownProject(params.projectId)) return resourceNotFound();
    const form = await request.formData();
    if (form.has('target') || form.has('enterprise_asset_id')) return forbiddenScope();
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    return HttpResponse.json(
      success({
        task_id: 'project_material_ingestion_001',
        project_id: knownProjectId,
        material_ids: [projectMaterialFixture.material_id],
        status: 'queued',
      }),
      { status: 202 },
    );
  }),

  http.get(
    apiPath('/project-materials/:materialId/revisions/:revisionId/blocks'),
    ({ params }) => {
      if (
        String(params.materialId) !== projectMaterialFixture.material_id ||
        String(params.revisionId) !== projectMaterialFixture.current_revision.revision_id
      ) {
        return resourceNotFound();
      }
      return HttpResponse.json(
        success({ items: [documentBlockFixture], total: 1, page: 1, size: 20 }),
      );
    },
  ),

  http.get(apiPath('/projects/:projectId/requirements'), ({ params }) => {
    if (!isKnownProject(params.projectId)) return resourceNotFound();
    return HttpResponse.json(success([requirementFixture]));
  }),

  http.patch(
    apiPath('/projects/:projectId/requirements/:requirementId'),
    async ({ request, params }) => {
      if (!isKnownProject(params.projectId)) return resourceNotFound();
      if (String(params.requirementId) !== requirementFixture.requirement_id) {
        return resourceNotFound();
      }
      if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
      const body = (await request.json()) as {
        action?: 'confirm' | 'update';
        expected_revision_id?: string;
        content?: string;
        structured?: Record<string, unknown>;
      };
      if (body.expected_revision_id !== requirementFixture.revision_id) {
        return versionConflict({ current_revision_id: requirementFixture.revision_id });
      }
      return HttpResponse.json(
        success({
          ...requirementFixture,
          revision_id: 'req_rev_002',
          content: body.action === 'update' ? (body.content ?? requirementFixture.content) : requirementFixture.content,
          structured:
            body.action === 'update'
              ? (body.structured ?? requirementFixture.structured)
              : requirementFixture.structured,
          status: body.action === 'update' ? 'corrected' : 'confirmed',
        }),
      );
    },
  ),

  http.get(apiPath('/projects/:projectId/snapshots'), ({ params }) => {
    if (!isKnownProject(params.projectId)) return resourceNotFound();
    return HttpResponse.json(
      success({ items: [projectSnapshotFixture], total: 1, page: 1, size: 20 }),
    );
  }),

  http.get(apiPath('/projects/:projectId/snapshots/:snapshotId'), ({ params }) => {
    if (
      !isKnownProject(params.projectId) ||
      String(params.snapshotId) !== projectSnapshotFixture.snapshot_id ||
      projectSnapshotFixture.project_id !== String(params.projectId)
    ) {
      return resourceNotFound();
    }
    return HttpResponse.json(success(projectSnapshotFixture));
  }),

  http.get(apiPath('/tasks/:taskId'), ({ params }) => {
    if (String(params.taskId) !== taskFixture.task_id) return resourceNotFound();
    return HttpResponse.json(success(taskFixture));
  }),

  http.get(apiPath('/tasks/:taskId/stream'), ({ params }) => {
    if (String(params.taskId) !== publicTaskEventFixture.task_id) return resourceNotFound();
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

  http.post(
    apiPath('/projects/:projectId/review-runs'),
    async ({ request, params }) => {
      if (!isKnownProject(params.projectId)) return resourceNotFound();
      if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
      const body = (await request.json()) as {
        provider_id?: string;
        project_snapshot_id?: string;
      };
      if (
        body.project_snapshot_id !== projectSnapshotFixture.snapshot_id ||
        projectSnapshotFixture.project_id !== String(params.projectId) ||
        !reviewProvidersFixture.some((provider) => provider.provider_id === body.provider_id)
      ) {
        return resourceNotFound();
      }
      return HttpResponse.json(
        success({
          review_run_id: reviewRunFixture.review_run_id,
          task_id: 'review_task_001',
          project_snapshot_id: projectSnapshotFixture.snapshot_id,
          status: 'queued',
        }),
        { status: 202 },
      );
    },
  ),

  http.get(apiPath('/review-runs/:reviewRunId'), ({ params }) => {
    if (String(params.reviewRunId) !== reviewRunFixture.review_run_id) {
      return resourceNotFound();
    }
    return HttpResponse.json(success(reviewRunFixture));
  }),

  http.get(apiPath('/quotes/history'), () => HttpResponse.json(success(historyQueryFixture))),

  http.get(apiPath('/quotes/history/:sampleId'), ({ params }) => {
    const sample = historyQueryFixture.samples.find(
      (item) => item.sample_id === String(params.sampleId),
    );
    return sample ? HttpResponse.json(success(sample)) : resourceNotFound();
  }),

  http.post(apiPath('/quotes/calculations'), async ({ request }) => {
    if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
    const body = (await request.json()) as {
      material_ref?: string;
      project_snapshot_id?: string;
    };
    if (body.project_snapshot_id !== projectSnapshotFixture.snapshot_id) {
      return resourceNotFound();
    }
    const result = body.material_ref?.includes('insufficient')
      ? insufficientQuoteFixture
      : calculatedQuoteFixture;
    return HttpResponse.json(success(result), { status: 201 });
  }),

  http.get(apiPath('/quotes/calculations/:calculationId'), ({ params }) => {
    const calculationId = String(params.calculationId);
    if (calculationId === calculatedQuoteFixture.calc_id) {
      return HttpResponse.json(success(calculatedQuoteFixture));
    }
    if (calculationId === insufficientQuoteFixture.calc_id) {
      return HttpResponse.json(success(insufficientQuoteFixture));
    }
    return resourceNotFound();
  }),

  http.post(
    apiPath('/quotes/calculations/:calculationId/apply'),
    async ({ request, params }) => {
      const calculationId = String(params.calculationId);
      if (
        calculationId !== calculatedQuoteFixture.calc_id &&
        calculationId !== insufficientQuoteFixture.calc_id
      ) {
        return resourceNotFound();
      }
      if (calculationId === insufficientQuoteFixture.calc_id) {
        return HttpResponse.json(
          {
            code: 'QUOTE_INSUFFICIENT_DATA',
            message: insufficientQuoteFixture.message,
            request_id: crypto.randomUUID(),
            retryable: false,
          },
          { status: 422 },
        );
      }
      if (!request.headers.get('Idempotency-Key')) return missingIdempotencyKey();
      const body = (await request.json()) as {
        expected_version_id?: string;
        confirmed?: boolean;
      };
      if (body.expected_version_id !== 'dv_quote_001' || body.confirmed !== true) {
        return versionConflict({ current_version_id: 'dv_quote_001' });
      }
      return HttpResponse.json(
        success({
          deliverable_id: 'deliverable_quote_001',
          new_version_id: 'dv_quote_002',
          audit_log_id: 'audit_quote_001',
        }),
        { status: 201 },
      );
    },
  ),
];
