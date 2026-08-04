import type {
  ReviewProvider as ApiReviewProvider,
  ReviewRun as ApiReviewRun,
} from '../api/review';
import type {
  ReviewFinding as ReviewFindingView,
  ReviewFindingOutcome as ReviewFindingOutcomeView,
  ReviewProvider as ReviewProviderView,
  ReviewProviderType as ReviewProviderTypeView,
  ReviewRunView,
} from '../../domains/review/types';
import { evidenceLocator, evidenceSourceLabel } from './evidence';
import { assertProjectScope } from './scope';
import {
  assertTrustedReviewEvidenceIndexScope,
  type TrustedReviewEvidenceIndex,
} from './trusted-review-evidence';

type ApiProviderType = ApiReviewProvider['type'];
type ApiProviderStatus = ApiReviewProvider['status'];
type ApiReviewFinding = ApiReviewRun['findings'][number];
type ApiReviewOutcome = ApiReviewFinding['outcome'];
type ApiReviewStatus = ApiReviewRun['status'];

const providerTypeMap = {
  api: 'api',
  sandbox_code: 'sandbox_code',
  rule_engine: 'rule_engine',
  document_rule: 'document_rule',
} satisfies Record<ApiProviderType, ReviewProviderTypeView>;

const providerAvailableMap = {
  available: true,
  degraded: false,
  unavailable: false,
} satisfies Record<ApiProviderStatus, boolean>;

const findingOutcomeMap = {
  pass: 'pass',
  fail: 'fail',
  risk: 'risk',
  unknown: 'unknown',
  abstain: 'abstain',
} satisfies Record<ApiReviewOutcome, ReviewFindingOutcomeView>;

const fallbackSuggestionMap = {
  pass: '无需处理',
  fail: '请人工复核并修正未通过项',
  risk: '请人工评估风险并决定是否调整',
  unknown: '当前信息不足，请补充材料后复核',
  abstain: '评审机制未给出结论，请人工复核',
} satisfies Record<ApiReviewOutcome, string>;

const reviewStatusMap = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  invalid_response: 'invalid_response',
  timed_out: 'timed_out',
} satisfies Record<ApiReviewStatus, ReviewRunView['status']>;

export function adaptReviewProvider(provider: ApiReviewProvider): ReviewProviderView {
  return {
    id: provider.provider_id,
    name: provider.name,
    type: providerTypeMap[provider.type],
    version: provider.version,
    description: provider.capabilities.join(' · '),
    available: providerAvailableMap[provider.status] && provider.can_execute,
  };
}

export function adaptReviewProviders(providers: readonly ApiReviewProvider[]): ReviewProviderView[] {
  return providers.map(adaptReviewProvider);
}

function adaptReviewFinding(
  finding: ApiReviewFinding,
  evidenceIndex: TrustedReviewEvidenceIndex,
): ReviewFindingView {
  const verifiedEvidence = finding.evidence_refs
    .map((evidence) => ({ evidence, source: evidenceIndex.lookup(evidence) }))
    .find((candidate) => candidate.source !== undefined);
  const unverifiedEvidence = finding.evidence_refs[0];

  const evidenceView: ReviewFindingView['evidence'] = verifiedEvidence
    ? {
        sourceLabel:
          verifiedEvidence.source?.displayLabel?.trim() ||
          evidenceSourceLabel(verifiedEvidence.evidence),
        locator: evidenceLocator(verifiedEvidence.evidence),
        exactQuote: verifiedEvidence.evidence.exact_quote,
        verification: 'verified',
      }
    : unverifiedEvidence
      ? {
          sourceLabel: '未验证证据',
          locator: '证据未通过冻结快照校验，引用内容与内部定位已隐藏',
          verification: 'hidden_unverified',
        }
      : {
          sourceLabel: '未提供证据',
          locator: '没有可展示的证据引用',
          verification: 'missing',
        };

  return {
    id: finding.finding_id,
    title: finding.message,
    outcome: findingOutcomeMap[finding.outcome],
    ruleVersion: finding.rule_version,
    confidence: finding.confidence ?? undefined,
    suggestion: finding.suggestion ?? fallbackSuggestionMap[finding.outcome],
    evidence: evidenceView,
  };
}

export function adaptReviewRun(
  run: ApiReviewRun,
  expectedProjectId: string,
  evidenceIndex: TrustedReviewEvidenceIndex,
): ReviewRunView {
  assertProjectScope(expectedProjectId, run.project_id);
  assertTrustedReviewEvidenceIndexScope(
    evidenceIndex,
    expectedProjectId,
    run.project_snapshot_id,
  );

  return {
    id: run.review_run_id,
    status: reviewStatusMap[run.status],
    projectSnapshotId: run.project_snapshot_id,
    deliverableVersions: [...run.deliverable_version_ids],
    providerId: run.provider_id,
    providerVersion: run.provider_version,
    finishedAt: run.finished_at ?? undefined,
    findings: run.findings.map((finding) => adaptReviewFinding(finding, evidenceIndex)),
  };
}
