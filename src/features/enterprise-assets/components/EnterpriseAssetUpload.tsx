import { AlertCircle, Building2, CheckCircle2, FileUp, LoaderCircle } from 'lucide-react';
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
      throw new Error(`${file.name}：当前后端不支持该格式；压缩包请使用 ZIP`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${file.name}：单个文件不能超过 500MB`);
    }
  }
}

export function EnterpriseAssetUpload({
  enterpriseName,
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
  const setUploadState = (state: EnterpriseUploadState) => {
    if (onUploadStateChange) {
      onUploadStateChange(state);
      return;
    }
    setLocalUploadState(state);
  };

  const dispatchFiles = async (files: FileList | null) => {
    if (!files?.length || uploadState.type === 'loading') return;
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
        <span>资料只归属于 {enterpriseName}；上传后由服务端自动分类并抽取字段</span>
        <span className="enterprise-dropzone__formats">支持文档、表格、图片与 ZIP，单个文件不超过 500MB；RAR/7Z 暂不支持解包</span>
      </label>
      <input
        id={inputId}
        className="enterprise-visually-hidden"
        type="file"
        multiple
        accept={BACKEND_UPLOAD_ACCEPT}
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
