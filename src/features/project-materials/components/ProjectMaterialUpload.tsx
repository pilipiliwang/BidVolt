import { CheckCircle2, FileLock2, FileText, UploadCloud } from 'lucide-react';
import { useId, type ChangeEvent, type DragEvent } from 'react';

import type { ProjectMaterialUploadProps } from '../types';

type UploadCardProps = {
  accept: string;
  description: string;
  inputLabel: string;
  onFiles: (files: FileList | null) => void;
  required?: boolean;
  selectedNames?: string[];
  title: string;
};

type EnhancedProjectMaterialUploadProps = ProjectMaterialUploadProps & {
  existingBidFileNames?: string[];
  onExistingBidUpload?: (files: File[]) => void;
};

function UploadCard({
  accept,
  description,
  inputLabel,
  onFiles,
  required = false,
  selectedNames = [],
  title,
}: UploadCardProps) {
  const inputId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    onFiles(event.dataTransfer.files);
  };

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

      <label
        className="project-material-dropzone"
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="project-material-dropzone__icon" aria-hidden="true">
          <UploadCloud size={30} strokeWidth={2.2} />
        </span>
        <span>
          <strong>点击或拖拽文件到此处上传</strong>
          <small>支持 PDF、Word、Excel、PPT、ZIP 等格式，单个文件不超过 200MB</small>
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
        onChange={handleChange}
      />

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

function toFiles(files: FileList | null): File[] {
  return Array.from(files ?? []);
}

export function ProjectMaterialUpload({
  projectId,
  projectName,
  onUpload,
  existingBidFileNames = [],
  onExistingBidUpload,
}: EnhancedProjectMaterialUploadProps) {
  const dispatchProjectFiles = (files: FileList | null) => {
    const selectedFiles = toFiles(files);
    if (selectedFiles.length > 0) onUpload?.(projectId, selectedFiles);
  };

  const dispatchExistingBidFiles = (files: FileList | null) => {
    const selectedFiles = toFiles(files);
    if (selectedFiles.length > 0) onExistingBidUpload?.(selectedFiles);
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
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.ofd,.png,.jpg,.jpeg,.zip,.rar,.7z"
          onFiles={dispatchProjectFiles}
        />
        <UploadCard
          title="已制作完成的标书"
          description="如已有商务标、技术标或报价单，可上传后直接进入校核。"
          inputLabel="选择或拖拽已制作完成的标书"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ofd,.zip,.rar,.7z"
          selectedNames={existingBidFileNames}
          onFiles={dispatchExistingBidFiles}
        />
      </div>
    </section>
  );
}
