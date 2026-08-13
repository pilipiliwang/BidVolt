export type ReviewProviderType = 'api' | 'sandbox_code' | 'rule_engine' | 'document_rule';

export type ReviewProvider = {
  id: string;
  name: string;
  type: ReviewProviderType;
  version: string;
  description: string;
  available: boolean;
};

export type ReviewFindingOutcome = 'fail' | 'risk' | 'pass' | 'unknown' | 'abstain';

export type ReviewEvidenceVerification = 'verified' | 'hidden_unverified' | 'missing';

export type ReviewFinding = {
  id: string;
  category?: string;
  title: string;
  outcome: ReviewFindingOutcome;
  ruleVersion: string;
  confidence?: number;
  currentScore?: number;
  fullScore?: number;
  improvableScore?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  suggestion: string;
  evidence: {
    sourceLabel: string;
    locator: string;
    exactQuote?: string;
    verification: ReviewEvidenceVerification;
  };
};

export type ReviewValidatedSummary = {
  totalFindingCount: number;
  categoryCounts: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  currentScore: number;
  predictedScore?: number;
  totalLift: number;
  sectionLifts?: {
    business?: number;
    technical?: number;
    pricing?: number;
  };
};

export type ReviewRunView = {
  id: string;
  status:
    | 'idle'
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'invalid_response'
    | 'timed_out';
  projectSnapshotId: string;
  deliverableVersions: string[];
  providerId?: string;
  providerVersion?: string;
  /** Audit-only metadata. Normal user interfaces must not render this value. */
  responseHash?: string;
  finishedAt?: string;
  findings: ReviewFinding[];
  /** Provider/backend-validated aggregate values; never infer these from UI placeholders. */
  validatedSummary?: ReviewValidatedSummary;
};
