export type PublicTaskEvent = {
  schema_version: string;
  event_id: string;
  sequence: number;
  task_id: string;
  task_type?: string;
  project_id: string;
  phase: string;
  status:
    | 'queued'
    | 'running'
    | 'retrying'
    | 'waiting_user'
    | 'cancel_requested'
    | 'cancelled'
    | 'succeeded'
    | 'failed'
    | 'unknown';
  percent: number | null;
  public_message: string;
  error_code: string | null;
  occurred_at: string;
  result_refs?: {
    deliverable_ids?: string[];
    requirement_revision_ids?: string[];
    review_run_id?: string;
    quote_calculation_id?: string;
    check_id?: string;
    export_job_id?: string;
  };
};
