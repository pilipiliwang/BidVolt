import { AlertCircle, Building2, CheckCircle2, FileUp, LoaderCircle } from 'lucide-react';
import { useId, useState, type ChangeEvent, type DragEvent } from 'react';

import type { EnterpriseAssetUploadProps } from '../types';

const ingestionStatusLabel = {
  queued: '等待处理',
  classifying: '正在自动分类',
  extracting: '正在抽取字段',
  completed: '处理完成',
  failed: '处理失败',
} as const;

export function EnterpriseAssetUpload({
  enterpriseName,
  ingestionItems = [],
  onUpload,
}: EnterpriseAssetUploadProps) {
  const inputId = useId();
  const [uploadState, setUploadState] = useState<{
    message: string;
    type: 'error' | 'idle' | 'loading' | 'success';
  }>({ message: '', type: 'idle' });

  const dispatchFiles = async (files: FileList | null) => {
    if (!files?.length || uploadState.type === 'loading') return;
    if (!onUpload) {
      setUploadState({ message: '当前环境未配置企业资料上传能力。', type: 'error' });
      return;
    }
    setUploadState({ message: '正在上传企业资料…', type: 'loading' });
    try {
      const result = await onUpload(Array.from(files));
      setUploadState({
        message: result?.message ?? '企业资料上传完成，待服务端返回归类状态。',
        type: 'success',
      });
    } catch (error) {
      setUploadState({
        message: error instanceof Error && error.message
          ? error.message
          : '企业资料上传失败，请重试。',
        type: 'error',
      });
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    void dispatchFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void dispatchFiles(event.dataTransfer.files);
  };

  return (
    <section className="enterprise-upload" aria-labelledby="enterprise-upload-title">
      <div className="enterprise-upload__heading">
        <span className="enterprise-upload__icon" aria-hidden="true">
          <Building2 size={20} />
        </span>
        <div>
          <p className="enterprise-eyebrow">企业资料专属入口</p>
          <h2 id="enterprise-upload-title">上传企业资料</h2>
        </div>
      </div>

      <label
        className="enterprise-dropzone"
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <FileUp aria-hidden="true" size={27} />
        <strong>选择文件或拖拽到此处</strong>
        <span>资料只归属于 {enterpriseName}；服务端完成资料关联后，Agent 才会分类并抽取字段</span>
        <span className="enterprise-dropzone__formats">支持 PDF、DOCX、XLSX、OFD、图片与压缩包</span>
      </label>
      <input
        id={inputId}
        className="enterprise-visually-hidden"
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ofd,.png,.jpg,.jpeg,.zip,.rar,.7z"
        onChange={handleChange}
      />

      {uploadState.type !== 'idle' ? (
        <p
          className={`enterprise-upload__message enterprise-upload__message--${uploadState.type}`}
          role={uploadState.type === 'error' ? 'alert' : 'status'}
        >
          {uploadState.type === 'error'
            ? <AlertCircle aria-hidden="true" size={15} />
            : uploadState.type === 'success'
              ? <CheckCircle2 aria-hidden="true" size={15} />
              : <LoaderCircle aria-hidden="true" size={15} />}
          {uploadState.message}
        </p>
      ) : null}

      {ingestionItems.length > 0 && (
        <div className="enterprise-ingestion" aria-label="企业资料处理队列">
          {ingestionItems.map((item) => {
            const isComplete = item.status === 'completed';
            return (
              <article className="enterprise-ingestion__item" key={item.id}>
                <span className="enterprise-ingestion__state" aria-hidden="true">
                  {isComplete ? <CheckCircle2 size={18} /> : <LoaderCircle size={18} />}
                </span>
                <div className="enterprise-ingestion__content">
                  <div className="enterprise-ingestion__meta">
                    <strong>{item.name}</strong>
                    <span>{ingestionStatusLabel[item.status]}</span>
                  </div>
                  {item.progress === undefined ? (
                    <small className="enterprise-progress-unknown">后端未提供百分比进度</small>
                  ) : (
                    <div
                      className="enterprise-progress"
                      role="progressbar"
                      aria-label={`${item.name}处理进度`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.progress}
                    >
                      <span style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
