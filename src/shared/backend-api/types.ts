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
export type ProjectResponse = {
  project_id: number; name: string; tender_no: string | null; deadline: string | null;
  status: number; note: string | null; updated_at: string;
};
export type ProjectWrite = {
  name?: string; tender_no?: string | null; deadline?: string | null; note?: string | null;
};
export type BackendFile = {
  file_id: number; name: string; size: number; mime: string; status: number; sha256?: string;
  category?: string | null; project_id?: number | null;
};
export type FailedUpload = { name: string | null; error: string };
export type UploadResult = { files: Array<BackendFile | FailedUpload> };
export type FileParseStatus = { status: number; category: string | null; parse_status: number | null };
export type FileBlock = {
  block_id: number; block_type: string; page_no: number | null; block_index: number; text: string | null;
};
export type ProjectMaterial = { material_id: number; file_id: number; status: number };

export type TenderNoticeImportJob = {
  import_id: number | string;
  project_id: number;
  source_url: string;
  status: 'queued' | 'fetching' | 'parsing' | 'succeeded' | 'failed';
  task_id?: number | null;
  file_ids?: number[];
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EnterpriseCategory = { category_id: number; name: string; parent_id: number | null };
export type EnterpriseAsset = {
  asset_id: number; name: string; asset_type: string | null; category_id: number | null;
  status: number; source_file_id: number | null;
};
export type EnterpriseFact = {
  fact_id: number; fact_key: string; fact_value: JsonValue; confidence: number | null; status: number;
};
export type EnterpriseAssetDetail = EnterpriseAsset & { facts: EnterpriseFact[] };
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
  name: string; enabled: boolean;
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
export type ReviewRunRequest = { provider_id?: BackendId };

export type ScoreSummary = {
  score_id: number;
  review_run_id: number | null;
  total_score: number | null;
  missing_count: number;
  improvable: number | null;
  detail: JsonObject | null;
};

export type Conversation = { conversation_id: number; title: string; created_at?: string | null };
export type ChatMessage = {
  message_id: number; role: string; content: string; source_task_id: number | null; created_at: string | null;
};
