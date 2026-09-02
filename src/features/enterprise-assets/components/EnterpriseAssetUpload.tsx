import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  LoaderCircle,
} from 'lucide-react';
import { useId, useState, type ChangeEvent, type DragEvent } from 'react';

import type { EnterpriseAssetUploadProps, EnterpriseUploadState } from '../types';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const BACKEND_UPLOAD_ACCEPT = '.pdf,.ofd,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.jpg,.jpeg,.png,.bmp,.tiff,.zip,.html,.htm';

function validateFiles(files: FileList) {
  const acceptedExtensions = new Set(BACKEND_UPLOAD_ACCEPT.split(','));
  for (const file of Array.from(files)) {
    const extension = file.name.includes('.')
      ? `.${file.name.split('.').pop()?.toLocaleLowerCase() ?? ''}`
      : '';
    if (!acceptedExtensions.has(extension)) {
      if (extension === '.rar' || extension === '.7z') {
        throw new Error(`${file.name}：后端暂不支持 RAR/7Z，请转换为 ZIP 后上传`);
      }
      throw new Error(`${file.name}：后端暂不支持该格式`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${file.name}：单个文件不能超过 500MB`);
    }
  }
}

export function EnterpriseAssetUpload({
  onUpload,
  uploadState: controlledUploadState,
  onUploadStateChange,
}: EnterpriseAssetUploadProps) {
  const inputId = useId();
  const [localUploadState, setLocalUploadState] = useState<EnterpriseUploadState>({
    message: '',
    type: 'idle',
  });
  const uploadState = controlledUploadState ?? localUploadState;
  const isUploading = uploadState.type === 'loading';
  const setUploadState = (state: EnterpriseUploadState) => {
    if (onUploadStateChange) {
      onUploadStateChange(state);
      return;
    }
    setLocalUploadState(state);
  };

  const dispatchFiles = async (files: FileList | null) => {
    if (!files?.length || isUploading) return;
    if (!onUpload) {
      setUploadState({ message: '当前环境未配置企业资料上传能力。', type: 'error' });
      return;
    }
    try {
      validateFiles(files);
      setUploadState({ message: '正在上传企业资料…', type: 'loading' });
      const result = await onUpload(Array.from(files));
      setUploadState({
        message: result?.message ?? '企业资料已提交，请刷新列表查看服务端返回结果。',
        type: result?.type ?? 'success',
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
    <section className="enterprise-upload" aria-label="企业资料上传">
      <div className="enterprise-upload__modes" role="group" aria-label="企业资料上传方式">
        <button
          className="enterprise-upload-mode enterprise-upload-mode--active"
          type="button"
          aria-pressed="true"
          disabled={isUploading}
        >
          <span className="enterprise-upload-mode__icon" aria-hidden="true">
            <FileUp size={21} />
          </span>
          <span className="enterprise-upload-mode__copy">
            <strong>上传企业资料</strong>
            <small>选择文件或拖拽上传</small>
          </span>
          <span className="enterprise-upload-mode__badge">当前方式</span>
        </button>

        <button
          className="enterprise-upload-mode enterprise-upload-mode--unavailable"
          type="button"
          disabled
        >
          <span className="enterprise-upload-mode__icon" aria-hidden="true">
            <FileText size={21} />
          </span>
          <span className="enterprise-upload-mode__copy">
            <strong>从历史标书成果提取</strong>
            <small>由 AI 提取企业资料并自动归档</small>
          </span>
          <span className="enterprise-upload-mode__badge">待测试</span>
        </button>
      </div>

      <label
        className={`enterprise-dropzone${isUploading ? ' enterprise-dropzone--disabled' : ''}`}
        htmlFor={inputId}
        aria-disabled={isUploading}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <FileUp aria-hidden="true" size={27} />
        <strong>选择文件或拖拽到此处</strong>
        <span className="enterprise-dropzone__formats">支持 PDF、OFD、Word、Excel、PPT、文本、图片和 ZIP；单个文件不超过 500MB</span>
      </label>
      <input
        id={inputId}
        className="enterprise-visually-hidden"
        type="file"
        multiple
        accept={BACKEND_UPLOAD_ACCEPT}
        disabled={isUploading}
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
    </section>
  );
}
