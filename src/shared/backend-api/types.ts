export type BackendId = number | string;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export type TokenPair = {
  user_id: number; enterprise_id: number; access_token: string; refresh_token: string; token_type: string;
};
export type MeResponse = {
  user_id: number; email: string; enterprise_id: number; enterprise_name: string; permissions: string[];
};
export type ProjectSummaryResponse = {
  material_count: number;
  deliverable_count: number;
  review_run_count: number;
  latest_total_score: number | null;
  missing_count: number | null;
  risk_level: number | null;
};
export type ProjectResponse = {
  project_id: number; name: string; tender_no: string | null; buyer: string | null;
  deadline: string | null; status: number; note: string | null; updated_at: string;
  summary: ProjectSummaryResponse | null;
};
export type ProjectWrite = {
  name?: string; tender_no?: string | null; buyer?: string | null;
  deadline?: string | null; note?: string | null;
};
export type BackendFile = {
  file_id: number; name: string; size: number; mime?: string | null; status?: number; sha256?: string;
  category?: string | null; project_id?: number | null;
  document_role?: string | null; purpose?: string | null; parse_status?: JsonObject | null;
  /** Upload-only receipt fields. Duplicate receipts may omit mime/status at runtime. */
  duplicate?: boolean; message?: string; asset_id?: number | null; auto_ingest?: boolean;
  facts_extracted?: number; expanded?: ArchiveExpansion;
};
export type ArchiveExpansion = {
  imported?: number; failed?: number; duplicates?: number; error?: string;
};
export type FailedUpload = { name: string | null; error: string };
export type UploadResult = { files: Array<BackendFile | FailedUpload> };
export type FileParseStatus = { status: number; category: string | null; parse_status: JsonObject | null };
export type FileBlock = {
  block_id: number; block_type: string; page_no: number | null; block_index: number; text: string | null;
  extra?: JsonValue | null;
};
export type ProjectMaterial = {
  material_id: number; file_id: number; file_name: string | null; ext: string | null; status: number;
  parse_status: JsonObject | null; block_count: number; block_stats: Record<string, number>;
  media_count: number; image_count: number; image_described_count: number;
  source_archive_id: number | null; source_archive_name: string | null; archive_path: string | null;
  expanded_count: number;
};
export type ImageDescribeProgress = {
  queued: number; running: number; done: number; failed_terminal: number; remaining: number;
  described_images: number;
};
export type ImageDescriptionPayload = {
  doc_type?: string; subject?: string | null; numbers?: string[]; dates?: string[];
  amounts?: string[]; people?: string[]; stamps?: string[]; text_summary?: string;
  is_scan?: boolean;
  /** Second-pass high-resolution readings for identifier-dense documents. */
  numbers_verified?: string[];
  /** First-pass readings retained for side-by-side verification. */
  numbers_pass1?: string[];
  /** Readings that disagree between passes and must not be silently selected. */
  numbers_conflict?: string[];
  verify_mode?: 'vl_high_res' | 'pillow_tiles' | string;
  raw?: boolean;
  [key: string]: JsonValue | undefined;
};
export type FileImageDescription = {
  ordinal: number; page: number | null; sha256: string; described: boolean;
  description: ImageDescriptionPayload | null;
};
export type FileImageDescriptions = {
  file_id: number; image_count: number; described_count: number; items: FileImageDescription[];
};

export type TenderNoticeStatus = 1 | 2 | 3;
export type TenderNoticeImportJob = {
  tender_notice_id: number;
  project_id: number;
  source_url: string;
  title: string | null;
  status: TenderNoticeStatus;
  file_id: number | null;
  error_code: string | null;
  error_message: string | null;
  imported_at: string | null;
  created_at?: string | null;
  _error?: boolean;
};

export type EnterpriseCategory = { category_id: number; name: string; parent_id: number | null };
export type EnterpriseAsset = {
  asset_id: number; name: string; asset_type: string | null; category_id: number | null;
  status: number; source_file_id: number | null; image_described?: boolean;
  /** Newer deployments may expose lifecycle timestamps on both list and detail responses. */
  created_at?: string | null; updated_at?: string | null;
};
export type EnterpriseFact = {
  fact_id: number; fact_key: string; fact_value: JsonValue; confidence: number | null; status: number;
};
export type EnterpriseAssetDetail = EnterpriseAsset & {
  image_description?: ImageDescriptionPayload | null; facts: EnterpriseFact[];
};
export type EnterpriseAssetRevision = {
  revision_id: number; revision_no: number; file_id: number | null; sha256: string | null;
  source_location: JsonValue | null; created_by: number | null; created_at: string | null;
};
export type EnterpriseIngestion = {
  ingest_id: number; task_id: number; asset_ids: number[]; status: number; created_at: string | null;
};

export type Requirement = {
  req_id: number; req_type: string; req_key: string | null; content: string; structured: JsonValue | null;
  coordinates: JsonValue | null; confidence: number | null; revision: number; source_file_id: number | null;
  supersedes?: number | null;
  confirm_status?: 'unconfirmed' | 'confirmed' | 'rejected' | string | null;
  confirmed_at?: string | null;
};
export type ConfirmRequirementRequest = { expected_revision: number; confirmed?: boolean };
export type CorrectRequirementRequest = {
  expected_revision: number; content: string; coordinates?: JsonValue[] | null;
  confidence?: number | null; structured?: JsonObject | null;
};
export type SnapshotSummary = {
  snapshot_id: number; snapshot_type: string; created_at: string | null;
  input_refs: JsonObject; rules_version: JsonObject;
};
export type SnapshotDetail = SnapshotSummary & { external_samples: JsonObject; manifest: JsonObject };

export type TaskProgress = JsonObject;
export type BackendTask = {
  task_id: number; task_type: string; status: number; retry_count: number; result?: JsonValue | null;
  error?: JsonValue | null; progress: TaskProgress; idempotency_key?: string; created_at?: string | null;
};
export type CreatedTask = {
  task_id: number; status: number; created: boolean; progress: TaskProgress; capability_token: string;
};

export type AgentRunProgress = {
  phase?: string; status?: string; percent?: number; current_work?: string; summary?: string; hint?: string;
  [key: string]: JsonValue | undefined;
};
export type AgentQuestionItem = { q: string; need?: string; checked?: string };
export type AgentCustomerAsk = {
  ask_id: number | null; kind: 'question' | 'action'; items: Array<AgentQuestionItem | string>;
  answered: boolean; answer: string | string[] | null; created_at: string | null;
  window_minutes?: number | null; timeout_notified?: boolean | null; legacy?: boolean;
};
export type AgentCustomerState = { asks?: AgentCustomerAsk[]; action_list?: string[] };
export type AgentRunResult = {
  runtime?: string; session_id?: string | null; outcome?: string; reason?: string;
  note?: string; action_list?: string[]; customer_asks?: AgentCustomerAsk[];
  [key: string]: unknown;
};
export type AgentRunStartRequest = {
  idempotency_key: string; payload?: JsonObject; model?: string; provider?: string;
  resume_from_task_id?: number;
};
export type AgentRunCreated = {
  task_id: number; status: number; created: boolean; resume_from_task_id: number | null;
  resume_session_id: string | null; progress: AgentRunProgress; capability_token: string;
};
export type AgentRunStatus = {
  task_id: number; task_type: string; status: number; progress: AgentRunProgress;
  result: AgentRunResult; error: JsonValue | null; customer: AgentCustomerState;
};
export type AgentCreateAskRequest = {
  kind?: 'question' | 'action'; items: Array<AgentQuestionItem | string>; window_minutes?: number;
};
export type AgentCreateAskResponse = {
  ask_id: number; kind: 'question' | 'action'; recorded: number; window_minutes: number; message: string;
};
export type AgentAnswerResponse = {
  ask_id: number; answered: boolean; queued: boolean; reply: string | null;
};
export type AgentChatResponse = {
  queued?: boolean; mode?: 'queue' | 'steer'; reply: string | null; session_id: string | null;
  returncode?: number; message?: string;
};

export type Deliverable = {
  deliverable_id: number; project_id?: number; deliverable_type: number; title: string;
  current_version_no?: number; stat?: JsonValue | null;
};
export type DeliverableVersion = {
  version_no: number; version_type: number; milestone: boolean; created_by: number | null;
  source_task_id: number | null; created_at: string | null;
};
export type DeliverableContent = {
  deliverable_id?: number; deliverable_type?: number; version_no: number; version_type?: number; model: JsonObject;
};

export type ReviewProvider = {
  provider_id: number; provider_code: string; provider_type: string; provider_version: string;
  name: string; enabled?: boolean;
};
export type ReviewRun = {
  run_id: number; provider_id: number | null; snapshot_id: number | null; status: number;
  provider_raw_hash: string | null; created_at: string | null;
};
export type ReviewItem = {
  item_id: number; category: string; problem_description: string; got: number | null; full: number | null;
  improvable: number | null; risk_level: string | null; suggestion: string | null;
  suggestion_override: string | null; effective_suggestion: string | null; action_type: string | null;
  evidence: JsonValue | null; status: number; confidence?: number | null; ruleset_version?: string | null;
};
export type ReviewRunDetail = {
  run_id: number; status: number; snapshot_id: number | null; provider: ReviewProvider | null;
  score: JsonObject | null; items: ReviewItem[];
};
export type ReviewRunRequest = { provider_id?: number };

export type ReviewConfirmAction = 'confirm' | 'reject';
export type ReviewItemMutationStatus = 'succeeded' | 'skipped' | 'conflict';
export type ReviewItemMutationResult = {
  item_id: number;
  status: ReviewItemMutationStatus;
  reason?: string;
};
export type ReviewItemConfirmRequest = {
  action: ReviewConfirmAction;
  expected_version?: BackendId;
};
export type ReviewItemBatchConfirmRequest = ReviewItemConfirmRequest & {
  item_ids: number[];
};
export type ReviewItemBatchConfirmResponse = { results: ReviewItemMutationResult[] };
export type ReviewReEvaluateResponse = {
  run_id: number;
  score_id: number;
  total_score: number;
  new_item_ids: number[];
  improved_count: number;
};

export type ScoreSummary = {
  score_id: number;
  review_run_id: number | null;
  snapshot_id: number | null;
  total_score: number | null;
  missing_count: number;
  improvable: number | null;
  detail: JsonObject | null;
  scale: string; full_marks: number | null; got_marks: number | null;
  /** Legacy deployments may still attach freshness metadata. */
  is_stale?: boolean; stale_reasons?: string[];
};

export type QuoteHistoryScope = 'all' | 'public' | 'private';
export type QuoteHistoryQuery = {
  category?: string; publisher?: string; price_mode?: string; scope?: QuoteHistoryScope; limit?: number;
};
export type QuoteHistoryLibrarySample = {
  source: 'public' | 'private'; publisher: string | null; category: string | null;
  package_name: string | null; price_mode: string | null; limit_price: string | null;
  win_price: string; publish_date: string | null; notice_id: string | null;
  limit_evidence: string | null; win_evidence: string | null;
  limit_evidence_url: string | null; win_evidence_url: string | null; win_ratio: string | null;
};
export type QuoteHistoryResponse = {
  sample_count: number; samples: QuoteHistoryLibrarySample[];
  stats: Array<{ price_mode: string; count: number; win_price_range: [string, string] }>;
  readonly: boolean;
};
export type QuoteHistoryImportResponse = {
  imported: number; skipped: number; scope: 'public' | 'private'; parsed_total: number;
  skipped_rows: number; skipped_reasons: JsonValue[];
};
export type QuoteHistorySample = {
  sample_id?: number; provider_id?: string; material_ref?: string; material_name: string;
  material_code?: string | null; spec: string | null; region: string | null; win_price: string | number;
  win_date: string; source_hash?: string | null; fetched_at?: string | null;
  price_mode?: string | null; limit_price?: string | null; source_url?: string;
  scope?: 'public' | 'private'; unit?: string; currency?: string; tax_included?: boolean;
};
export type QuoteTrend = {
  material_ref: string; sample_count: number; min_price: string | number | null;
  max_price: string | number | null; avg_price: string | number | null;
  median_price: string | number | null; latest_price: string | number | null;
  latest_date: string | null; region_breakdown: Record<string, { count: number; avg: number }>;
  readonly: boolean;
};
export type QuoteAiSuggestion = {
  unavailable?: boolean; message?: string; price_range?: [string, string]; reasons?: string[];
  assumptions?: string[]; confidence?: string; risk_level?: string; is_ai_suggest?: boolean;
};
export type QuoteSourceMetadata = {
  provider_id: string; source_name: string; fetched_at: string; coverage: string;
  update_policy: string; readonly_verified: boolean;
};
export type QuoteCalculationListItem = {
  calc_id: number; project_id: number; params: JsonObject; result: JsonObject; status: number;
  applied_version_no: number | null; has_strategy: boolean; has_ai_suggest: boolean;
  sample_count: number; created_at: string | null;
};
export type QuoteCalculationDetail = {
  calc_id: number; project_id: number; params: JsonObject; result: JsonObject;
  strategy_results: JsonObject; ai_suggest: QuoteAiSuggestion | null; status: number;
  applied_version_no: number | null; applied_at: string | null; created_at: string | null;
  samples: QuoteHistorySample[];
};

export type FinalCheckResult = {
  check_id: number; passed: boolean; issues: JsonObject[];
  stats?: {
    requirements: number; structure: number; deliverables: number; error_count: number;
    warning_count: number; words: JsonObject; pending: JsonObject;
  };
};
export type ProjectExportFile = {
  name: string; bucket: string; object_key: string; sha256: string; size: number;
};
export type ProjectExportJob = { job_id: number; status: number; files: ProjectExportFile[] };

export type Conversation = { conversation_id: number; title: string; created_at?: string | null };
export type ChatMessage = {
  message_id: number; role: string; content: string; source_task_id: number | null; created_at: string | null;
};
