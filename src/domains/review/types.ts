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
  title: string;
  outcome: ReviewFindingOutcome;
  ruleVersion: string;
  confidence?: number;
  suggestion: string;
  evidence: {
    sourceLabel: string;
    locator: string;
    exactQuote?: string;
    verification: ReviewEvidenceVerification;
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
};
