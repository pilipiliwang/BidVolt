import { Download, Redo2, Save, Sigma, Sparkles, Undo2 } from 'lucide-react';

import type { QuoteSheetRow } from './types';

type SpreadsheetMockEditorProps = {
  downloadHref: string;
  downloadLabel: string;
  onRowsChange: (rows: QuoteSheetRow[]) => void;
  onSave: () => void;
  rows: QuoteSheetRow[];
};

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SpreadsheetMockEditor({
  downloadHref,
  downloadLabel,
  onRowsChange,
  onSave,
  rows,
}: SpreadsheetMockEditorProps) {
  const updateUserPrice = (rowId: string, rawValue: string) => {
    const value = Number(rawValue);
    onRowsChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, userPrice: Number.isFinite(value) && value >= 0 ? value : 0 }
          : row,
      ),
    );
  };

  return (
    <div className="office-sheet-editor">
      <div className="office-editor-toolbar" role="toolbar" aria-label="Mock Excel 编辑工具栏">
        <button aria-label="撤销" type="button"><Undo2 aria-hidden="true" size={17} /></button>
        <button aria-label="重做" type="button"><Redo2 aria-hidden="true" size={17} /></button>
        <select aria-label="字体" defaultValue="思源黑体"><option>思源黑体</option><option>宋体</option></select>
        <select aria-label="字号" defaultValue="11"><option>10</option><option>11</option><option>12</option></select>
        <button aria-label="自动求和" type="button"><Sigma aria-hidden="true" size={17} /></button>
        <button className="office-editor-toolbar__ai" title="演示按钮：不会自动修改冻结成果" type="button">
          <Sparkles aria-hidden="true" size={16} /> AI针对性修改
        </button>
        <a download href={downloadHref} aria-label={downloadLabel}><Download aria-hidden="true" size={16} /> 导出Excel</a>
        <button className="office-editor-toolbar__save" type="button" onClick={onSave}>
          <Save aria-hidden="true" size={16} /> 保存演示修改
        </button>
      </div>

      <div className="office-sheet-stage" role="region" aria-label="报价明细表">
        <table className="office-sheet-grid">
          <thead>
            <tr className="office-sheet-grid__letters"><th aria-hidden="true" /><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>G</th><th>H</th><th>I</th><th>J</th></tr>
            <tr><th aria-label="行号">1</th><th>物料编码</th><th>物料名称</th><th>规格型号</th><th>数量</th><th>单位</th><th>招标限价（元）</th><th>历史中标价（元）</th><th>AI建议单价（元）</th><th>用户报价（元）</th><th>合价（元）</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <th scope="row">{index + 2}</th>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.specification}</td>
                <td>{row.quantity}</td>
                <td>{row.unit}</td>
                <td>{numberFormatter.format(row.tenderPrice)}</td>
                <td>{numberFormatter.format(row.historyPrice)}</td>
                <td className="office-sheet-grid__suggested">{numberFormatter.format(row.suggestedPrice)}</td>
                <td className="office-sheet-grid__input">
                  <input
                    aria-label={`${row.name}用户报价`}
                    min="0"
                    step="0.01"
                    type="number"
                    value={row.userPrice}
                    onChange={(event) => updateUserPrice(row.id, event.currentTarget.value)}
                  />
                </td>
                <td>{numberFormatter.format(row.quantity * row.userPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="office-sheet-tabs" role="tablist" aria-label="工作表">
        <button aria-selected="true" role="tab" type="button">报价明细表</button>
        <button aria-selected="false" role="tab" type="button">汇总表</button>
        <button aria-selected="false" role="tab" type="button">费用汇总表</button>
        <button aria-selected="false" role="tab" type="button">单价分析表</button>
        <span>100%</span>
      </div>
    </div>
  );
}
