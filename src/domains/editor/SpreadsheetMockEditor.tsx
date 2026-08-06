import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Download, Redo2, Save, Sigma, Sparkles, Undo2 } from 'lucide-react';

import type { QuoteSheetRow } from './types';
import './spreadsheet-editor-v2.css';

type SpreadsheetMockEditorProps = {
  downloadHref: string;
  downloadLabel: string;
  onRowsChange: (rows: QuoteSheetRow[]) => void;
  onSave: () => void;
  onSendSelectionToAssistant: (selection: string) => void;
  rows: QuoteSheetRow[];
};

type EditableField =
  | 'code'
  | 'name'
  | 'specification'
  | 'quantity'
  | 'unit'
  | 'tenderPrice'
  | 'userPrice';
type ReadonlyField = 'historyPrice' | 'suggestedPrice' | 'total';
type SheetField = EditableField | ReadonlyField;
type SheetTab = 'detail' | 'summary' | 'costs' | 'analysis';
type SortMode = 'original' | 'price-asc' | 'price-desc' | 'total-desc' | 'name';
type CellSelection = { field: SheetField; rowId: string };

const HISTORY_LIMIT = 80;
const sheetTabs: Array<[SheetTab, string]> = [
  ['detail', '报价明细'],
  ['summary', '汇总'],
  ['costs', '费用汇总'],
  ['analysis', '单价分析'],
];

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

const columns: Array<{
  field: SheetField;
  letter: string;
  label: string;
  numeric?: boolean;
}> = [
  { field: 'code', letter: 'A', label: '物料编码' },
  { field: 'name', letter: 'B', label: '物料名称' },
  { field: 'specification', letter: 'C', label: '规格型号' },
  { field: 'quantity', letter: 'D', label: '数量', numeric: true },
  { field: 'unit', letter: 'E', label: '单位' },
  { field: 'tenderPrice', letter: 'F', label: '招标限价（元）', numeric: true },
  { field: 'historyPrice', letter: 'G', label: '历史中标价（元）', numeric: true },
  { field: 'suggestedPrice', letter: 'H', label: '算法建议单价（元）', numeric: true },
  { field: 'userPrice', letter: 'I', label: '用户报价（元）', numeric: true },
  { field: 'total', letter: 'J', label: '合价（元）', numeric: true },
];

const textFields: EditableField[] = ['code', 'name', 'specification', 'unit'];
const numericFields: EditableField[] = ['quantity', 'tenderPrice', 'userPrice'];
const identityFields: EditableField[] = ['code', 'name', 'specification'];

function cloneRows(rows: readonly QuoteSheetRow[]) {
  return rows.map((row) => ({ ...row }));
}

function rowsEqual(left: readonly QuoteSheetRow[], right: readonly QuoteSheetRow[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pushHistory(stack: QuoteSheetRow[][], rows: readonly QuoteSheetRow[]) {
  stack.push(cloneRows(rows));
  if (stack.length > HISTORY_LIMIT) stack.splice(0, stack.length - HISTORY_LIMIT);
}

function rowTotal(row: QuoteSheetRow) {
  return row.quantity * row.userPrice;
}

function quoteTotal(rows: readonly QuoteSheetRow[]) {
  return rows.reduce((total, row) => total + rowTotal(row), 0);
}

function tenderTotal(rows: readonly QuoteSheetRow[]) {
  return rows.reduce((total, row) => total + row.quantity * row.tenderPrice, 0);
}

function cellKey(rowId: string, field: SheetField) {
  return `${rowId}:${field}`;
}

function cellValue(row: QuoteSheetRow, field: SheetField) {
  return field === 'total' ? rowTotal(row) : row[field];
}

function sourcePriceDisplay(value: number, unavailableLabel: '待查询' | '待计算') {
  return value > 0 ? numberFormatter.format(value) : unavailableLabel;
}

function selectedCellDisplay(row: QuoteSheetRow, field: SheetField) {
  if (field === 'historyPrice') return row.historyPrice > 0 ? String(row.historyPrice) : '待查询';
  if (field === 'suggestedPrice') return row.suggestedPrice > 0 ? String(row.suggestedPrice) : '待计算';
  return String(cellValue(row, field));
}

function inputLabel(row: QuoteSheetRow, field: EditableField) {
  const label = columns.find((column) => column.field === field)?.label ?? field;
  return field === 'userPrice' ? `${row.name}用户报价` : `${row.name}${label}`;
}

function isEditableField(field: SheetField): field is EditableField {
  return !['historyPrice', 'suggestedPrice', 'total'].includes(field);
}

export function SpreadsheetMockEditor({
  downloadHref,
  downloadLabel,
  onRowsChange,
  onSave,
  onSendSelectionToAssistant,
  rows,
}: SpreadsheetMockEditorProps) {
  const [editorRows, setEditorRows] = useState<QuoteSheetRow[]>(() => cloneRows(rows));
  const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);
  const [selectionMode, setSelectionMode] = useState<'cell' | 'row'>('cell');
  const [activeTab, setActiveTab] = useState<SheetTab>('detail');
  const [filterText, setFilterText] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('original');
  const [freezeHeader, setFreezeHeader] = useState(true);
  const [zoom, setZoom] = useState('100');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [sumResult, setSumResult] = useState('');
  const [notice, setNotice] = useState('');
  const [showSuggestionConfirm, setShowSuggestionConfirm] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const rowsRef = useRef(editorRows);
  const editorRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<QuoteSheetRow[][]>([]);
  const redoStackRef = useRef<QuoteSheetRow[][]>([]);
  const idSeedRef = useRef(0);
  const sheetTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const suggestionTriggerRef = useRef<HTMLButtonElement>(null);
  const suggestionCancelRef = useRef<HTMLButtonElement>(null);
  const restoreSuggestionFocusRef = useRef(false);

  const publishRows = useCallback(
    (nextRows: QuoteSheetRow[]) => {
      const snapshot = cloneRows(nextRows);
      rowsRef.current = snapshot;
      setEditorRows(snapshot);
      onRowsChange(cloneRows(snapshot));
    },
    [onRowsChange],
  );

  const commitRows = useCallback(
    (nextRows: QuoteSheetRow[]) => {
      const currentRows = rowsRef.current;
      if (rowsEqual(currentRows, nextRows)) return;
      pushHistory(undoStackRef.current, currentRows);
      redoStackRef.current = [];
      publishRows(nextRows);
      setHistoryVersion((version) => version + 1);
    },
    [publishRows],
  );

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    pushHistory(redoStackRef.current, rowsRef.current);
    publishRows(previous);
    setDrafts({});
    setValidationErrors({});
    setNotice('已撤销上一步修改');
    setHistoryVersion((version) => version + 1);
  }, [publishRows]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    pushHistory(undoStackRef.current, rowsRef.current);
    publishRows(next);
    setDrafts({});
    setValidationErrors({});
    setNotice('已重做修改');
    setHistoryVersion((version) => version + 1);
  }, [publishRows]);

  const save = useCallback(() => {
    onSave();
    setNotice('已触发保存');
  }, [onSave]);

  useEffect(() => {
    if (rowsEqual(rows, rowsRef.current)) return;
    const snapshot = cloneRows(rows);
    rowsRef.current = snapshot;
    setEditorRows(snapshot);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setDrafts({});
    setValidationErrors({});
    setHistoryVersion((version) => version + 1);
  }, [rows]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || !editorRef.current?.contains(target) || showSuggestionConfirm) return;
      const isTypingTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target.isContentEditable;
      if (isTypingTarget && (key === 'z' || key === 'y')) return;
      if (key === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [redo, save, showSuggestionConfirm, undo]);

  useEffect(() => {
    if (showSuggestionConfirm) {
      suggestionCancelRef.current?.focus();
      return;
    }
    if (restoreSuggestionFocusRef.current) {
      restoreSuggestionFocusRef.current = false;
      suggestionTriggerRef.current?.focus();
    }
  }, [showSuggestionConfirm]);

  const visibleRows = useMemo(() => {
    const search = filterText.trim().toLocaleLowerCase('zh-CN');
    const filtered = editorRows.filter((row) =>
      !search
      || [row.code, row.name, row.specification, row.unit]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(search)),
    );
    const sorted = [...filtered];
    if (sortMode === 'price-asc') sorted.sort((a, b) => a.userPrice - b.userPrice);
    if (sortMode === 'price-desc') sorted.sort((a, b) => b.userPrice - a.userPrice);
    if (sortMode === 'total-desc') sorted.sort((a, b) => rowTotal(b) - rowTotal(a));
    if (sortMode === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return sorted;
  }, [editorRows, filterText, sortMode]);

  useEffect(() => {
    if (selectedCell && !visibleRows.some((row) => row.id === selectedCell.rowId)) {
      setSelectedCell(null);
      setSelectionMode('cell');
    }
  }, [selectedCell, visibleRows]);

  const selectedRow = selectedCell
    ? visibleRows.find((row) => row.id === selectedCell.rowId) ?? null
    : null;
  const selectedColumn = selectedCell
    ? columns.find((column) => column.field === selectedCell.field) ?? null
    : null;
  const selectedRowIndex = selectedCell
    ? editorRows.findIndex((row) => row.id === selectedCell.rowId)
    : -1;
  const selectedKey = selectedCell ? cellKey(selectedCell.rowId, selectedCell.field) : '';
  const selectedValue = selectedCell && selectedRow
    ? drafts[selectedKey] ?? selectedCellDisplay(selectedRow, selectedCell.field)
    : '';
  const selectedCoordinate = selectedCell && selectedColumn && selectedRowIndex >= 0
    ? selectionMode === 'row'
      ? `${selectedRowIndex + 2}:${selectedRowIndex + 2}`
      : `${selectedColumn.letter}${selectedRowIndex + 2}`
    : '';

  const selectCell = (rowId: string, field: SheetField) => {
    setSelectedCell({ rowId, field });
    setSelectionMode('cell');
  };

  const selectRow = (rowId: string) => {
    setSelectedCell({ rowId, field: 'code' });
    setSelectionMode('row');
  };

  const closeSuggestionConfirm = () => {
    restoreSuggestionFocusRef.current = true;
    setShowSuggestionConfirm(false);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (tabIndex + offset + sheetTabs.length) % sheetTabs.length;
    setActiveTab(sheetTabs[nextIndex][0]);
    sheetTabRefs.current[nextIndex]?.focus();
  };

  const sendSelectionToAssistant = () => {
    if (!selectedCell || !selectedRow || !selectedColumn || selectedRowIndex < 0) {
      setNotice('请先选择要针对性修改的单元格或整行');
      return;
    }

    if (selectionMode === 'row') {
      onSendSelectionToAssistant([
        '【报价单选中行】',
        `行号：${selectedRowIndex + 2}`,
        `物料编码：${selectedRow.code}`,
        `物料名称：${selectedRow.name}`,
        `规格型号：${selectedRow.specification}`,
        `数量：${integerFormatter.format(selectedRow.quantity)} ${selectedRow.unit}`,
        `招标限价（元）：${numberFormatter.format(selectedRow.tenderPrice)}`,
        `历史中标价（元）：${sourcePriceDisplay(selectedRow.historyPrice, '待查询')}（只读外部数据）`,
        `算法建议单价（元）：${sourcePriceDisplay(selectedRow.suggestedPrice, '待计算')}（只读算法输出）`,
        `用户报价（元）：${numberFormatter.format(selectedRow.userPrice)}`,
        `合价（元）：${numberFormatter.format(rowTotal(selectedRow))}`,
      ].join('\n'));
      setNotice('已填入项目助手输入框，请补充修改要求');
      return;
    }

    const readonlyNote = selectedCell.field === 'historyPrice'
      ? '（只读外部数据）'
      : selectedCell.field === 'suggestedPrice'
        ? '（只读算法输出）'
        : selectedCell.field === 'total'
          ? '（自动计算，只读）'
          : '';
    onSendSelectionToAssistant([
      '【报价单选中单元格】',
      `物料：${selectedRow.name}（${selectedRow.code}）`,
      `位置：${selectedCoordinate}`,
      `字段：${selectedColumn.label}${readonlyNote}`,
      `值：${selectedValue}`,
      `规格：${selectedRow.specification}`,
      `数量：${integerFormatter.format(selectedRow.quantity)} ${selectedRow.unit}`,
    ].join('\n'));
    setNotice('已填入项目助手输入框，请补充修改要求');
  };

  const updateError = (key: string, message?: string) => {
    setValidationErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  };

  const updateCell = (rowId: string, field: EditableField, rawValue: string) => {
    const key = cellKey(rowId, field);
    setDrafts((current) => ({ ...current, [key]: rawValue }));

    if (textFields.includes(field)) {
      if (!rawValue.trim()) {
        updateError(key, '此字段不能为空');
        return;
      }
      updateError(key);
      const invalidatesSources = identityFields.includes(field)
        && rowsRef.current.some((row) => row.id === rowId && row[field] !== rawValue);
      commitRows(
        rowsRef.current.map((row) =>
          row.id === rowId
            ? {
                ...row,
                [field]: rawValue,
                ...(invalidatesSources ? { historyPrice: 0, suggestedPrice: 0 } : {}),
              }
            : row,
        ),
      );
      if (invalidatesSources) setNotice('物料信息已变更，历史价需重新查询、算法建议价需重新计算');
      return;
    }

    if (numericFields.includes(field)) {
      const value = Number(rawValue);
      if (!rawValue.trim() || !Number.isFinite(value)) {
        updateError(key, '请输入有效数字');
        return;
      }
      if (field === 'quantity' && value <= 0) {
        updateError(key, '数量必须大于 0');
        return;
      }
      if (field !== 'quantity' && value < 0) {
        updateError(key, '金额不能小于 0');
        return;
      }
      updateError(key);
      commitRows(
        rowsRef.current.map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row,
        ),
      );
    }
  };

  const finishCellEdit = (rowId: string, field: SheetField) => {
    const key = cellKey(rowId, field);
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    updateError(key);
  };

  const addRow = () => {
    const seed = Date.now() + idSeedRef.current++;
    const newRow: QuoteSheetRow = {
      id: `quote-row-${seed}`,
      code: `NEW-${String(editorRows.length + 1).padStart(3, '0')}`,
      name: '新增物料',
      specification: '待填写',
      quantity: 1,
      unit: '项',
      tenderPrice: 0,
      historyPrice: 0,
      suggestedPrice: 0,
      userPrice: 0,
    };
    commitRows([...rowsRef.current, newRow]);
    setFilterText('');
    setSortMode('original');
    setActiveTab('detail');
    selectCell(newRow.id, 'code');
    setNotice('已新增一行，历史价待查询、算法建议价待计算');
  };

  const duplicateRow = () => {
    if (!selectedRow) return;
    const seed = Date.now() + idSeedRef.current++;
    const duplicated: QuoteSheetRow = {
      ...selectedRow,
      id: `quote-row-copy-${seed}`,
      code: `${selectedRow.code}-副本`,
      historyPrice: 0,
      suggestedPrice: 0,
    };
    const sourceIndex = rowsRef.current.findIndex((row) => row.id === selectedRow.id);
    const nextRows = [...rowsRef.current];
    nextRows.splice(sourceIndex + 1, 0, duplicated);
    commitRows(nextRows);
    selectCell(duplicated.id, 'code');
    setNotice('已复制选中行，历史价待查询、算法建议价待计算');
  };

  const deleteRow = () => {
    if (!selectedRow) return;
    const sourceIndex = rowsRef.current.findIndex((row) => row.id === selectedRow.id);
    const nextRows = rowsRef.current.filter((row) => row.id !== selectedRow.id);
    commitRows(nextRows);
    const nextSelected = nextRows[Math.min(sourceIndex, nextRows.length - 1)];
    if (nextSelected) selectCell(nextSelected.id, 'code');
    else setSelectedCell(null);
    setNotice('已删除选中行');
  };

  const calculateSum = () => {
    const field = selectedCell?.field;
    let label = '合价';
    let total = quoteTotal(visibleRows);
    if (field && ['quantity', 'tenderPrice', 'historyPrice', 'suggestedPrice', 'userPrice'].includes(field)) {
      label = columns.find((column) => column.field === field)?.label ?? field;
      total = visibleRows.reduce(
        (sum, row) => sum + Number(row[field as keyof QuoteSheetRow]),
        0,
      );
    }
    setSumResult(`自动求和：${label} = ${numberFormatter.format(total)}`);
  };

  const applySuggestedPrices = () => {
    const nextRows = rowsRef.current.map((row) => row.suggestedPrice > 0
      ? { ...row, userPrice: row.suggestedPrice }
      : row);
    commitRows(nextRows);
    closeSuggestionConfirm();
    setNotice('已将算法建议价批量写入用户报价，可撤销');
  };

  const costGroups = useMemo(() => {
    const groups = new Map<string, { count: number; quantity: number; total: number }>();
    editorRows.forEach((row) => {
      const current = groups.get(row.unit) ?? { count: 0, quantity: 0, total: 0 };
      current.count += 1;
      current.quantity += row.quantity;
      current.total += rowTotal(row);
      groups.set(row.unit, current);
    });
    return [...groups.entries()];
  }, [editorRows]);

  const total = quoteTotal(editorRows);
  const limitTotal = tenderTotal(editorRows);
  const totalQuantity = editorRows.reduce((sum, row) => sum + row.quantity, 0);
  const weightedUnitPrice = totalQuantity ? total / totalQuantity : 0;
  const eligibleSuggestionCount = editorRows.filter((row) => row.suggestedPrice > 0).length;
  const canApplySuggestions = eligibleSuggestionCount > 0;
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  void historyVersion;

  const renderEditableCell = (row: QuoteSheetRow, field: EditableField) => {
    const key = cellKey(row.id, field);
    const isNumeric = numericFields.includes(field);
    return (
      <input
        aria-invalid={Boolean(validationErrors[key])}
        aria-label={inputLabel(row, field)}
        className={isNumeric ? 'office-sheet-cell-input office-sheet-cell-input--number' : 'office-sheet-cell-input'}
        min={field === 'quantity' ? '0.01' : isNumeric ? '0' : undefined}
        step={isNumeric ? '0.01' : undefined}
        title={validationErrors[key]}
        type={isNumeric ? 'number' : 'text'}
        value={drafts[key] ?? String(row[field])}
        onBlur={() => finishCellEdit(row.id, field)}
        onChange={(event) => updateCell(row.id, field, event.currentTarget.value)}
        onFocus={() => selectCell(row.id, field)}
      />
    );
  };

  return (
    <div className="office-sheet-editor office-sheet-editor-v2" ref={editorRef}>
      <div className="office-editor-toolbar office-sheet-toolbar" role="toolbar" aria-label="在线表格编辑工具栏">
        <button aria-label="撤销" disabled={!canUndo} title="撤销（Ctrl+Z）" type="button" onClick={undo}>
          <Undo2 aria-hidden="true" size={17} />
        </button>
        <button aria-label="重做" disabled={!canRedo} title="重做（Ctrl+Y）" type="button" onClick={redo}>
          <Redo2 aria-hidden="true" size={17} />
        </button>
        <span className="office-sheet-toolbar__divider" aria-hidden="true" />
        <button type="button" onClick={addRow}>新增行</button>
        <button disabled={!selectedRow} type="button" onClick={duplicateRow}>复制行</button>
        <button disabled={!selectedRow} type="button" onClick={deleteRow}>删除选中行</button>
        <button aria-label="自动求和" title="对当前数值列或合价求和" type="button" onClick={calculateSum}>
          <Sigma aria-hidden="true" size={17} /> 自动求和
        </button>
        <button
          aria-pressed={freezeHeader}
          type="button"
          onClick={() => setFreezeHeader((current) => !current)}
        >
          {freezeHeader ? '取消冻结表头' : '冻结表头'}
        </button>
        <button
          className="office-editor-toolbar__ai"
          title="将选中的单元格或整行作为上下文填入页面底部项目助手输入框（不会自动提交）"
          type="button"
          onClick={sendSelectionToAssistant}
        >
          <Sparkles aria-hidden="true" size={16} /> AI针对性修改
        </button>
        <button
          disabled={!canApplySuggestions}
          ref={suggestionTriggerRef}
          title="将算法建议单价批量写入用户报价"
          type="button"
          onClick={() => setShowSuggestionConfirm(true)}
        >
          应用算法建议价
        </button>
        <a
          download
          aria-label={`下载原始 Mock Excel（${downloadLabel}）`}
          href={downloadHref}
          title={`原始文件：${downloadLabel}`}
        >
          <Download aria-hidden="true" size={16} /> 下载原始 Mock Excel
        </a>
        <button className="office-editor-toolbar__save" title="保存（Ctrl+S）" type="button" onClick={save}>
          <Save aria-hidden="true" size={16} /> 保存演示修改
        </button>
      </div>

      <div className="office-sheet-formula-bar" aria-label="名称和公式栏">
        <input aria-label="名称框" placeholder="单元格" readOnly value={selectedCoordinate} />
        <span aria-hidden="true">fx</span>
        <input
          aria-invalid={Boolean(selectedKey && validationErrors[selectedKey])}
          aria-label="公式栏"
          placeholder="选择单元格后可编辑内容"
          readOnly={!selectedCell || selectionMode === 'row' || !isEditableField(selectedCell.field)}
          value={selectedValue}
          onBlur={() => {
            if (selectedCell) finishCellEdit(selectedCell.rowId, selectedCell.field);
          }}
          onChange={(event) => {
            if (selectedCell && selectionMode === 'cell' && isEditableField(selectedCell.field)) {
              updateCell(selectedCell.rowId, selectedCell.field, event.currentTarget.value);
            }
          }}
        />
        {selectedKey && validationErrors[selectedKey] ? (
          <span className="office-sheet-formula-bar__error" role="alert">{validationErrors[selectedKey]}</span>
        ) : null}
      </div>

      <div className="office-sheet-controls">
        <label>
          筛选
          <input
            aria-label="筛选报价行"
            placeholder="物料编码、名称、规格或单位"
            type="search"
            value={filterText}
            onChange={(event) => setFilterText(event.currentTarget.value)}
          />
        </label>
        <label>
          排序
          <select aria-label="排序方式" value={sortMode} onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}>
            <option value="original">原始顺序</option>
            <option value="price-asc">报价从低到高</option>
            <option value="price-desc">报价从高到低</option>
            <option value="total-desc">合价从高到低</option>
            <option value="name">物料名称</option>
          </select>
        </label>
        <span>{filterText ? `显示 ${visibleRows.length}/${editorRows.length} 行` : `共 ${editorRows.length} 行`}</span>
        {sumResult ? <span aria-live="polite">{sumResult}</span> : null}
        {notice ? <span className="office-sheet-controls__notice" aria-live="polite">{notice}</span> : null}
      </div>

      {activeTab === 'detail' ? (
        <div
          aria-labelledby="sheet-tab-detail"
          className={`office-sheet-stage ${freezeHeader ? 'office-sheet-stage--frozen' : ''}`}
          data-zoom={zoom}
          id="sheet-panel-detail"
          role="tabpanel"
        >
          <table className="office-sheet-grid">
            <thead>
              <tr className="office-sheet-grid__letters">
                <th aria-hidden="true" />
                {columns.map((column) => <th key={column.field}>{column.letter}</th>)}
              </tr>
              <tr>
                <th aria-label="行号">1</th>
                {columns.map((column) => <th key={column.field}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const rowIndex = editorRows.findIndex((item) => item.id === row.id);
                return (
                  <tr
                    className={selectedCell?.rowId === row.id
                      ? selectionMode === 'row' ? 'is-row-selected is-whole-row-selected' : 'is-row-selected'
                      : ''}
                    key={row.id}
                  >
                    <th scope="row">
                      <button
                        aria-label={`选择第 ${rowIndex + 2} 行`}
                        type="button"
                        onClick={() => selectRow(row.id)}
                      >
                        {rowIndex + 2}
                      </button>
                    </th>
                    {columns.map((column) => {
                      const isSelected = selectedCell?.rowId === row.id && selectedCell.field === column.field;
                      if (!isEditableField(column.field)) {
                        const isTotal = column.field === 'total';
                        return (
                          <td
                            aria-label={isTotal ? `${row.name}合价` : `${row.name}${column.label}`}
                            aria-readonly="true"
                            className={`${isSelected ? 'is-selected ' : ''}${isTotal ? 'office-sheet-cell-total' : 'office-sheet-cell-readonly'} ${column.field === 'suggestedPrice' ? 'office-sheet-grid__suggested' : ''} ${(column.field === 'historyPrice' || column.field === 'suggestedPrice') && Number(cellValue(row, column.field)) <= 0 ? 'office-sheet-cell-readonly--unavailable' : ''}`}
                            key={column.field}
                            tabIndex={0}
                            title={isTotal ? '由数量 × 用户报价自动计算' : column.field === 'historyPrice' ? '外部历史报价库单向数据，只读' : '算法输出，只能通过“应用算法建议价”写入用户报价'}
                            onClick={() => selectCell(row.id, column.field)}
                            onFocus={() => selectCell(row.id, column.field)}
                          >
                            {column.field === 'historyPrice'
                              ? sourcePriceDisplay(row.historyPrice, '待查询')
                              : column.field === 'suggestedPrice'
                                ? sourcePriceDisplay(row.suggestedPrice, '待计算')
                                : numberFormatter.format(Number(cellValue(row, column.field)))}
                          </td>
                        );
                      }
                      return (
                        <td
                          className={isSelected ? 'is-selected' : undefined}
                          key={column.field}
                        >
                          {column.field === 'name' ? <span className="office-sheet-cell-value-text">{row.name}</span> : null}
                          {renderEditableCell(row, column.field)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th aria-hidden="true" />
                <th colSpan={3}>当前视图合计</th>
                <td>{integerFormatter.format(visibleRows.reduce((sum, row) => sum + row.quantity, 0))}</td>
                <td colSpan={5} />
                <td>¥ {numberFormatter.format(quoteTotal(visibleRows))}</td>
              </tr>
            </tfoot>
          </table>
          {visibleRows.length === 0 ? <p className="office-sheet-empty">没有符合筛选条件的报价行</p> : null}
        </div>
      ) : null}

      {activeTab === 'summary' ? (
        <div aria-labelledby="sheet-tab-summary" className="office-sheet-report" id="sheet-panel-summary" role="tabpanel">
          <header><h3>报价汇总</h3><p>基于当前 {editorRows.length} 条报价明细实时计算</p></header>
          <div className="office-sheet-summary-cards">
            <article><span>报价总额</span><strong>¥ {numberFormatter.format(total)}</strong></article>
            <article><span>招标限价总额</span><strong>¥ {numberFormatter.format(limitTotal)}</strong></article>
            <article><span>限价节省</span><strong>¥ {numberFormatter.format(limitTotal - total)}</strong></article>
            <article><span>物料总数量</span><strong>{integerFormatter.format(totalQuantity)}</strong></article>
            <article><span>加权平均单价</span><strong>¥ {numberFormatter.format(weightedUnitPrice)}</strong></article>
            <article><span>限价使用率</span><strong>{limitTotal ? `${((total / limitTotal) * 100).toFixed(2)}%` : '--'}</strong></article>
          </div>
        </div>
      ) : null}

      {activeTab === 'costs' ? (
        <div aria-labelledby="sheet-tab-costs" className="office-sheet-report" id="sheet-panel-costs" role="tabpanel">
          <header><h3>费用汇总</h3><p>按计量单位归集当前报价明细</p></header>
          <table>
            <thead><tr><th>计量单位</th><th>物料项数</th><th>数量合计</th><th>报价金额</th><th>金额占比</th></tr></thead>
            <tbody>
              {costGroups.map(([unit, group]) => (
                <tr key={unit}>
                  <td>{unit}</td><td>{group.count}</td><td>{integerFormatter.format(group.quantity)}</td>
                  <td>¥ {numberFormatter.format(group.total)}</td>
                  <td>{total ? `${((group.total / total) * 100).toFixed(2)}%` : '0.00%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === 'analysis' ? (
        <div aria-labelledby="sheet-tab-analysis" className="office-sheet-report" id="sheet-panel-analysis" role="tabpanel">
          <header><h3>单价分析</h3><p>逐项比较限价、历史价、建议价和用户报价</p></header>
          <table>
            <thead><tr><th>物料</th><th>招标限价</th><th>历史价</th><th>算法建议价</th><th>用户报价</th><th>较建议价偏差</th></tr></thead>
            <tbody>
              {editorRows.map((row) => {
                const deviation = row.suggestedPrice ? ((row.userPrice - row.suggestedPrice) / row.suggestedPrice) * 100 : 0;
                return (
                  <tr key={row.id}>
                    <td>{row.name}</td><td>{numberFormatter.format(row.tenderPrice)}</td>
                    <td>{sourcePriceDisplay(row.historyPrice, '待查询')}</td><td>{sourcePriceDisplay(row.suggestedPrice, '待计算')}</td>
                    <td>{numberFormatter.format(row.userPrice)}</td>
                    <td className={row.suggestedPrice <= 0 ? undefined : deviation > 0 ? 'is-over' : 'is-under'}>
                      {row.suggestedPrice > 0 ? `${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}%` : '待计算'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="office-sheet-tabs" role="tablist" aria-label="工作表">
        {sheetTabs.map(([tab, label], tabIndex) => (
          <button
            aria-controls={`sheet-panel-${tab}`}
            aria-selected={activeTab === tab}
            id={`sheet-tab-${tab}`}
            key={tab}
            ref={(element) => { sheetTabRefs.current[tabIndex] = element; }}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, tabIndex)}
          >
            {label}
          </button>
        ))}
        <label className="office-sheet-zoom">
          缩放
          <select aria-label="缩放比例" value={zoom} onChange={(event) => setZoom(event.currentTarget.value)}>
            <option value="80">80%</option><option value="90">90%</option><option value="100">100%</option>
            <option value="110">110%</option><option value="125">125%</option>
          </select>
        </label>
      </div>

      {showSuggestionConfirm ? (
        <div className="office-sheet-confirm-backdrop" role="presentation">
          <div
            aria-describedby="apply-suggestion-description"
            aria-labelledby="apply-suggestion-title"
            aria-modal="true"
            className="office-sheet-confirm"
            role="dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSuggestionConfirm();
              }
            }}
          >
            <h3 id="apply-suggestion-title">应用算法建议价？</h3>
            <p id="apply-suggestion-description">将批量覆盖 {eligibleSuggestionCount} 条用户报价（仅限有可用算法建议价的行）。无建议价的行不会被修改，操作完成后可通过撤销恢复。</p>
            <div>
              <button ref={suggestionCancelRef} type="button" onClick={closeSuggestionConfirm}>取消</button>
              <button type="button" onClick={applySuggestedPrices}>确认应用</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
