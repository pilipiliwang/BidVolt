import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SpreadsheetMockEditor } from './SpreadsheetMockEditor';
import type { QuoteSheetRow } from './types';

const rows: QuoteSheetRow[] = [
  {
    id: 'row-1',
    code: 'A-001',
    name: '断路器',
    specification: 'ZN63',
    quantity: 2,
    unit: '台',
    tenderPrice: 130,
    historyPrice: 110,
    suggestedPrice: 95,
    userPrice: 100,
  },
  {
    id: 'row-2',
    code: 'B-002',
    name: '变压器',
    specification: 'SCB11',
    quantity: 3,
    unit: '台',
    tenderPrice: 260,
    historyPrice: 230,
    suggestedPrice: 190,
    userPrice: 200,
  },
];

function renderEditor(overrides?: {
  onRowsChange?: (next: QuoteSheetRow[]) => void;
  onSave?: () => void;
  onSendSelectionToAssistant?: (selection: string) => void;
  rows?: QuoteSheetRow[];
}) {
  const onRowsChange = overrides?.onRowsChange ?? vi.fn();
  const onSave = overrides?.onSave ?? vi.fn();
  const onSendSelectionToAssistant = overrides?.onSendSelectionToAssistant ?? vi.fn();
  render(
    <SpreadsheetMockEditor
      downloadHref="/quote.xlsx"
      downloadLabel="下载测试报价单"
      onRowsChange={onRowsChange}
      onSave={onSave}
      onSendSelectionToAssistant={onSendSelectionToAssistant}
      rows={overrides?.rows ?? rows}
    />,
  );
  return { onRowsChange, onSave, onSendSelectionToAssistant };
}

describe('SpreadsheetMockEditor', () => {
  it('edits and validates cells, shows the coordinate, and supports undo, redo and save shortcuts', async () => {
    const { onRowsChange, onSave } = renderEditor();
    const quoteInput = screen.getByRole('spinbutton', { name: '断路器用户报价' });

    fireEvent.focus(quoteInput);
    expect(screen.getByLabelText('名称框')).toHaveValue('I2');
    expect(screen.getByLabelText('公式栏')).toHaveValue('100');

    fireEvent.change(quoteInput, { target: { value: '150' } });
    expect(screen.getByLabelText('公式栏')).toHaveValue('150');
    expect(screen.getByLabelText('断路器合价')).toHaveTextContent('300.00');
    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'row-1', userPrice: 150 })]),
    );

    fireEvent.change(quoteInput, { target: { value: '-1' } });
    expect(quoteInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('金额不能小于 0');
    expect(screen.getByLabelText('断路器合价')).toHaveTextContent('300.00');
    fireEvent.blur(quoteInput);

    const toolbar = screen.getByRole('toolbar', { name: '在线表格编辑工具栏' });
    fireEvent.keyDown(toolbar, { ctrlKey: true, key: 'z' });
    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(100);
    fireEvent.keyDown(toolbar, { ctrlKey: true, key: 'y' });
    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(150);
    fireEvent.keyDown(toolbar, { ctrlKey: true, key: 's' });
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { ctrlKey: true, key: 's' });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('adds, duplicates and deletes rows, then filters and sorts the live data', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('spinbutton', { name: '断路器用户报价' }));
    await user.click(screen.getByRole('button', { name: '复制行' }));
    expect(screen.getAllByDisplayValue('A-001-副本')).toHaveLength(2);
    expect(screen.getByText('共 3 行')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除选中行' }));
    expect(screen.queryByDisplayValue('A-001-副本')).not.toBeInTheDocument();
    expect(screen.getByText('共 2 行')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新增行' }));
    expect(screen.getByDisplayValue('新增物料')).toBeInTheDocument();
    expect(screen.getByText('共 3 行')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '筛选报价行' }), '变压器');
    expect(screen.getByText('显示 1/3 行')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: '断路器用户报价' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '变压器用户报价' })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: '筛选报价行' }));
    await user.selectOptions(screen.getByLabelText('排序方式'), 'price-desc');
    const detail = screen.getByRole('tabpanel', { name: '报价明细' });
    const bodyRows = within(detail).getAllByRole('row').slice(2, -1);
    expect(within(bodyRows[0]).getByDisplayValue('变压器')).toBeInTheDocument();
  });

  it('calculates auto sum and renders all live worksheet views', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('spinbutton', { name: '断路器数量' }));
    await user.click(screen.getByRole('button', { name: '自动求和' }));
    expect(screen.getByText('自动求和：数量 = 5.00')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '汇总' }));
    expect(screen.getByRole('tabpanel', { name: '汇总' })).toHaveTextContent('¥ 800.00');
    expect(screen.getByRole('tabpanel', { name: '汇总' })).toHaveTextContent('物料总数量');

    await user.click(screen.getByRole('tab', { name: '费用汇总' }));
    expect(screen.getByRole('tabpanel', { name: '费用汇总' })).toHaveTextContent('计量单位');
    expect(screen.getByRole('tabpanel', { name: '费用汇总' })).toHaveTextContent('¥ 800.00');

    await user.click(screen.getByRole('tab', { name: '单价分析' }));
    expect(screen.getByRole('tabpanel', { name: '单价分析' })).toHaveTextContent('断路器');
    expect(screen.getByRole('tabpanel', { name: '单价分析' })).toHaveTextContent('变压器');
  });

  it('requires confirmation before applying suggested prices and makes the batch change undoable', async () => {
    const user = userEvent.setup();
    renderEditor();

    const historyPrice = screen.getByLabelText('断路器历史中标价（元）');
    const suggestedPrice = screen.getByLabelText('断路器算法建议单价（元）');
    expect(historyPrice).toHaveAttribute('aria-readonly', 'true');
    expect(historyPrice).toHaveAttribute('title', '外部历史报价库单向数据，只读');
    expect(suggestedPrice).toHaveAttribute('aria-readonly', 'true');
    expect(historyPrice.querySelector('input')).toBeNull();
    expect(suggestedPrice.querySelector('input')).toBeNull();
    await user.click(suggestedPrice);
    expect(screen.getByLabelText('名称框')).toHaveValue('H2');
    expect(screen.getByLabelText('公式栏')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('公式栏')).toHaveValue('95');

    const suggestionTrigger = screen.getByRole('button', { name: '应用算法建议价' });
    await user.click(suggestionTrigger);
    let dialog = screen.getByRole('dialog', { name: '应用算法建议价？' });
    expect(dialog).toHaveTextContent('批量覆盖 2 条用户报价');
    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(100);
    expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '应用算法建议价？' })).not.toBeInTheDocument();
    expect(suggestionTrigger).toHaveFocus();

    await user.click(suggestionTrigger);
    dialog = screen.getByRole('dialog', { name: '应用算法建议价？' });
    await user.click(within(dialog).getByRole('button', { name: '确认应用' }));
    expect(suggestionTrigger).toHaveFocus();
    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(95);
    expect(screen.getByRole('spinbutton', { name: '变压器用户报价' })).toHaveValue(190);

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(100);
    expect(screen.getByRole('spinbutton', { name: '变压器用户报价' })).toHaveValue(200);
  });

  it('sends a selected cell or row to the AI input without mutating quote data', async () => {
    const user = userEvent.setup();
    const { onRowsChange, onSendSelectionToAssistant } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    expect(onSendSelectionToAssistant).not.toHaveBeenCalled();
    expect(screen.getByText('请先选择要针对性修改的单元格或整行')).toBeInTheDocument();

    await user.click(screen.getByLabelText('断路器历史中标价（元）'));
    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('【报价单选中单元格】'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('物料：断路器（A-001）'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('位置：G2'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('字段：历史中标价（元）（只读外部数据）'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('值：110'));
    expect(screen.getByText('已填入项目助手输入框，请补充修改要求')).toBeInTheDocument();
    expect(onRowsChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '选择第 2 行' }));
    expect(screen.getByLabelText('名称框')).toHaveValue('2:2');
    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    expect(onSendSelectionToAssistant).toHaveBeenCalledTimes(2);
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('【报价单选中行】'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('历史中标价（元）：110.00（只读外部数据）'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('算法建议单价（元）：95.00（只读算法输出）'));
    expect(onSendSelectionToAssistant).toHaveBeenLastCalledWith(expect.stringContaining('用户报价（元）：100.00'));
    expect(screen.getByText('已填入项目助手输入框，请补充修改要求')).toBeInTheDocument();
    expect(onRowsChange).not.toHaveBeenCalled();
  });

  it('does not hijack undo and redo while the user is typing in a form control', () => {
    const { onRowsChange } = renderEditor();
    const quoteInput = screen.getByRole('spinbutton', { name: '断路器用户报价' });
    fireEvent.change(quoteInput, { target: { value: '150' } });
    expect(quoteInput).toHaveValue(150);

    const filterInput = screen.getByRole('searchbox', { name: '筛选报价行' });
    fireEvent.keyDown(filterInput, { ctrlKey: true, key: 'z' });
    fireEvent.keyDown(filterInput, { ctrlKey: true, key: 'y' });

    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(150);
    expect(onRowsChange).toHaveBeenCalledTimes(1);
  });

  it('toggles frozen headers and applies a working zoom level', async () => {
    const user = userEvent.setup();
    renderEditor();
    const stage = screen.getByRole('tabpanel', { name: '报价明细' });
    expect(stage).toHaveClass('office-sheet-stage--frozen');

    await user.click(screen.getByRole('button', { name: '取消冻结表头' }));
    expect(stage).not.toHaveClass('office-sheet-stage--frozen');

    await user.selectOptions(screen.getByLabelText('缩放比例'), '125');
    expect(stage).toHaveAttribute('data-zoom', '125');
  });

  it('marks source prices unavailable after adding, copying or changing material identity', async () => {
    const user = userEvent.setup();
    const { onRowsChange } = renderEditor();

    fireEvent.change(screen.getByLabelText('断路器物料编码'), { target: { value: 'A-009' } });
    expect(screen.getByLabelText('断路器历史中标价（元）')).toHaveTextContent('待查询');
    expect(screen.getByLabelText('断路器算法建议单价（元）')).toHaveTextContent('待计算');
    expect(screen.getByText('物料信息已变更，历史价需重新查询、算法建议价需重新计算')).toBeInTheDocument();
    expect(onRowsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ code: 'A-009', historyPrice: 0, suggestedPrice: 0 }),
    ]));

    await user.click(screen.getByLabelText('断路器历史中标价（元）'));
    expect(screen.getByLabelText('公式栏')).toHaveValue('待查询');

    await user.click(screen.getByRole('spinbutton', { name: '变压器用户报价' }));
    await user.click(screen.getByRole('button', { name: '复制行' }));
    const detail = screen.getByRole('tabpanel', { name: '报价明细' });
    const copiedRow = within(detail).getAllByRole('row').find(
      (row) => within(row).queryByDisplayValue('B-002-副本'),
    );
    expect(copiedRow).toBeDefined();
    expect(within(copiedRow!).getByLabelText('变压器历史中标价（元）')).toHaveTextContent('待查询');
    expect(within(copiedRow!).getByLabelText('变压器算法建议单价（元）')).toHaveTextContent('待计算');

    await user.click(screen.getByRole('button', { name: '新增行' }));
    expect(screen.getByLabelText('新增物料历史中标价（元）')).toHaveTextContent('待查询');
    expect(screen.getByLabelText('新增物料算法建议单价（元）')).toHaveTextContent('待计算');
  });

  it('applies algorithm suggestions only to rows with a positive available suggestion', async () => {
    const user = userEvent.setup();
    renderEditor({
      rows: [
        ...rows,
        {
          id: 'row-unavailable',
          code: 'C-003',
          name: '待查询物料',
          specification: 'N/A',
          quantity: 1,
          unit: '台',
          tenderPrice: 80,
          historyPrice: 0,
          suggestedPrice: 0,
          userPrice: 77,
        },
      ],
    });

    expect(screen.getByLabelText('待查询物料历史中标价（元）')).toHaveTextContent('待查询');
    expect(screen.getByLabelText('待查询物料算法建议单价（元）')).toHaveTextContent('待计算');
    await user.click(screen.getByRole('button', { name: '应用算法建议价' }));
    const dialog = screen.getByRole('dialog', { name: '应用算法建议价？' });
    expect(dialog).toHaveTextContent('批量覆盖 2 条用户报价');
    expect(dialog).toHaveTextContent('无建议价的行不会被修改');
    await user.click(within(dialog).getByRole('button', { name: '确认应用' }));

    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(95);
    expect(screen.getByRole('spinbutton', { name: '变压器用户报价' })).toHaveValue(190);
    expect(screen.getByRole('spinbutton', { name: '待查询物料用户报价' })).toHaveValue(77);
  });

  it('clears a selection when filtering hides its row and blocks hidden-row actions', async () => {
    const user = userEvent.setup();
    const { onSendSelectionToAssistant } = renderEditor();
    await user.click(screen.getByRole('spinbutton', { name: '断路器用户报价' }));

    await user.type(screen.getByRole('searchbox', { name: '筛选报价行' }), '变压器');
    expect(screen.getByLabelText('名称框')).toHaveValue('');
    expect(screen.getByRole('button', { name: '复制行' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '删除选中行' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'AI针对性修改' }));
    expect(onSendSelectionToAssistant).not.toHaveBeenCalled();
    expect(screen.getByText('请先选择要针对性修改的单元格或整行')).toBeInTheDocument();
    expect(screen.getByText('显示 1/2 行')).toBeInTheDocument();
  });

  it('caps undo history at 80 snapshots', () => {
    renderEditor();
    const quoteInput = screen.getByRole('spinbutton', { name: '断路器用户报价' });
    for (let value = 101; value <= 181; value += 1) {
      fireEvent.change(quoteInput, { target: { value: String(value) } });
    }

    const undoButton = screen.getByRole('button', { name: '撤销' });
    for (let count = 0; count < 80; count += 1) fireEvent.click(undoButton);
    expect(screen.getByRole('spinbutton', { name: '断路器用户报价' })).toHaveValue(101);
    expect(undoButton).toBeDisabled();
  });

  it('exposes accessible worksheet tabs with roving focus and arrow-key navigation', () => {
    renderEditor();
    const detailTab = screen.getByRole('tab', { name: '报价明细' });
    const summaryTab = screen.getByRole('tab', { name: '汇总' });
    expect(detailTab).toHaveAttribute('id', 'sheet-tab-detail');
    expect(detailTab).toHaveAttribute('aria-controls', 'sheet-panel-detail');
    expect(detailTab).toHaveAttribute('tabindex', '0');
    expect(summaryTab).toHaveAttribute('tabindex', '-1');

    detailTab.focus();
    fireEvent.keyDown(detailTab, { key: 'ArrowRight' });
    expect(summaryTab).toHaveFocus();
    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(summaryTab).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tabpanel', { name: '汇总' })).toHaveAttribute('aria-labelledby', 'sheet-tab-summary');

    fireEvent.keyDown(summaryTab, { key: 'ArrowLeft' });
    expect(detailTab).toHaveFocus();
    expect(detailTab).toHaveAttribute('aria-selected', 'true');
  });

  it('downloads the original workbook without runtime mock wording', () => {
    renderEditor();
    const download = screen.getByRole('link', { name: '下载测试报价单' });
    expect(download).toHaveTextContent('下载原始文件');
    expect(download).toHaveAttribute('href', '/quote.xlsx');
    expect(download).toHaveAttribute('download');
  });

  it('keeps an empty workbook editable and can add its first row', async () => {
    const user = userEvent.setup();
    const { onRowsChange } = renderEditor({ rows: [] });

    expect(screen.getByText('报价单暂无明细，请点击“新增行”开始编辑')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新增行' }));

    expect(onRowsChange).toHaveBeenCalledWith([
      expect.objectContaining({ quantity: 1, historyPrice: 0, suggestedPrice: 0 }),
    ]);
  });
});
