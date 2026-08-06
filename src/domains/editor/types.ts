import type { DeliverableRouteId } from '../../app/router';

export type QuoteSheetRow = {
  id: string;
  code: string;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  tenderPrice: number;
  historyPrice: number;
  suggestedPrice: number;
  userPrice: number;
};

export type QuoteSheetWritableRow = Pick<
  QuoteSheetRow,
  | 'id'
  | 'code'
  | 'name'
  | 'specification'
  | 'quantity'
  | 'unit'
  | 'tenderPrice'
  | 'userPrice'
>;

export type OfficeMockSavePayload =
  | {
      kind: 'word';
      projectId: string;
      deliverableId: Exclude<DeliverableRouteId, 'quote'>;
      versionId: string;
      content: string;
    }
  | {
      kind: 'spreadsheet';
      projectId: string;
      deliverableId: 'quote';
      versionId: string;
      rows: QuoteSheetWritableRow[];
      total: number;
    };
