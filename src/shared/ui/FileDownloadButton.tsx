import { Download, LoaderCircle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import './FileDownloadButton.css';

/** Keep the request promise alive so a slow package cannot be submitted twice. */
export function FileDownloadButton({ onDownload, className = '', disabled = false, title,
  label = '下载文件', pendingLabel = '正在下载…',
}: {
  onDownload: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  title?: string;
  label?: string;
  pendingLabel?: string;
}) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();
  const download = async () => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onDownload();
    } catch (caught) {
      setError(caught instanceof TypeError ? '下载连接失败，请稍后重试。'
        : caught instanceof Error ? caught.message : '下载失败，请重试。');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return <>
    <button aria-label={label} aria-busy={pending} aria-describedby={error ? errorId : undefined}
      className={`file-download-button ${className}`} disabled={disabled || pending}
      onClick={() => void download()} title={title || label} type="button">
      {pending ? <LoaderCircle aria-hidden="true" size={16} /> : <Download aria-hidden="true" size={16} />}
      <span role={pending ? 'status' : undefined}>{pending ? pendingLabel : label}</span>
    </button>
    {error ? <small className="file-download-error" id={errorId} role="alert">{error}</small> : null}
  </>;
}

export async function downloadFileUrl(url: string, filename: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`下载失败（${response.status}），请稍后重试。`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  // Legacy Office files can be converted to OOXML by the editing service.
  anchor.download = /wordprocessingml/.test(blob.type) ? filename.replace(/\.doc$/i, '.docx')
    : /spreadsheetml/.test(blob.type) ? filename.replace(/\.xls$/i, '.xlsx')
      : /presentationml/.test(blob.type) ? filename.replace(/\.ppt$/i, '.pptx') : filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
