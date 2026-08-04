import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileLock2,
  FileText,
  Layers3,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';

import { ProjectMaterialUpload } from './components/ProjectMaterialUpload';
import { RequirementsPanel } from './components/RequirementsPanel';
import { SnapshotsPanel } from './components/SnapshotsPanel';
import type {
  ProjectMaterialKind,
  ProjectMaterialParseStatus,
  ProjectMaterialsPageProps,
} from './types';
import './project-materials.css';

const kindLabel: Record<ProjectMaterialKind, string> = {
  tender_notice: '招标公告',
  tender_document: '招标主文件',
  technical_specification: '技术规范',
  scoring_rules: '评分办法',
  quote_template: '报价模板',
  clarification: '补遗澄清',
  drawing: '图纸清单',
  other: '其他材料',
};

const statusLabel: Record<ProjectMaterialParseStatus, string> = {
  queued: '等待解析',
  parsing: '解析中',
  parsed: '解析完成',
  needs_confirmation: '需要确认',
  failed: '解析失败',
};

type ProjectMaterialsTab = 'materials' | 'requirements' | 'snapshots';

function ParseStatusIcon({ status }: { status: ProjectMaterialParseStatus }) {
  if (status === 'parsed') return <CheckCircle2 aria-hidden="true" size={16} />;
  if (status === 'failed' || status === 'needs_confirmation') {
    return <AlertTriangle aria-hidden="true" size={16} />;
  }
  return <LoaderCircle aria-hidden="true" size={16} />;
}

export function ProjectMaterialsPage({
  projectId,
  projectName,
  materials,
  requirements,
  snapshots,
  onUpload,
  onConfirmRequirement,
  onOpenSnapshot,
}: ProjectMaterialsPageProps) {
  const [activeTab, setActiveTab] = useState<ProjectMaterialsTab>('materials');
  const parsingCount = materials.filter((material) =>
    ['queued', 'parsing'].includes(material.parseStatus),
  ).length;
  const pendingRequirementCount = requirements.filter(
    (requirement) => requirement.confirmationStatus === 'needs_confirmation',
  ).length;

  return (
    <main className="project-material-page">
      <header className="project-material-page__hero">
        <div>
          <p className="project-material-eyebrow">Current project materials</p>
          <h1>当前招标材料</h1>
          <p className="project-material-page__lead">
            {projectName} · 所有材料、Requirement 与快照均绑定当前工作台任务。
          </p>
        </div>
        <div className="project-domain-boundary" role="note">
          <FileLock2 aria-hidden="true" size={19} />
          <span>
            <strong>项目域 · {projectId}</strong>
            当前材料不会被企业资料搜索召回，也不会跨项目复用。
          </span>
        </div>
      </header>

      <section className="project-material-summary" aria-label="当前项目材料概览">
        <article>
          <FileText aria-hidden="true" size={19} />
          <span>当前材料</span>
          <strong>{materials.length}</strong>
        </article>
        <article>
          <Clock3 aria-hidden="true" size={19} />
          <span>正在解析</span>
          <strong>{parsingCount}</strong>
        </article>
        <article>
          <AlertTriangle aria-hidden="true" size={19} />
          <span>Requirement 待确认</span>
          <strong>{pendingRequirementCount}</strong>
        </article>
        <article>
          <Layers3 aria-hidden="true" size={19} />
          <span>冻结快照</span>
          <strong>{snapshots.length}</strong>
        </article>
      </section>

      <ProjectMaterialUpload projectId={projectId} projectName={projectName} onUpload={onUpload} />

      <nav className="project-material-tabs" aria-label="当前项目材料视图">
        <button
          aria-current={activeTab === 'materials' ? 'page' : undefined}
          type="button"
          onClick={() => setActiveTab('materials')}
        >
          <FileText aria-hidden="true" size={17} />
          材料与解析
          <span>{materials.length}</span>
        </button>
        <button
          aria-current={activeTab === 'requirements' ? 'page' : undefined}
          type="button"
          onClick={() => setActiveTab('requirements')}
        >
          <CheckCircle2 aria-hidden="true" size={17} />
          Requirement
          <span>{requirements.length}</span>
        </button>
        <button
          aria-current={activeTab === 'snapshots' ? 'page' : undefined}
          type="button"
          onClick={() => setActiveTab('snapshots')}
        >
          <Layers3 aria-hidden="true" size={17} />
          项目快照
          <span>{snapshots.length}</span>
        </button>
      </nav>

      <div className="project-material-content">
        {activeTab === 'materials' && (
          <section aria-labelledby="project-material-list-title">
            <header className="project-section-heading">
              <div>
                <p className="project-material-eyebrow">Material revisions</p>
                <h2 id="project-material-list-title">材料与解析状态</h2>
                <p>补遗和替换文件会创建新 revision，原版本仍留在项目事件链中。</p>
              </div>
              <span className="project-project-only-badge">
                <FileLock2 aria-hidden="true" size={15} />
                仅当前项目
              </span>
            </header>

            <div className="project-material-list">
              {materials.map((material) => {
                const progress = Math.min(100, Math.max(0, material.parseProgress));
                return (
                  <article className="project-material-row" key={material.id}>
                    <span className="project-material-row__file" aria-hidden="true">
                      <FileText size={20} />
                    </span>
                    <div className="project-material-row__main">
                      <div className="project-material-row__title">
                        <strong>{material.name}</strong>
                        <span>{kindLabel[material.kind]}</span>
                        <span>文件版本 {material.revisionNo}</span>
                      </div>
                      <div className="project-material-row__meta">
                        <span>上传于 {material.uploadedAt}</span>
                        {material.blocksCount !== undefined && <span>{material.blocksCount} 个文本块</span>}
                        {material.supersedesRevisionNo !== undefined && (
                          <span className="project-supersedes">
                            <RotateCcw aria-hidden="true" size={12} />
                            替代版本 {material.supersedesRevisionNo}
                          </span>
                        )}
                      </div>
                      <div
                        className="project-parse-progress"
                        role="progressbar"
                        aria-label={`${material.name}解析进度`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                      >
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <span className={`project-parse-state project-parse-state--${material.parseStatus}`}>
                      <ParseStatusIcon status={material.parseStatus} />
                      {statusLabel[material.parseStatus]}
                    </span>
                  </article>
                );
              })}
              {materials.length === 0 && (
                <div className="project-empty-state">
                  <FileText aria-hidden="true" size={30} />
                  <h3>请先上传当前招标材料</h3>
                  <p>招标材料是启动解析、生成或校核任务的必传输入。</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'requirements' && (
          <RequirementsPanel
            projectId={projectId}
            requirements={requirements}
            onConfirmRequirement={onConfirmRequirement}
          />
        )}

        {activeTab === 'snapshots' && (
          <SnapshotsPanel
            projectId={projectId}
            snapshots={snapshots}
            onOpenSnapshot={onOpenSnapshot}
          />
        )}
      </div>
    </main>
  );
}

export type {
  ProjectMaterial,
  ProjectMaterialKind,
  ProjectMaterialParseStatus,
  ProjectMaterialsPageProps,
  ProjectMaterialUploadProps,
  ProjectRequirement,
  ProjectSnapshot,
  RequirementCoordinate,
  RequirementType,
} from './types';
