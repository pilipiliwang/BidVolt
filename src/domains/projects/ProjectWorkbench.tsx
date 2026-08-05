import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  FileChartColumn,
  FileSpreadsheet,
  FileText,
  Folder,
  Paperclip,
  Send,
  UploadCloud,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { AppLink } from '../../app/router';
import './project-workbench.css';

export type WorkspaceMaterial = {
  id: string;
  name: string;
  status?: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
};

type ProjectSourceRailProps = {
  materials: WorkspaceMaterial[];
  onUpload?: (files: File[]) => void;
};

export function ProjectSourceRail({ materials, onUpload }: ProjectSourceRailProps) {
  return (
    <aside className="bv-source-rail" aria-label="项目资料">
      <div className="bv-source-rail__tabs" role="tablist" aria-label="资料范围">
        <AppLink role="tab" aria-selected="false" to="/enterprise-assets">
          企业资料
        </AppLink>
        <button role="tab" aria-selected="true" type="button">
          当前招标材料
        </button>
      </div>

      <div className="bv-source-rail__heading">
        <span>
          <Folder aria-hidden="true" size={17} />
          当前招标材料（{materials.length}项）
        </span>
        <span aria-hidden="true">⌄</span>
      </div>

      <ul className="bv-source-rail__files">
        {materials.map((material) => (
          <li key={material.id}>
            <MaterialIcon tone={material.tone} />
            <span
              aria-label={material.name}
              className="bv-source-rail__filename"
              data-name={material.name}
              title={material.name}
            />
            <small>{material.status ?? '已识别'}</small>
            <CheckCircle2 aria-hidden="true" size={15} />
          </li>
        ))}
      </ul>

      <div className="bv-source-rail__missing">
        <AlertCircle aria-hidden="true" size={20} />
        <div>
          <strong>缺失材料：</strong>
          <span>2项同类业绩，1项型式试验报告</span>
        </div>
      </div>

      {onUpload ? (
        <label className="bv-source-rail__upload">
          <UploadCloud aria-hidden="true" size={21} />
          <span>上传资料</span>
          <input
            aria-label="补充上传当前项目资料"
            multiple
            type="file"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length > 0) onUpload(files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      ) : (
        <button
          className="bv-source-rail__upload bv-source-rail__upload--readonly"
          type="button"
          disabled
          title="请前往项目材料页上传和管理文件"
        >
          <UploadCloud aria-hidden="true" size={21} />
          <span>只读 · 请到材料页上传</span>
        </button>
      )}
    </aside>
  );
}

function MaterialIcon({ tone = 'blue' }: { tone?: WorkspaceMaterial['tone'] }) {
  const Icon = tone === 'green' ? FileSpreadsheet : tone === 'orange' ? FileArchive : FileText;
  return (
    <span className={`bv-source-file-icon bv-source-file-icon--${tone}`} aria-hidden="true">
      <Icon size={14} />
    </span>
  );
}

type ProjectWorkbenchProps = {
  children: ReactNode;
  footerHint?: string;
  materials: WorkspaceMaterial[];
  onUpload?: (files: File[]) => void;
  rightRail: ReactNode;
};

export function ProjectWorkbench({
  children,
  footerHint = '请输入您的问题，如“请分析招标文件的评分细则”',
  materials,
  onUpload,
  rightRail,
}: ProjectWorkbenchProps) {
  return (
    <div className="bv-project-workspace">
      <ProjectSourceRail materials={materials} onUpload={onUpload} />
      <main className="bv-project-workspace__main">{children}</main>
      <aside className="bv-project-workspace__right">{rightRail}</aside>
      <ProjectChatBar hint={footerHint} />
    </div>
  );
}

export function ProjectChatBar({ hint }: { hint: string }) {
  return (
    <div className="bv-project-chat" aria-label="项目助手输入">
      <button type="button">
        <Paperclip aria-hidden="true" size={21} />
        添加文件
      </button>
      <label>
        <span className="bv-visually-hidden">向项目助手提问</span>
        <input placeholder={hint} />
      </label>
      <button className="bv-project-chat__send" type="button">
        发送
        <Send aria-hidden="true" size={19} />
      </button>
    </div>
  );
}

export function ScoreRing({ label = '综合得分', score }: { label?: string; score: number }) {
  const normalized = Math.min(100, Math.max(0, score));
  return (
    <div
      className="bv-score-ring"
      style={{ '--score': `${normalized * 3.6}deg` } as CSSProperties}
      role="img"
      aria-label={`${label} ${score} 分`}
    >
      <div>
        <span>{label}</span>
        <strong>{score.toFixed(1)}</strong>
        <small>/100</small>
      </div>
    </div>
  );
}

export function ResultCover({
  title,
  tone,
}: {
  title: string;
  tone: 'business' | 'technical' | 'quote';
}) {
  return (
    <div className={`bv-result-cover bv-result-cover--${tone}`} aria-hidden="true">
      <FileChartColumn size={37} />
      <strong>{title}</strong>
      <span>AI电投助手</span>
      <i />
    </div>
  );
}
