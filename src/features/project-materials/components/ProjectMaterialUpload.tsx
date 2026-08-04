import { FileLock2, UploadCloud } from 'lucide-react';
import { useId, type ChangeEvent, type DragEvent } from 'react';

import type { ProjectMaterialUploadProps } from '../types';

export function ProjectMaterialUpload({
  projectId,
  projectName,
  onUpload,
}: ProjectMaterialUploadProps) {
  const inputId = useId();

  const dispatchFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onUpload?.(projectId, Array.from(files));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatchFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dispatchFiles(event.dataTransfer.files);
  };

  return (
    <section className="project-material-upload" aria-labelledby="project-material-upload-title">
      <div className="project-material-upload__heading">
        <span className="project-material-upload__icon" aria-hidden="true">
          <FileLock2 size={21} />
        </span>
        <div>
          <p className="project-material-eyebrow">Project-only upload</p>
          <h2 id="project-material-upload-title">上传当前招标材料</h2>
          <p>文件将绑定项目编号 {projectId}，后续解析、Requirement 与快照都只在本项目生效。</p>
        </div>
      </div>

      <label
        className="project-material-dropzone"
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <UploadCloud aria-hidden="true" size={28} />
        <span>
          <strong>选择或拖拽招标材料</strong>
          <small>仅保存到“{projectName}”，不会进入企业资料库</small>
        </span>
        <em>选择文件</em>
      </label>
      <input
        id={inputId}
        className="project-material-visually-hidden"
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ofd,.png,.jpg,.jpeg,.zip,.rar,.7z"
        onChange={handleChange}
      />
    </section>
  );
}
