export type ReviewProviderType = 'api' | 'sandbox_code' | 'rule_engine' | 'document_rule';

export type ReviewProvider = {
  id: string;
  name: string;
  type: ReviewProviderType;
  version: string;
  description: string;
  available: boolean;
};

export type ReviewFindingOutcome = 'risk' | 'pass' | 'unknown';

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
  };
};

export type ReviewRunView = {
  id: string;
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
  projectSnapshotId: string;
  deliverableVersions: string[];
  providerId?: string;
  providerVersion?: string;
  finishedAt?: string;
  findings: ReviewFinding[];
};
