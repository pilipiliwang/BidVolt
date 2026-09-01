import {
  AlertCircle,
  CheckCircle2,
  FileLock2,
  FileText,
  Link2,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import {
  useId,
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
  required?: boolean;
  selectedNames?: string[];
  title: string;
};

type EnhancedProjectMaterialUploadProps = ProjectMaterialUploadProps & {
  existingBidFileNames?: string[];
  onExistingBidUpload?: (files: File[]) => Promise<void> | void;
  onImportTenderNoticeUrl?: (
    projectId: string,
    url: string,
  ) => Promise<TenderNoticeUrlImportResult | void>;
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
  required = false,
  selectedNames = [],
  title,
}: UploadCardProps) {
  const inputId = useId();
  const [uploadState, setUploadState] = useState<{
    message: string;
    type: 'error' | 'idle' | 'loading' | 'success';
  }>({ message: '', type: 'idle' });

  const submitFiles = async (files: FileList | null) => {
    if (!files?.length || uploadState.type === 'loading') return;
    try {
      validateUploadFiles(files, accept);
      setUploadState({ message: '正在上传文件…', type: 'loading' });
      await onFiles(files);
      setUploadState({ message: '文件上传完成，解析状态将从服务端刷新。', type: 'success' });
    } catch (error) {
      setUploadState({
        message: error instanceof Error && error.message
          ? error.message
          : '文件上传失败，请重试。',
        type: 'error',
      });
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

  const isUploading = uploadState.type === 'loading';

  return (
    <article className="project-upload-card">
      <header>
        <div>
          <h2>{title} <em>{required ? '必传' : '可选'}</em></h2>
          <p>{description}</p>
        </div>
        <span className={required ? 'project-upload-card__scope' : 'project-upload-card__scope project-upload-card__scope--optional'}>
          <FileLock2 aria-hidden="true" size={13} />
          当前项目
        </span>
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

      {uploadState.type !== 'idle' && (
        <p
          className={`project-upload-card__message project-upload-card__message--${uploadState.type}`}
          role={uploadState.type === 'error' ? 'alert' : 'status'}
        >
          {uploadState.type === 'error'
            ? <AlertCircle aria-hidden="true" size={14} />
            : uploadState.type === 'success'
              ? <CheckCircle2 aria-hidden="true" size={14} />
              : <LoaderCircle aria-hidden="true" size={14} />}
          {uploadState.message}
        </p>
      )}

      {selectedNames.length > 0 && (
        <ul className="project-upload-card__selected" aria-label={`${title}已选择文件`}>
          {selectedNames.map((name, index) => (
            <li key={`${name}-${index}`}>
              <FileText aria-hidden="true" size={14} />
              <span>{name}</span>
              <CheckCircle2 aria-hidden="true" size={14} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

const LOCAL_HOST_NAMES = new Set(['localhost', 'localhost.localdomain', '0.0.0.0']);

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
  const trimmedValue = value.trim();
  if (!trimmedValue) return { error: '请输入招标公告网页地址。' };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
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
  projectId,
  onImport,
}: {
  projectId: string;
  onImport?: EnhancedProjectMaterialUploadProps['onImportTenderNoticeUrl'];
}) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState<
    { message: string; type: 'error' | 'idle' | 'loading' | 'success' }
  >({ message: '', type: 'idle' });

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

  return (
    <div className="project-tender-url-import">
      <div className="project-tender-url-import__heading">
        <span aria-hidden="true"><Link2 size={18} /></span>
        <div>
          <strong>粘贴招标公告网址</strong>
          <small>适用于可公开访问的招标公告网页，系统将在服务端下载附件并开始解析。</small>
        </div>
      </div>
      <form className="project-tender-url-import__form" noValidate onSubmit={handleSubmit}>
        <label className="project-material-visually-hidden" htmlFor={inputId}>招标公告网址</label>
        <div className="project-tender-url-import__control">
          <Link2 aria-hidden="true" size={16} />
          <input
            id={inputId}
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
          />
        </div>
        <button disabled={isLoading} type="submit">
          {isLoading ? <LoaderCircle aria-hidden="true" size={16} /> : <Link2 aria-hidden="true" size={16} />}
          {isLoading ? '正在导入…' : '导入并解析'}
        </button>
      </form>
      <p className="project-tender-url-import__security">
        <ShieldCheck aria-hidden="true" size={14} />
        仅允许公开 HTTP/HTTPS 地址；本机、内网地址将被拒绝，服务端还会再次执行安全校验。
      </p>
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
      <div className="project-tender-url-import__divider"><span>或手动上传招标公告文件</span></div>
    </div>
  );
}

function toFiles(files: FileList | null): File[] {
  return Array.from(files ?? []);
}

export function ProjectMaterialUpload({
  projectId,
  projectName,
  onUpload,
  existingBidFileNames = [],
  onExistingBidUpload,
  onImportTenderNoticeUrl,
}: EnhancedProjectMaterialUploadProps) {
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

  return (
    <section className="project-material-upload" aria-labelledby="project-material-upload-title">
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
          onFiles={dispatchProjectFiles}
        >
          <TenderNoticeUrlImporter
            projectId={projectId}
            onImport={onImportTenderNoticeUrl}
          />
        </UploadCard>
        <UploadCard
          title="已制作完成的标书"
          description="如已有商务标、技术标或报价单，可上传后直接进入校核。"
          inputLabel="选择或拖拽已制作完成的标书"
          accept={BACKEND_UPLOAD_ACCEPT}
          selectedNames={existingBidFileNames}
          onFiles={dispatchExistingBidFiles}
        />
      </div>
    </section>
  );
}
