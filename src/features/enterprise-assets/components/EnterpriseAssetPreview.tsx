import { Download, FileSearch, LoaderCircle, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { EnterpriseAssetPreview as EnterpriseAssetPreviewData } from '../types';

interface EnterpriseAssetPreviewProps {
  fileId?: string;
  fileName: string;
  onLoadPreview?: (fileId: string, fileName: string) => Promise<EnterpriseAssetPreviewData>;
  onDownloadFile?: (fileId: string, fileName: string) => Promise<void> | void;
}

export function EnterpriseAssetPreview({
  fileId,
  fileName,
  onLoadPreview,
  onDownloadFile,
}: EnterpriseAssetPreviewProps) {
  const [preview, setPreview] = useState<EnterpriseAssetPreviewData | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError('');
    if (!fileId || !onLoadPreview) return undefined;
    setIsLoading(true);
    void onLoadPreview(fileId, fileName).then((nextPreview) => {
      if (!cancelled) setPreview(nextPreview);
    }).catch((reason) => {
      if (!cancelled) {
        setError(reason instanceof Error && reason.message
          ? reason.message
          : '原件预览加载失败，请稍后重试。');
      }
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, fileName, onLoadPreview, retryNonce]);

  useEffect(() => {
    setPreviewUrl('');
    if (!preview || (preview.kind !== 'image' && preview.kind !== 'pdf')) return undefined;
    if (typeof URL.createObjectURL !== 'function') return undefined;
    const objectUrl = URL.createObjectURL(new Blob([preview.blob], { type: preview.mimeType }));
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview]);

  const download = async () => {
    if (!fileId || !onDownloadFile || isDownloading) return;
    setIsDownloading(true);
    setError('');
    try {
      await onDownloadFile(fileId, fileName);
    } catch (reason) {
      setError(reason instanceof Error && reason.message
        ? reason.message
        : '原文件下载失败，请稍后重试。');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!fileId) {
    return (
      <div className="enterprise-preview-state">
        <FileSearch aria-hidden="true" size={28} />
        <strong>暂无可预览原件</strong>
        <span>后端未返回该资料对应的源文件编号。</span>
      </div>
    );
  }

  return (
    <section className="enterprise-preview" aria-label={`${fileName}原件预览`}>
      <div className="enterprise-preview__toolbar">
        <span>文件编号 #{fileId}</span>
        {onDownloadFile ? (
          <button type="button" disabled={isDownloading} onClick={() => void download()}>
            <Download aria-hidden="true" size={16} />
            {isDownloading ? '下载中…' : '下载原文件'}
          </button>
        ) : null}
      </div>
      {isLoading ? (
        <div className="enterprise-preview-state" role="status">
          <LoaderCircle aria-hidden="true" size={26} />
          <strong>正在加载原件预览…</strong>
        </div>
      ) : null}
      {error ? (
        <div className="enterprise-preview-state enterprise-preview-state--error" role="alert">
          <strong>预览加载失败</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
            <RotateCw aria-hidden="true" size={15} />
            重新加载
          </button>
        </div>
      ) : null}
      {!isLoading && !error && preview?.kind === 'image' && previewUrl ? (
        <div className="enterprise-preview__image">
          <img src={previewUrl} alt={`${fileName}原件`} />
        </div>
      ) : null}
      {!isLoading && !error && preview?.kind === 'pdf' && previewUrl ? (
        <iframe className="enterprise-preview__pdf" src={previewUrl} title={`${fileName} PDF 预览`} />
      ) : null}
      {!isLoading && !error && preview?.kind === 'text' ? (
        preview.blocks.length > 0 ? (
          <div className="enterprise-preview__text" aria-label="解析文本预览">
            {preview.blocks.map((block) => (
              <article key={block.id}>
                {block.pageNo !== undefined ? <span>第 {block.pageNo} 页</span> : null}
                <p>{block.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="enterprise-preview-state">
            <FileSearch aria-hidden="true" size={28} />
            <strong>暂未解析到可展示文本</strong>
            <span>可以下载原文件继续查看。</span>
          </div>
        )
      ) : null}
      {!isLoading && !error && preview?.kind === 'unsupported' ? (
        <div className="enterprise-preview-state">
          <FileSearch aria-hidden="true" size={28} />
          <strong>当前格式暂不支持在线预览</strong>
          <span>{preview.message}</span>
        </div>
      ) : null}
      {!isLoading && !error && !preview && !onLoadPreview ? (
        <div className="enterprise-preview-state">
          <FileSearch aria-hidden="true" size={28} />
          <strong>当前环境未配置预览能力</strong>
        </div>
      ) : null}
    </section>
  );
}
