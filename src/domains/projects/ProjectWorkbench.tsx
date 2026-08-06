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
import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import './project-workbench.css';

export type WorkspaceMaterial = {
  id: string;
  name: string;
  status?: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
};

type ProjectSourceRailProps = {
  enterpriseMaterials: WorkspaceMaterial[];
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
};

export function ProjectSourceRail({
  enterpriseMaterials,
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
}: ProjectSourceRailProps) {
  const [activeSource, setActiveSource] = useState<'enterprise' | 'project'>('project');
  const panelId = useId();
  const enterpriseTabId = `${panelId}-enterprise-tab`;
  const projectTabId = `${panelId}-project-tab`;
  const showingEnterprise = activeSource === 'enterprise';
  const visibleMaterials = showingEnterprise ? enterpriseMaterials : materials;
  const heading = showingEnterprise ? '企业资料' : '当前招标材料';

  return (
    <aside className="bv-source-rail" aria-label="项目资料">
      <div className="bv-source-rail__tabs" role="tablist" aria-label="资料范围">
        <button
          aria-controls={panelId}
          aria-selected={showingEnterprise}
          id={enterpriseTabId}
          onClick={() => setActiveSource('enterprise')}
          role="tab"
          type="button"
        >
          企业资料
        </button>
        <button
          aria-controls={panelId}
          aria-selected={!showingEnterprise}
          id={projectTabId}
          onClick={() => setActiveSource('project')}
          role="tab"
          type="button"
        >
          当前招标材料
        </button>
      </div>

      <div
        aria-labelledby={showingEnterprise ? enterpriseTabId : projectTabId}
        id={panelId}
        role="tabpanel"
      >
        <div className="bv-source-rail__heading">
          <span>
            <Folder aria-hidden="true" size={17} />
            {heading}（{visibleMaterials.length}项）
          </span>
          <span aria-hidden="true">⌄</span>
        </div>

        {visibleMaterials.length > 0 ? (
          <ul className="bv-source-rail__files">
            {visibleMaterials.map((material) => (
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
        ) : (
          <p className="bv-source-rail__empty" role="status">
            {showingEnterprise ? '企业资料库暂无可展示资料' : '当前项目尚未上传招标材料'}
          </p>
        )}

        {!showingEnterprise ? (
          <div className="bv-source-rail__missing">
            <AlertCircle aria-hidden="true" size={20} />
            <div>
              <strong>缺失材料：</strong>
              <span>2项同类业绩，1项型式试验报告</span>
            </div>
          </div>
        ) : null}

        {showingEnterprise && onAddEnterpriseFiles ? (
          <label className="bv-source-rail__upload">
            <UploadCloud aria-hidden="true" size={21} />
            <span>上传企业资料</span>
            <input
              aria-label="上传企业资料并同步资料库"
              multiple
              type="file"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                if (files.length > 0) onAddEnterpriseFiles(files);
                event.currentTarget.value = '';
              }}
            />
          </label>
        ) : showingEnterprise ? (
          <ReadonlyUploadControl
            label="企业资料上传不可用"
            title="当前页面未提供企业资料上传能力"
          />
        ) : onAddFiles ? (
          <label className="bv-source-rail__upload">
            <UploadCloud aria-hidden="true" size={21} />
            <span>上传资料</span>
            <input
              aria-label="补充上传当前项目资料"
              multiple
              type="file"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                if (files.length > 0) onAddFiles(files);
                event.currentTarget.value = '';
              }}
            />
          </label>
        ) : (
          <ReadonlyUploadControl
            label="添加项目文件不可用"
            title="当前页面未提供项目文件上传能力"
          />
        )}
      </div>
    </aside>
  );
}

function ReadonlyUploadControl({ label, title }: { label: string; title: string }) {
  return (
    <button
      className="bv-source-rail__upload bv-source-rail__upload--readonly"
      disabled
      title={title}
      type="button"
    >
      <UploadCloud aria-hidden="true" size={21} />
      <span>{label}</span>
    </button>
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
  enterpriseMaterials: WorkspaceMaterial[];
  footerHint?: string;
  materials: WorkspaceMaterial[];
  onAddEnterpriseFiles?: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  rightRail: ReactNode;
};

export function ProjectWorkbench({
  children,
  enterpriseMaterials,
  footerHint = '请输入您的问题，如“请分析招标文件的评分细则”',
  materials,
  onAddEnterpriseFiles,
  onAddFiles,
  rightRail,
}: ProjectWorkbenchProps) {
  return (
    <div className="bv-project-workspace">
      <ProjectSourceRail
        enterpriseMaterials={enterpriseMaterials}
        materials={materials}
        onAddEnterpriseFiles={onAddEnterpriseFiles}
        onAddFiles={onAddFiles}
      />
      <main className="bv-project-workspace__main">{children}</main>
      <aside className="bv-project-workspace__right">{rightRail}</aside>
      <ProjectChatBar hint={footerHint} onAddFiles={onAddFiles} />
    </div>
  );
}

export function ProjectChatBar({
  hint,
  onAddFiles,
}: {
  hint: string;
  onAddFiles?: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bv-project-chat" aria-label="项目助手输入">
      <button
        disabled={!onAddFiles}
        onClick={() => fileInputRef.current?.click()}
        title={onAddFiles ? '添加当前项目文件' : '当前页面未提供项目文件上传能力'}
        type="button"
      >
        <Paperclip aria-hidden="true" size={21} />
        添加文件
      </button>
      {onAddFiles ? (
        <input
          ref={fileInputRef}
          aria-label="添加当前项目文件"
          className="bv-project-chat__file-input"
          multiple
          type="file"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            if (files.length > 0) onAddFiles(files);
            event.currentTarget.value = '';
          }}
        />
      ) : null}
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
      <span>AI电网投标助手</span>
      <i />
    </div>
  );
}
