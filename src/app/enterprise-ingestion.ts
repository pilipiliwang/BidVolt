import type { EnterpriseIngestionItem } from '../features/enterprise-assets';
import type { EnterpriseIngestion } from '../shared/backend-api';

/** Map backend state literally: 1=classification, 2=waiting for user review, 3=completed. */
export function adaptEnterpriseIngestion(item: EnterpriseIngestion): EnterpriseIngestionItem {
  const status: EnterpriseIngestionItem['status'] = item.status === 3
    ? 'completed'
    : item.status >= 4
      ? 'failed'
      : item.status === 2
        ? 'pending_confirmation'
        : item.status === 1
          ? 'classifying'
          : 'queued';
  return {
    id: String(item.ingest_id),
    name: `资料归类任务 #${item.ingest_id}`,
    status,
    progress: status === 'completed' ? 100 : undefined,
  };
}
