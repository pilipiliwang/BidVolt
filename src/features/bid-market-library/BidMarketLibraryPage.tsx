import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  FolderOpen,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';

import type {
  BidMarketCategory,
  BidMarketContent,
  BidMarketContentKind,
  BidMarketLibraryProps,
} from './types';
import './bid-market-library.css';

const kindMeta: Record<BidMarketContentKind, { label: string; Icon: typeof BookOpen }> = {
  article: { label: '文章', Icon: BookOpen },
  video: { label: '视频', Icon: PlayCircle },
  document: { label: '文档', Icon: FileText },
};

export function BidMarketLibraryPage({
  state,
  categories,
  items,
  errorMessage,
  unavailableMessage,
  pageSize = 8,
  onRefresh,
  onUpload,
}: BidMarketLibraryProps) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const uploadTriggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN');
    return items.filter((item) => {
      if (categoryId !== 'all' && item.categoryId !== categoryId) return false;
      return !keyword || [item.title, item.summary, item.source, item.categoryLabel]
        .some((value) => value?.toLocaleLowerCase('zh-CN').includes(keyword));
    });
  }, [categoryId, items, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const unavailable = state === 'unavailable';

  useEffect(() => {
    setPage(1);
  }, [categoryId, query]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    if (!selected) setPreviewOpen(false);
  }, [selected]);

  return (
    <section className="bid-market-library">
      <header className="bid-market-library__header">
        <p>
          管理员统一维护投标行情资料，支持文章、视频、文档上传与归类，
          用户可直接查看已归类内容。
        </p>
        <div className="bid-market-library__actions">
          <button
            aria-label="刷新投标行情库"
            disabled={!onRefresh || state === 'loading'}
            type="button"
            onClick={() => void onRefresh?.()}
          >
            <RefreshCw aria-hidden="true" size={17} />
          </button>
          <button
            className="is-primary"
            ref={uploadTriggerRef}
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            <Upload aria-hidden="true" size={17} />
            上传资料
          </button>
        </div>
      </header>

      <div className="bid-market-library__filters">
        <label className="bid-market-library__search">
          <Search aria-hidden="true" size={18} />
          <span className="bid-market-library__sr-only">搜索行情库</span>
          <input
            value={query}
            placeholder="搜索标题、内容或来源"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>

      <nav className="bid-market-library__categories" aria-label="投标行情资料分类">
        <button
          className={categoryId === 'all' ? 'is-active' : ''}
          type="button"
          onClick={() => setCategoryId('all')}
        >
          全部
          {state === 'ready' ? <em>{items.length}</em> : null}
        </button>
        {categories.map((category) => {
          const count = category.count
            ?? items.filter((item) => item.categoryId === category.id).length;
          return (
            <button
              className={categoryId === category.id ? 'is-active' : ''}
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
            >
              {category.label}
              {state === 'ready' ? <em>{count}</em> : null}
            </button>
          );
        })}
      </nav>

      {unavailable ? (
        <div className="bid-market-library__notice" role="status">
          <CircleAlert aria-hidden="true" size={18} />
          <span>
            <strong>行情库服务暂未接入</strong>
            {unavailableMessage ?? '待后端接口可用后将展示真实资料。'}
          </span>
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="bid-market-library__notice is-error" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>
            <strong>行情库加载失败</strong>
            {errorMessage ?? '请稍后重试。'}
          </span>
        </div>
      ) : null}

      <div className="bid-market-library__workspace">
        <section aria-label="投标行情资料列表" className="bid-market-library__results">
          {state === 'loading' ? (
            <LibraryState icon={LoaderCircle} title="正在加载投标行情资料…" loading />
          ) : (
            <ContentTable
              items={state === 'ready' ? visibleItems : []}
              selectedId={selected?.id}
              state={state}
              onSelect={setSelectedId}
            />
          )}
          <footer className="bid-market-library__pagination">
            <span>共 {filtered.length} 条</span>
            <div>
              <button
                aria-label="上一页"
                disabled={page <= 1 || state !== 'ready'}
                type="button"
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft aria-hidden="true" size={16} />
              </button>
              <span>{page} / {pageCount}</span>
              <button
                aria-label="下一页"
                disabled={page >= pageCount || state !== 'ready'}
                type="button"
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            </div>
          </footer>
        </section>

        <aside className="bid-market-library__preview-pane">
          <header>
            <span>资料预览</span>
            <small>{selected ? contentTypeLabel(selected) : '未选择'}</small>
          </header>
          {selected ? (
            <PreviewSummary
              item={selected}
              triggerRef={previewTriggerRef}
              onOpen={() => setPreviewOpen(true)}
            />
          ) : (
            <LibraryState
              icon={FileText}
              title="请选择资料"
              description="选择左侧表格中的资料后，可在这里查看摘要。"
            />
          )}
        </aside>
      </div>

      {previewOpen && selected ? (
        <PreviewDialog
          item={selected}
          returnFocusRef={previewTriggerRef}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
      {uploadOpen ? (
        <UploadDialog
          categories={categories}
          disabled={unavailable || !onUpload}
          returnFocusRef={uploadTriggerRef}
          onClose={() => setUploadOpen(false)}
          onUpload={onUpload}
        />
      ) : null}
    </section>
  );
}

function ContentTable({
  items,
  selectedId,
  state,
  onSelect,
}: {
  items: BidMarketContent[];
  selectedId?: string;
  state: BidMarketLibraryProps['state'];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bid-market-library__table-wrap">
      <table>
        <thead>
          <tr>
            <th>标题</th>
            <th>资料类型</th>
            <th>所属分类</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? items.map((item) => {
            const meta = kindMeta[item.kind];
            return (
              <tr
                className={selectedId === item.id ? 'is-selected' : ''}
                key={item.id}
              >
                <td>
                  <strong>{item.title}</strong>
                  <small>{item.source || '来源未提供'}</small>
                </td>
                <td>
                  <span className={`bid-market-kind bid-market-kind--${item.kind}`}>
                    <meta.Icon aria-hidden="true" size={15} />
                    {contentTypeLabel(item)}
                  </span>
                </td>
                <td>{item.categoryLabel}</td>
                <td>{contentUpdatedAt(item)}</td>
                <td>
                  <button
                    aria-label={`预览${item.title}`}
                    type="button"
                    onClick={() => onSelect(item.id)}
                  >
                    预览
                  </button>
                </td>
              </tr>
            );
          }) : (
            <tr className="bid-market-library__empty-row">
              <td colSpan={5}>
                {state === 'ready'
                  ? '暂无匹配资料，请调整搜索词或分类条件。'
                  : '暂无可展示资料，页面将在取得真实数据后更新。'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PreviewSummary({
  item,
  triggerRef,
  onOpen,
}: {
  item: BidMarketContent;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
}) {
  const Icon = kindMeta[item.kind].Icon;
  const thumbnailUrl = safeResourceUrl(item.thumbnailUrl);
  return (
    <div className="bid-market-library__preview-summary">
      {thumbnailUrl ? (
        <img alt="" src={thumbnailUrl} />
      ) : (
        <span className={`bid-market-card__icon bid-market-card__icon--${item.kind}`}>
          <Icon aria-hidden="true" size={25} />
        </span>
      )}
      <h3>{item.title}</h3>
      <p>{item.summary || '暂无摘要'}</p>
      <dl>
        <div><dt>资料类型</dt><dd>{contentTypeLabel(item)}</dd></div>
        <div><dt>所属分类</dt><dd>{item.categoryLabel}</dd></div>
        <div><dt>来源</dt><dd>{item.source || '未提供'}</dd></div>
        <div><dt>更新时间</dt><dd>{contentUpdatedAt(item)}</dd></div>
      </dl>
      <button className="is-primary" ref={triggerRef} type="button" onClick={onOpen}>
        打开预览
      </button>
    </div>
  );
}

function LibraryState({
  icon: Icon,
  title,
  description,
  loading = false,
}: {
  icon: typeof FolderOpen;
  title: string;
  description?: string;
  loading?: boolean;
}) {
  return (
    <div className={`bid-market-library__state${loading ? ' is-loading' : ''}`} role="status">
      <Icon aria-hidden="true" size={30} />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function PreviewDialog({
  item,
  returnFocusRef,
  onClose,
}: {
  item: BidMarketContent;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const meta = kindMeta[item.kind];
  const previewUrl = safeResourceUrl(item.previewUrl);
  const dialogRef = useRef<HTMLElement>(null);
  useModal(dialogRef, onClose, true, returnFocusRef);

  return (
    <div className="bid-market-dialog-layer">
      <button
        aria-label="关闭资料预览"
        className="bid-market-dialog__backdrop"
        type="button"
        onClick={onClose}
      />
      <section
        aria-label={`${item.title}预览`}
        aria-modal="true"
        className="bid-market-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <span>{contentTypeLabel(item)} · {item.categoryLabel}</span>
            <h2>{item.title}</h2>
          </div>
          <button autoFocus aria-label="关闭资料预览" type="button" onClick={onClose}>
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="bid-market-dialog__content">
          {item.kind === 'video' && previewUrl ? (
            <video controls src={previewUrl} />
          ) : null}
          {item.kind !== 'video' && previewUrl ? (
            <iframe
              referrerPolicy="no-referrer"
              sandbox=""
              src={previewUrl}
              title={`${item.title}内容`}
            />
          ) : null}
          {!previewUrl && item.body ? <p>{item.body}</p> : null}
          {!previewUrl && !item.body ? (
            <LibraryState
              icon={meta.Icon}
              title="暂无可预览内容"
              description={item.previewUrl
                ? '服务端返回的预览地址无效。'
                : '服务端尚未返回该资料的预览内容。'}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function UploadDialog({
  categories,
  disabled,
  returnFocusRef,
  onClose,
  onUpload,
}: {
  categories: BidMarketCategory[];
  disabled: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onUpload?: BidMarketLibraryProps['onUpload'];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  const busy = status === 'loading';
  useModal(dialogRef, onClose, !busy, returnFocusRef);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || !onUpload || !categoryId || files.length === 0) return;
    setStatus('loading');
    setMessage('');
    try {
      const result = await onUpload(files, categoryId);
      setStatus('success');
      setFiles([]);
      setMessage(result?.message ?? '资料已提交。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '上传失败，请重试。');
    }
  };

  return (
    <div className="bid-market-dialog-layer">
      <button
        aria-label="关闭上传窗口"
        className="bid-market-dialog__backdrop"
        disabled={busy}
        type="button"
        onClick={onClose}
      />
      <form
        aria-label="上传行情资料"
        aria-modal="true"
        className="bid-market-dialog bid-market-upload"
        ref={dialogRef}
        role="dialog"
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <div>
            <span>内容库</span>
            <h2>上传行情资料</h2>
          </div>
          <button
            autoFocus
            aria-label="关闭上传窗口"
            disabled={busy}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="bid-market-upload__form">
          <label>
            <span>资料分类</span>
            <select
              disabled={disabled || busy || categories.length === 0}
              value={categoryId}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
            >
              <option value="">请选择</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
          </label>
          <label className="bid-market-upload__file">
            <Upload aria-hidden="true" size={24} />
            <strong>{files.length ? `已选择 ${files.length} 个文件` : '选择文章、视频或文档'}</strong>
            <span>支持常见文档、图片及 MP4、MOV、WebM 视频</span>
            <input
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.mp4,.mov,.webm,image/*"
              disabled={disabled || busy}
              multiple
              type="file"
              onChange={(event) => {
                setFiles(Array.from(event.currentTarget.files ?? []));
                setStatus('idle');
                setMessage('');
              }}
            />
          </label>
          {disabled ? <p role="status">后端上传接口暂未可用。</p> : null}
          {message ? (
            <p className={status === 'error' ? 'is-error' : ''} role="status">{message}</p>
          ) : null}
          <button
            className="is-primary"
            disabled={disabled || status === 'loading' || !categoryId || files.length === 0}
            type="submit"
          >
            {status === 'loading' ? '上传中…' : '确认上传'}
          </button>
        </div>
      </form>
    </div>
  );
}

function contentTypeLabel(item: BidMarketContent) {
  return item.typeLabel?.trim() || item.fileType?.trim() || kindMeta[item.kind].label;
}

function contentUpdatedAt(item: BidMarketContent) {
  return item.updatedAt?.trim() || item.publishedAt?.trim() || '—';
}

function safeResourceUrl(value?: string) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function useModal<T extends HTMLElement>(
  dialogRef: RefObject<T | null>,
  onClose: () => void,
  canClose = true,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  onCloseRef.current = onClose;
  canCloseRef.current = canClose;

  useEffect(() => {
    const restoreTarget = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreTarget?.focus();
    };
  }, [dialogRef, returnFocusRef]);
}
