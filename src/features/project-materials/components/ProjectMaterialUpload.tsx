import {
  AlertCircle,
  CheckCircle2,
  FileLock2,
  FileText,
  Link2,
  LoaderCircle,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  useId,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import type { ProjectMaterialUploadProps } from '../types';

type UploadCardProps = {
  accept: string;
  children?: ReactNode;
  description: string;
  inputLabel: string;
  onFiles: (files: FileList | null) => Promise<void> | void;
  onRemoveFile?: (fileId: string, fileName: string) => Promise<void> | void;
  persistedFiles?: PersistedUploadItem[];
  required?: boolean;
  selectedNames?: string[];
  showImmediateStatus?: boolean;
  showSelectedFiles?: boolean;
  showScope?: boolean;
  title: string;
  onUploadItemsChange?: (items: LocalUploadItem[]) => void;
};

function normalizeUploadFileName(fileName: string) {
  return fileName.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();
}

type PersistedUploadItem = { id: string; name: string };

type LocalUploadItem = {
  id: string;
  name: string;
  status: 'error' | 'success' | 'uploading';
};

function MaterialDeleteDialog({
  fileName,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="project-material-confirm" role="presentation">
      <button
        aria-label="取消删除"
        className="project-material-confirm__backdrop"
        disabled={isDeleting}
        onClick={onCancel}
        type="button"
      />
      <section aria-labelledby="project-material-confirm-title" aria-modal="true" className="project-material-confirm__dialog" role="dialog">
        <span className="project-material-confirm__icon" aria-hidden="true"><Trash2 size={22} /></span>
        <div>
          <h2 id="project-material-confirm-title">删除项目材料</h2>
          <p>确定删除“{fileName}”吗？删除后需重新上传。</p>
        </div>
        <footer>
          <button disabled={isDeleting} onClick={onCancel} type="button">取消</button>
          <button className="is-danger" disabled={isDeleting} onClick={onConfirm} type="button">
            {isDeleting ? <LoaderCircle aria-hidden="true" size={15} /> : null}
            {isDeleting ? '删除中…' : '确认删除'}
          </button>
        </footer>
      </section>
    </div>
  );
}

type EnhancedProjectMaterialUploadProps = ProjectMaterialUploadProps & {
  generationActions?: ReactNode;
  existingBidFileNames?: string[];
  mode?: 'generation' | 'legacy';
  onExistingBidUpload?: (files: File[]) => Promise<void> | void;
  onSupplementalUpload?: (files: File[]) => Promise<void> | void;
  onImportTenderNoticeUrl?: (
    projectId: string,
    url: string,
  ) => Promise<TenderNoticeUrlImportResult | void>;
  supplementalFileNames?: string[];
  supplementalFiles?: PersistedUploadItem[];
  tenderFileNames?: string[];
  tenderFiles?: PersistedUploadItem[];
  urlImportedFiles?: PersistedUploadItem[];
};

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const BACKEND_UPLOAD_ACCEPT = '.pdf,.ofd,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.jpg,.jpeg,.png,.bmp,.tiff,.zip,.html,.htm';

function validateUploadFiles(files: FileList, accept: string) {
  const acceptedExtensions = new Set(
    accept
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.startsWith('.')),
  );

  for (const file of Array.from(files)) {
    const extension = file.name.includes('.')
      ? `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
      : '';
    if (acceptedExtensions.size > 0 && !acceptedExtensions.has(extension)) {
      throw new Error(`${file.name}：不支持该文件格式`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${file.name}：单个文件不能超过 500MB`);
    }
  }
}

export type TenderNoticeUrlImportResult = {
  message?: string;
  status?: 'queued' | 'processing' | 'completed';
};

function UploadCard({
  accept,
  children,
  description,
  inputLabel,
  onFiles,
  onRemoveFile,
  persistedFiles = [],
  required = false,
  selectedNames = [],
  showImmediateStatus = true,
  showSelectedFiles = true,
  showScope = true,
  title,
  onUploadItemsChange,
}: UploadCardProps) {
  const inputId = useId();
  const uploadSequenceRef = useRef(0);
  const [localUploadItems, setLocalUploadItems] = useState<LocalUploadItem[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [removingFileIds, setRemovingFileIds] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<PersistedUploadItem | null>(null);
  const isUploading = localUploadItems.some((item) => item.status === 'uploading');

  useEffect(() => {
    onUploadItemsChange?.(localUploadItems);
  }, [localUploadItems, onUploadItemsChange]);

  const persistedFileNameKey = persistedFiles
    .map((item) => normalizeUploadFileName(item.name))
    .sort()
    .join('\u0000');

  useEffect(() => {
    if (!persistedFileNameKey) return;
    const persistedNames = new Set(persistedFileNameKey.split('\u0000'));
    const hasPersistedEcho = localUploadItems.some((item) => (
      item.status === 'success' && persistedNames.has(normalizeUploadFileName(item.name))
    ));
    if (!hasPersistedEcho) return;
    setLocalUploadItems((current) => current.filter((item) => (
      item.status !== 'success' || !persistedNames.has(normalizeUploadFileName(item.name))
    )));
  }, [localUploadItems, persistedFileNameKey]);

  const submitFiles = async (files: FileList | null) => {
    if (!files?.length || isUploading) return;
    const selectedFiles = Array.from(files);
    try {
      validateUploadFiles(files, accept);
    } catch (error) {
      setUploadError(error instanceof Error && error.message
        ? error.message
        : '文件校验失败，请重新选择。');
      return;
    }

    const uploadSequence = ++uploadSequenceRef.current;
    const selectedNames = new Set(selectedFiles.map((file) => file.name));
    const pendingItems = selectedFiles.map((file, index): LocalUploadItem => ({
      id: `${uploadSequence}-${index}`,
      name: file.name,
      status: 'uploading',
    }));
    const pendingIds = new Set(pendingItems.map((item) => item.id));
    setUploadError('');
    setLocalUploadItems((current) => [
      ...current.filter((item) => !selectedNames.has(item.name)),
      ...pendingItems,
    ]);

    try {
      await onFiles(files);
      setLocalUploadItems((current) => current.map((item) => (
        pendingIds.has(item.id) ? { ...item, status: 'success' } : item
      )));
    } catch (error) {
      setLocalUploadItems((current) => current.map((item) => (
        pendingIds.has(item.id) ? { ...item, status: 'error' } : item
      )));
      setUploadError(error instanceof Error && error.message
        ? error.message
        : '文件上传失败，请重试。');
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    void submitFiles(files);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void submitFiles(event.dataTransfer.files);
  };

  const persistedNamesSet = new Set(persistedFiles.map((item) => normalizeUploadFileName(item.name)));
  const visibleLocalUploadItems = showImmediateStatus
    ? localUploadItems.filter((item) => (
        item.status !== 'success' || !persistedNamesSet.has(normalizeUploadFileName(item.name))
      ))
    : [];
  const locallySelectedNames = new Set(visibleLocalUploadItems.map((item) => item.name));
  const normalizedPersistedFiles = persistedFiles.length > 0
    ? persistedFiles
    : selectedNames.map((name, index) => ({ id: '', name: `${name}\u0000${index}` }));
  const visiblePersistedFiles = normalizedPersistedFiles
    .map((item) => ({ ...item, name: item.name.split('\u0000')[0] }))
    .filter((item) => !locallySelectedNames.has(item.name));
  const hasSelectedFiles = visibleLocalUploadItems.length > 0 || visiblePersistedFiles.length > 0;

  const removeFile = async (file: PersistedUploadItem) => {
    if (!file.id || !onRemoveFile || removingFileIds.has(file.id)) return;
    setRemovingFileIds((current) => new Set(current).add(file.id));
    setUploadError('');
    try {
      await onRemoveFile(file.id, file.name);
    } catch (error) {
      setUploadError(error instanceof Error && error.message ? error.message : '材料删除失败，请重试。');
    } finally {
      setPendingRemoval(null);
      setRemovingFileIds((current) => {
        const next = new Set(current);
        next.delete(file.id);
        return next;
      });
    }
  };

  return (
    <>
    <article className="project-upload-card">
      <header>
        <div>
          <h2>{title} <em className={required ? 'is-required' : 'is-optional'}>{required ? '必填' : '可选'}</em></h2>
          <p>{description}</p>
        </div>
        {showScope ? (
          <span className={required ? 'project-upload-card__scope' : 'project-upload-card__scope project-upload-card__scope--optional'}>
            <FileLock2 aria-hidden="true" size={13} />
            当前项目
          </span>
        ) : null}
      </header>

      {children}

      <label
        aria-disabled={isUploading}
        className={`project-material-dropzone${isUploading ? ' project-material-dropzone--uploading' : ''}`}
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="project-material-dropzone__icon" aria-hidden="true">
          <UploadCloud size={30} strokeWidth={2.2} />
        </span>
        <span>
          <strong>点击或拖拽文件到此处上传</strong>
          <small>支持 PDF、Word、Excel、PPT、图片与 ZIP，单个文件不超过 500MB；RAR/7Z 暂不支持解包</small>
        </span>
        <em>选择文件</em>
      </label>
      <input
        id={inputId}
        aria-label={inputLabel}
        className="project-material-visually-hidden"
        type="file"
        multiple
        accept={accept}
        disabled={isUploading}
        onChange={handleChange}
      />

      {uploadError ? <p className="project-upload-card__error" role="alert">{uploadError}</p> : null}

      {showSelectedFiles && hasSelectedFiles && (
        <ul className="project-upload-card__selected" aria-label={`${title}已选择文件`}>
          {visibleLocalUploadItems.map((item) => (
            <li key={item.id}>
              <FileText aria-hidden="true" size={14} />
              <span>{item.name}</span>
              <span
                aria-label={`${item.name}${item.status === 'uploading'
                  ? '上传中'
                  : item.status === 'success'
                    ? '上传成功'
                    : '上传失败'}`}
                className={`project-upload-card__selected-status project-upload-card__selected-status--${item.status}`}
                role="img"
              >
                {item.status === 'uploading'
                  ? <LoaderCircle aria-hidden="true" size={14} />
                  : item.status === 'success'
                    ? <CheckCircle2 aria-hidden="true" size={14} />
                    : <AlertCircle aria-hidden="true" size={14} />}
              </span>
            </li>
          ))}
          {visiblePersistedFiles.map((file, index) => (
            <li key={file.id || `${file.name}-${index}`}>
              <FileText aria-hidden="true" size={14} />
              <span>{file.name}</span>
              <span
                aria-label={`${file.name}已上传`}
                className="project-upload-card__selected-status project-upload-card__selected-status--success"
                role="img"
              >
                <CheckCircle2 aria-hidden="true" size={14} />
              </span>
              {file.id && onRemoveFile ? (
                <button
                  aria-label={`删除${file.name}`}
                  className="project-upload-card__remove"
                  disabled={removingFileIds.has(file.id)}
                  onClick={() => setPendingRemoval(file)}
                  type="button"
                >
                  {removingFileIds.has(file.id)
                    ? <LoaderCircle aria-hidden="true" size={14} />
                    : <Trash2 aria-hidden="true" size={14} />}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
    {pendingRemoval ? (
      <MaterialDeleteDialog
        fileName={pendingRemoval.name}
        isDeleting={removingFileIds.has(pendingRemoval.id)}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => void removeFile(pendingRemoval)}
      />
    ) : null}
    </>
  );
}

const LOCAL_HOST_NAMES = new Set(['localhost', 'localhost.localdomain', '0.0.0.0']);
const URL_EDGE_ARTIFACTS = /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/gu;

export function normalizeTenderNoticeUrlInput(value: string): string {
  return value.replace(URL_EDGE_ARTIFACTS, '');
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  const [first, second] = octets;
  return (
    first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!value.includes(':')) return false;
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;

  const firstHextet = Number.parseInt(value.split(':')[0] || '0', 16);
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;

  const mappedIpv4 = value.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

export function validateTenderNoticeUrl(value: string): { error?: string; url?: string } {
  const normalizedValue = normalizeTenderNoticeUrlInput(value);
  if (!normalizedValue) return { error: '请输入招标公告网页地址。' };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    return { error: '网址格式不正确，请输入完整的 http:// 或 https:// 地址。' };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { error: '仅支持 http:// 或 https:// 开头的公开网页地址。' };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { error: '网址不能包含用户名或密码。' };
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (
    LOCAL_HOST_NAMES.has(hostname)
    || hostname.endsWith('.localhost')
    || isPrivateIpv4(hostname)
    || isPrivateIpv6(hostname)
  ) {
    return { error: '为保障安全，不能导入本机、内网或私有网络地址。' };
  }

  return { url: parsedUrl.toString() };
}

function TenderNoticeUrlImporter({
  importedFiles = [],
  onRemoveFile,
  projectId,
  onImport,
  showImportedFiles = true,
  standalone = false,
}: {
  importedFiles?: PersistedUploadItem[];
  onRemoveFile?: (fileId: string, fileName: string) => Promise<void> | void;
  projectId: string;
  onImport?: EnhancedProjectMaterialUploadProps['onImportTenderNoticeUrl'];
  showImportedFiles?: boolean;
  standalone?: boolean;
}) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState<
    { message: string; type: 'error' | 'idle' | 'loading' | 'success' }
  >({ message: '', type: 'idle' });
  const [removeError, setRemoveError] = useState('');
  const [removingFileIds, setRemovingFileIds] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<PersistedUploadItem | null>(null);
  const normalizedValue = normalizeTenderNoticeUrlInput(value);
  const liveValidation = validateTenderNoticeUrl(value);
  const hasValue = normalizedValue.length > 0;
  const isUrlValid = Boolean(liveValidation.url);
  const helperId = `${inputId}-help`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateTenderNoticeUrl(value);
    if (!validation.url) {
      setState({ message: validation.error ?? '网址无效。', type: 'error' });
      return;
    }

    if (!onImport) {
      setState({ message: '当前环境尚未配置网址导入接口，请联系管理员。', type: 'error' });
      return;
    }

    setState({ message: '正在提交网址，请稍候…', type: 'loading' });
    try {
      const result = await onImport(projectId, validation.url);
      setValue('');
      setState({
        message: result?.message ?? '已提交，系统将下载并解析招标公告。',
        type: 'success',
      });
    } catch (error) {
      setState({
        message: error instanceof Error && error.message
          ? error.message
          : '网址导入失败，请检查地址后重试。',
        type: 'error',
      });
    }
  };

  const isLoading = state.type === 'loading';

  const removeImportedFile = async (file: PersistedUploadItem) => {
    if (!onRemoveFile || removingFileIds.has(file.id)) return;
    setRemovingFileIds((current) => new Set(current).add(file.id));
    setRemoveError('');
    try {
      await onRemoveFile(file.id, file.name);
    } catch (error) {
      setRemoveError(error instanceof Error && error.message ? error.message : '材料删除失败，请重试。');
    } finally {
      setPendingRemoval(null);
      setRemovingFileIds((current) => {
        const next = new Set(current);
        next.delete(file.id);
        return next;
      });
    }
  };

  return (
    <>
    <section
      aria-label="粘贴招标公告地址"
      className={`project-tender-url-import${standalone ? ' project-tender-url-import--card' : ''}`}
    >
      {standalone ? <div className="project-tender-url-import__heading">
        <div>
          {standalone ? <h2>粘贴招标公告地址 <em className="is-optional">可选</em></h2> : <strong>粘贴招标公告网址</strong>}
          <small>适用于可公开访问的招标公告网页，系统将在服务端下载附件并开始解析。</small>
        </div>
      </div> : null}
      <form className="project-tender-url-import__form" noValidate onSubmit={handleSubmit}>
        <label className="project-material-visually-hidden" htmlFor={inputId}>招标公告网址</label>
        <div className="project-tender-url-import__control">
          <Link2 aria-hidden="true" size={16} />
          <input
            id={inputId}
            aria-describedby={hasValue ? helperId : undefined}
            aria-invalid={hasValue && !isUrlValid ? true : undefined}
            autoComplete="url"
            disabled={isLoading}
            inputMode="url"
            placeholder="https://example.gov.cn/tender/notice/123"
            type="url"
            value={value}
            onChange={(event) => {
              setValue(event.currentTarget.value);
              if (state.type !== 'idle') setState({ message: '', type: 'idle' });
            }}
            onBlur={() => {
              if (normalizedValue !== value) setValue(normalizedValue);
            }}
          />
        </div>
        <button
          className={isLoading ? 'is-loading' : undefined}
          disabled={isLoading || !isUrlValid || !onImport}
          type="submit"
        >
          {isLoading ? <LoaderCircle aria-hidden="true" size={16} /> : <Link2 aria-hidden="true" size={16} />}
          {isLoading ? '正在导入…' : '导入并解析'}
        </button>
      </form>
      {hasValue && state.type !== 'success' ? <p
        className={`project-tender-url-import__security${
          isUrlValid
            ? ' project-tender-url-import__security--valid'
            : hasValue
              ? ' project-tender-url-import__security--invalid'
              : ''
        }`}
        id={helperId}
        role={hasValue && !isUrlValid ? 'alert' : undefined}
      >
        {isUrlValid
          ? <CheckCircle2 aria-hidden="true" size={14} />
          : <AlertCircle aria-hidden="true" size={14} />}
        {isUrlValid
          ? '网址格式正确，可提交服务端检查并导入。'
          : liveValidation.error}
      </p> : null}
      {state.type !== 'idle' && (
        <p
          className={`project-tender-url-import__message project-tender-url-import__message--${state.type}`}
          role={state.type === 'error' ? 'alert' : 'status'}
        >
          {state.type === 'error'
            ? <AlertCircle aria-hidden="true" size={14} />
            : state.type === 'success'
              ? <CheckCircle2 aria-hidden="true" size={14} />
              : <LoaderCircle aria-hidden="true" size={14} />}
          {state.message}
        </p>
      )}
      {standalone ? null : (
        <div className="project-tender-url-import__divider"><span>或手动上传招标公告文件</span></div>
      )}
      {showImportedFiles && importedFiles.length > 0 ? (
        <ul className="project-upload-card__selected project-tender-url-import__files" aria-label="公告地址导入文件">
          {importedFiles.map((file) => (
            <li key={file.id}>
              <FileText aria-hidden="true" size={14} />
              <span>{file.name}</span>
              <span aria-label={`${file.name}已上传`} className="project-upload-card__selected-status project-upload-card__selected-status--success" role="img">
                <CheckCircle2 aria-hidden="true" size={14} />
              </span>
              {onRemoveFile ? (
                <button
                  aria-label={`删除${file.name}`}
                  className="project-upload-card__remove"
                  disabled={removingFileIds.has(file.id)}
                  onClick={() => setPendingRemoval(file)}
                  type="button"
                >
                  {removingFileIds.has(file.id) ? <LoaderCircle aria-hidden="true" size={14} /> : <Trash2 aria-hidden="true" size={14} />}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {removeError ? <p className="project-tender-url-import__message project-tender-url-import__message--error" role="alert">{removeError}</p> : null}
    </section>
    {pendingRemoval ? (
      <MaterialDeleteDialog
        fileName={pendingRemoval.name}
        isDeleting={removingFileIds.has(pendingRemoval.id)}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => void removeImportedFile(pendingRemoval)}
      />
    ) : null}
    </>
  );
}

function GenerationMaterialList({
  onRemoveFile,
  supplementalFiles,
  supplementalUploadItems,
  tenderFiles,
  tenderUploadItems,
}: {
  onRemoveFile?: (fileId: string, fileName: string) => Promise<void> | void;
  supplementalFiles: PersistedUploadItem[];
  supplementalUploadItems: LocalUploadItem[];
  tenderFiles: PersistedUploadItem[];
  tenderUploadItems: LocalUploadItem[];
}) {
  const [pendingRemoval, setPendingRemoval] = useState<PersistedUploadItem | null>(null);
  const [removingFileIds, setRemovingFileIds] = useState<Set<string>>(new Set());
  const [removeError, setRemoveError] = useState('');

  const removeFile = async (file: PersistedUploadItem) => {
    if (!onRemoveFile || removingFileIds.has(file.id)) return;
    setRemovingFileIds((current) => new Set(current).add(file.id));
    setRemoveError('');
    try {
      await onRemoveFile(file.id, file.name);
    } catch (error) {
      setRemoveError(error instanceof Error && error.message ? error.message : '材料删除失败，请重试。');
    } finally {
      setPendingRemoval(null);
      setRemovingFileIds((current) => {
        const next = new Set(current);
        next.delete(file.id);
        return next;
      });
    }
  };

  const renderGroup = (
    label: string,
    persistedItems: PersistedUploadItem[],
    localItems: LocalUploadItem[],
  ) => {
    const persistedNames = new Set(persistedItems.map((item) => normalizeUploadFileName(item.name)));
    const visibleLocalItems = localItems.filter((item) => (
      item.status !== 'success' || !persistedNames.has(normalizeUploadFileName(item.name))
    ));
    const itemCount = persistedItems.length + visibleLocalItems.length;

    return (
      <section className="project-generation-material-list__group">
        <h3>{label} <span>({itemCount})</span></h3>
        {itemCount > 0 ? (
          <ul aria-label={`${label}列表`}>
            {visibleLocalItems.map((item) => (
              <li key={item.id}>
                <FileText aria-hidden="true" size={17} />
                <span title={item.name}>{item.name}</span>
                <span
                  aria-label={`${item.name}${item.status === 'uploading' ? '上传中' : item.status === 'success' ? '上传成功' : '上传失败'}`}
                  className={`project-upload-card__selected-status project-upload-card__selected-status--${item.status}`}
                  role="img"
                >
                  {item.status === 'uploading'
                    ? <LoaderCircle aria-hidden="true" size={16} />
                    : item.status === 'success'
                      ? <CheckCircle2 aria-hidden="true" size={16} />
                      : <AlertCircle aria-hidden="true" size={16} />}
                </span>
              </li>
            ))}
            {persistedItems.map((file) => (
              <li key={file.id}>
                <FileText aria-hidden="true" size={17} />
                <span title={file.name}>{file.name}</span>
                <CheckCircle2 aria-label="已上传" className="project-generation-material-list__success" size={16} />
                {onRemoveFile ? (
                  <button
                    aria-label={`删除${file.name}`}
                    disabled={removingFileIds.has(file.id)}
                    onClick={() => setPendingRemoval(file)}
                    type="button"
                  >
                    {removingFileIds.has(file.id) ? <LoaderCircle size={15} /> : <Trash2 size={15} />}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p>暂无材料</p>}
      </section>
    );
  };

  return (
    <aside className="project-generation-material-list" aria-label="材料列表">
      <header><h2>材料列表</h2></header>
      <div className="project-generation-material-list__body">
        {renderGroup('招标材料', tenderFiles, tenderUploadItems)}
        {renderGroup('补充材料', supplementalFiles, supplementalUploadItems)}
      </div>
      {removeError ? <p className="project-generation-material-list__error" role="alert">{removeError}</p> : null}
      {pendingRemoval ? (
        <MaterialDeleteDialog
          fileName={pendingRemoval.name}
          isDeleting={removingFileIds.has(pendingRemoval.id)}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => void removeFile(pendingRemoval)}
        />
      ) : null}
    </aside>
  );
}

function toFiles(files: FileList | null): File[] {
  return Array.from(files ?? []);
}

export function ProjectMaterialUpload({
  generationActions,
  projectId,
  projectName,
  onUpload,
  onRemoveMaterial,
  existingBidFileNames = [],
  mode = 'legacy',
  onExistingBidUpload,
  onSupplementalUpload,
  onImportTenderNoticeUrl,
  supplementalFileNames = [],
  tenderFileNames = [],
  supplementalFiles = [],
  tenderFiles = [],
  urlImportedFiles = [],
}: EnhancedProjectMaterialUploadProps) {
  const [tenderUploadItems, setTenderUploadItems] = useState<LocalUploadItem[]>([]);
  const [supplementalUploadItems, setSupplementalUploadItems] = useState<LocalUploadItem[]>([]);
  const dispatchProjectFiles = async (files: FileList | null) => {
    const selectedFiles = toFiles(files);
    if (selectedFiles.length === 0) return;
    if (!onUpload) throw new Error('当前环境未配置项目材料上传能力。');
    await onUpload(projectId, selectedFiles);
  };

  const dispatchExistingBidFiles = async (files: FileList | null) => {
    const selectedFiles = toFiles(files);
    if (selectedFiles.length === 0) return;
    if (!onExistingBidUpload) throw new Error('当前环境未配置已完成标书上传能力。');
    await onExistingBidUpload(selectedFiles);
  };

  const dispatchSupplementalFiles = async (files: FileList | null) => {
    const selectedFiles = toFiles(files);
    if (selectedFiles.length === 0) return;
    if (!onSupplementalUpload) throw new Error('当前环境未配置补充资料上传能力。');
    await onSupplementalUpload(selectedFiles);
  };

  if (mode === 'generation') {
    const removeMaterial = onRemoveMaterial
      ? (fileId: string) => onRemoveMaterial(projectId, fileId)
      : undefined;

    return (
      <section className="project-material-upload project-material-upload--generation" aria-labelledby="project-material-upload-title">
        <h2 className="project-material-visually-hidden" id="project-material-upload-title">上传材料</h2>
        <div className="project-generation-upload-layout">
          <div className="project-upload-card-list">
            <UploadCard
              required
              title="上传招标材料"
              description="粘贴招标公告地址，或直接上传本项目招标文件。"
              inputLabel="选择或拖拽招标材料"
              accept={BACKEND_UPLOAD_ACCEPT}
              selectedNames={tenderFileNames}
              persistedFiles={tenderFiles}
              onUploadItemsChange={setTenderUploadItems}
              showSelectedFiles={false}
              showScope={false}
              onFiles={dispatchProjectFiles}
            >
              <TenderNoticeUrlImporter
                importedFiles={urlImportedFiles}
                projectId={projectId}
                onImport={onImportTenderNoticeUrl}
                showImportedFiles={false}
              />
            </UploadCard>
            <UploadCard
              title="上传补充材料"
              description="可补充本项目专用的说明、模板或参考文件。"
              inputLabel="选择或拖拽补充资料"
              accept={BACKEND_UPLOAD_ACCEPT}
              selectedNames={supplementalFileNames}
              persistedFiles={supplementalFiles}
              onUploadItemsChange={setSupplementalUploadItems}
              showSelectedFiles={false}
              showScope={false}
              onFiles={dispatchSupplementalFiles}
            />
          </div>
          <GenerationMaterialList
            onRemoveFile={removeMaterial}
            supplementalFiles={supplementalFiles}
            supplementalUploadItems={supplementalUploadItems}
            tenderFiles={[...tenderFiles, ...urlImportedFiles]}
            tenderUploadItems={tenderUploadItems}
          />
          {generationActions ? (
            <div className="project-generation-setup__actions">{generationActions}</div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="project-material-upload project-material-upload--legacy" aria-labelledby="project-material-upload-title">
      <div className="project-material-upload__heading">
        <span className="project-material-upload__icon" aria-hidden="true"><FileLock2 size={18} /></span>
        <div>
          <p className="project-material-eyebrow">资料上传</p>
          <h2 id="project-material-upload-title">本次任务文件</h2>
          <p>所有上传仅保存到“{projectName}”（{projectId}），不会写入企业资料库。</p>
        </div>
      </div>
      <div className="project-upload-card-list">
        <UploadCard
          required
          title="当前招标材料"
          description="上传本项目全部招标文件，AI 将自动识别并分类。"
          inputLabel="选择或拖拽招标材料"
          accept={BACKEND_UPLOAD_ACCEPT}
          selectedNames={tenderFileNames}
          onFiles={dispatchProjectFiles}
        >
          <TenderNoticeUrlImporter projectId={projectId} onImport={onImportTenderNoticeUrl} />
        </UploadCard>
        <UploadCard
          title="已制作完成的标书"
          description="如已有商务标、技术标或报价单，可上传后直接进入校核。"
          inputLabel="选择或拖拽已制作完成的标书"
          accept={BACKEND_UPLOAD_ACCEPT}
          selectedNames={existingBidFileNames}
          showImmediateStatus={false}
          onFiles={dispatchExistingBidFiles}
        />
      </div>
    </section>
  );
}
