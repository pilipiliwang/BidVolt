import type { DeliverableRouteId } from '../../app/router';
import type { QuoteSheetRow } from './types';

export type MockDeliverableDefinition = {
  id: DeliverableRouteId;
  label: string;
  title: string;
  versionId: string;
  editorKind: 'word' | 'spreadsheet';
  downloadHref: string;
  downloadLabel: string;
};

export const mockDeliverables: Record<DeliverableRouteId, MockDeliverableDefinition> = {
  technical: {
    id: 'technical',
    label: '技术标',
    title: '技术标文件',
    versionId: 'technical-v6',
    editorKind: 'word',
    downloadHref: '/mock-files/技术标文件-Mock.docx',
    downloadLabel: '下载技术标 Mock Word',
  },
  business: {
    id: 'business',
    label: '商务标',
    title: '商务标文件',
    versionId: 'business-v8',
    editorKind: 'word',
    downloadHref: '/mock-files/商务标文件-Mock.docx',
    downloadLabel: '下载商务标 Mock Word',
  },
  quote: {
    id: 'quote',
    label: '报价单',
    title: '报价单',
    versionId: 'quote-v4',
    editorKind: 'spreadsheet',
    downloadHref: '/mock-files/报价单-Mock.xlsx',
    downloadLabel: '下载报价单 Mock Excel',
  },
};

export const initialQuoteRows: QuoteSheetRow[] = [
  { id: 'row-1', code: '10KV-DZ-001', name: '高压断路器', specification: 'ZN63A-12 (1250A)', quantity: 3, unit: '台', tenderPrice: 15600, historyPrice: 14850, suggestedPrice: 14680, userPrice: 14600 },
  { id: 'row-2', code: '10KV-DZ-002', name: '隔离开关', specification: 'GN19-12', quantity: 6, unit: '台', tenderPrice: 2480, historyPrice: 2180, suggestedPrice: 2120, userPrice: 2100 },
  { id: 'row-3', code: '10KV-DZ-003', name: '电流互感器', specification: 'LZZBJ9-12 (150/5)', quantity: 9, unit: '台', tenderPrice: 860, historyPrice: 780, suggestedPrice: 760, userPrice: 750 },
  { id: 'row-4', code: '10KV-DZ-004', name: '电压互感器', specification: 'JDZJ-10', quantity: 9, unit: '台', tenderPrice: 520, historyPrice: 470, suggestedPrice: 460, userPrice: 450 },
  { id: 'row-5', code: '10KV-DZ-005', name: '避雷器', specification: 'HYSWS-17/50', quantity: 6, unit: '组', tenderPrice: 320, historyPrice: 290, suggestedPrice: 280, userPrice: 280 },
  { id: 'row-6', code: '10KV-DZ-006', name: '开关柜', specification: 'KYN28A-12', quantity: 4, unit: '面', tenderPrice: 32000, historyPrice: 30800, suggestedPrice: 30200, userPrice: 30000 },
  { id: 'row-7', code: '10KV-DZ-007', name: '变压器', specification: 'SCB11-1600/10', quantity: 2, unit: '台', tenderPrice: 63000, historyPrice: 60500, suggestedPrice: 59200, userPrice: 58800 },
  { id: 'row-8', code: '10KV-DZ-008', name: '电缆（交联）', specification: 'YJV22-3×240', quantity: 120, unit: '米', tenderPrice: 280, historyPrice: 250, suggestedPrice: 240, userPrice: 245 },
];

export function quoteTotal(rows: readonly QuoteSheetRow[]) {
  return rows.reduce((total, row) => total + row.quantity * row.userPrice, 0);
}
