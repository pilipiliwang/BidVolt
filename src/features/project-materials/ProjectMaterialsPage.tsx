import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  FileLock2,
  FileSearch,
  FileText,
  FolderCheck,
  Layers3,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ProjectWorkbench } from '../../domains/projects/ProjectWorkbench';
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
  tender_document: '招标文件',
  technical_specification: '技术规范书',
  scoring_rules: '评标办法',
  quote_template: '报价模板',
  clarification: '澄清补遗',
  drawing: '图纸清单',
  other: '其他材料',
};

const statusLabel: Record<ProjectMaterialParseStatus, string> = {
  queued: '等待解析',
  parsing: '解析中',
  parsed: '已识别',
  needs_confirmation: '需要确认',
  failed: '解析失败',
};

type ProjectMaterialsTab = 'materials' | 'requirements' | 'snapshots';

function ParseStatusIcon({ status }: { status: ProjectMaterialParseStatus }) {
  if (status === 'parsed') return <CheckCircle2 aria-hidden="true" size={15} />;
  if (status === 'failed' || status === 'needs_confirmation') {
    return <AlertTriangle aria-hidden="true" size={15} />;
  }
  return <LoaderCircle aria-hidden="true" size={15} />;
}

function SimulatedReviewPanel({
  materialCount,
  parsedCount,
  requirements,
  snapshotCount,
}: {
  materialCount: number;
  parsedCount: number;
  requirements: ProjectMaterialsPageProps['requirements'];
  snapshotCount: number;
}) {
  if (materialCount === 0) {
    return (
      <section className="project-review-preview project-review-preview--empty">
        <h2>模拟评标</h2>
        <div className="project-review-empty-visual" aria-hidden="true">
          <FileSearch size={72} strokeWidth={1.3} />
          <span />
        </div>
        <div className="project-review-empty-copy">
          <h3>尚未开始分析</h3>
          <p>上传当前招标材料后，系统将识别评分细则、否决条款和投标要求。</p>
        </div>
      </section>
    );
  }

  const scoreRuleCount = requirements.filter((item) => item.type === 'score_rule').length;
  const rejectClauseCount = requirements.filter((item) => item.type === 'reject_clause').length;
  const materialChecklistCount = requirements.filter((item) => item.type === 'material_checklist').length;
  const pendingRequirementCount = requirements.filter(
    (item) => item.confirmationStatus === 'needs_confirmation',
  ).length;
  const identifiedRequirementCount = requirements.length;
  const parseRate = materialCount > 0 ? Math.round((parsedCount / materialCount) * 100) : 0;

  return (
    <section className="project-review-preview">
      <div className="project-review-preview__heading">
        <div>
          <h2>模拟评标</h2>
          <p>材料识别概览</p>
        </div>
        <span>
          <CheckCircle2 aria-hidden="true" size={15} />
          识别完成
        </span>
      </div>

      <div className="project-review-metrics">
        <article>
          <span className="project-review-metric-icon project-review-metric-icon--green">
            <BadgeCheck aria-hidden="true" size={23} />
          </span>
          <div>
            <small>已识别评分项</small>
            <strong>{scoreRuleCount}<em>项</em></strong>
          </div>
        </article>
        <article>
          <span className="project-review-metric-icon project-review-metric-icon--orange">
            <ShieldAlert aria-hidden="true" size={23} />
          </span>
          <div>
            <small>已识别否决条款</small>
            <strong>{rejectClauseCount}<em>项</em></strong>
          </div>
        </article>
        <article>
          <span className="project-review-metric-icon project-review-metric-icon--blue">
            <FolderCheck aria-hidden="true" size={23} />
          </span>
          <div>
            <small>需要交材料</small>
            <strong>{materialChecklistCount}<em>项</em></strong>
          </div>
        </article>
        <article>
          <span className="project-review-metric-icon project-review-metric-icon--green">
            <FileCheck2 aria-hidden="true" size={23} />
          </span>
          <div>
            <small>已识别 Requirement</small>
            <strong>{identifiedRequirementCount}<em>项</em></strong>
          </div>
        </article>
      </div>

      <div className="project-review-summary">
        <article>
          <BadgeCheck aria-hidden="true" size={20} />
          <span><small>材料解析完成</small><strong>{parsedCount} / {materialCount} 项</strong></span>
        </article>
        <article>
          <ShieldAlert aria-hidden="true" size={20} />
          <span><small>待人工确认</small><strong>{pendingRequirementCount} 项</strong></span>
        </article>
        <article>
          <span className="project-match-ring" style={{ '--match': `${parseRate * 3.6}deg` } as React.CSSProperties}>
            {parseRate}%
          </span>
          <span><small>解析完成率</small><strong>{parseRate}%</strong></span>
        </article>
      </div>

      <p className="project-review-disclaimer">
        模拟评标基于当前项目材料与只读匹配结果，仅供参考，不代表最终评审结论。
      </p>
      {snapshotCount > 0 && <span className="project-review-snapshot">已冻结 {snapshotCount} 个项目快照</span>}
    </section>
  );
}

export function ProjectMaterialsPage({
  enterpriseMaterials = [],
  onAddEnterpriseFiles,
  onAssistantSend,
  onImportTenderNoticeUrl,
  projectId,
  projectName,
  materials,
  requirements,
  snapshots,
  onUpload,
  onConfirmRequirement,
  onOpenSnapshot,
  onStartTask,
}: ProjectMaterialsPageProps) {
  const [activeTab, setActiveTab] = useState<ProjectMaterialsTab>('materials');
  const [completedBidNames, setCompletedBidNames] = useState<string[]>([]);
  const [taskState, setTaskState] = useState<{
    message: string;
    mode: 'generate' | 'validate' | null;
    status: 'error' | 'idle' | 'loading' | 'success';
  }>({ message: '', mode: null, status: 'idle' });
  const parsingCount = materials.filter((material) =>
    ['queued', 'parsing'].includes(material.parseStatus),
  ).length;
  const parsedCount = materials.filter((material) => material.parseStatus === 'parsed').length;
  const pendingRequirementCount = requirements.filter(
    (requirement) => requirement.confirmationStatus === 'needs_confirmation',
  ).length;
  const workspaceMaterials = useMemo(
    () =>
      materials.map((material) => ({
        id: material.id,
        name: material.name,
        status: statusLabel[material.parseStatus],
        tone: material.kind === 'quote_template' ? ('green' as const) : ('blue' as const),
      })),
    [materials],
  );

  const uploadProjectFiles = async (files: File[]) => onUpload?.(projectId, files);
  const uploadCompletedBidFiles = async (files: File[]) => {
    await onUpload?.(projectId, files);
    setCompletedBidNames((current) => [
      ...current,
      ...files.map((file) => file.name).filter((name) => !current.includes(name)),
    ]);
  };
  const startTask = async () => {
    const mode = completedBidNames.length > 0 ? 'validate' : 'generate';
    setTaskState({ message: '正在创建任务…', mode, status: 'loading' });
    try {
      await onStartTask(projectId, mode);
      setTaskState({
        message: `${mode === 'validate' ? '校核' : '生成'}任务已创建，可在任务进度中查看。`,
        mode,
        status: 'success',
      });
    } catch (error) {
      setTaskState({
        message: error instanceof Error && error.message
          ? error.message
          : `${mode === 'validate' ? '校核' : '生成'}任务创建失败，请重试。`,
        mode: null,
        status: 'error',
      });
    }
  };

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      materials={workspaceMaterials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onUpload ? uploadProjectFiles : undefined}
      onAssistantSend={onAssistantSend}
      footerHint="请输入您的问题，如“请分析招标文件的评分细则”"
      rightRail={
        <SimulatedReviewPanel
          materialCount={materials.length}
          parsedCount={parsedCount}
          requirements={requirements}
          snapshotCount={snapshots.length}
        />
      }
    >
      <section className="project-material-page">
        <header className="project-material-page__hero">
          <div>
            <p className="project-material-eyebrow">当前项目专属资料</p>
            <h2>当前招标材料</h2>
            <p className="project-material-page__lead">
              {projectName} · 上传、解析、Requirement 与任务快照均绑定本次工作台。
            </p>
          </div>
          <div className="project-domain-boundary" role="note">
            <FileLock2 aria-hidden="true" size={17} />
            <span>
              <strong>项目域 · {projectId}</strong>
              当前材料不会进入企业资料库，也不会跨项目复用。
            </span>
          </div>
        </header>

        <section className="project-material-summary" aria-label="当前项目材料概览">
          <article><FileText aria-hidden="true" size={17} /><span>当前材料</span><strong>{materials.length}</strong></article>
          <article><LoaderCircle aria-hidden="true" size={17} /><span>正在解析</span><strong>{parsingCount}</strong></article>
          <article><AlertTriangle aria-hidden="true" size={17} /><span>Requirement 待确认</span><strong>{pendingRequirementCount}</strong></article>
          <article><Layers3 aria-hidden="true" size={17} /><span>冻结快照</span><strong>{snapshots.length}</strong></article>
        </section>

        <nav className="project-material-tabs" aria-label="当前项目材料视图">
          <button
            aria-current={activeTab === 'materials' ? 'page' : undefined}
            type="button"
            onClick={() => setActiveTab('materials')}
          >
            <FileText aria-hidden="true" size={16} />
            材料与解析
            <span>{materials.length}</span>
          </button>
          <button
            aria-current={activeTab === 'requirements' ? 'page' : undefined}
            type="button"
            onClick={() => setActiveTab('requirements')}
          >
            <CheckCircle2 aria-hidden="true" size={16} />
            Requirement
            <span>{requirements.length}</span>
          </button>
          <button
            aria-current={activeTab === 'snapshots' ? 'page' : undefined}
            type="button"
            onClick={() => setActiveTab('snapshots')}
          >
            <Layers3 aria-hidden="true" size={16} />
            项目快照
            <span>{snapshots.length}</span>
          </button>
        </nav>

        <div className="project-material-content">
          {activeTab === 'materials' && (
            <div className="project-material-flow">
              <ProjectMaterialUpload
                projectId={projectId}
                projectName={projectName}
                existingBidFileNames={completedBidNames}
                onExistingBidUpload={uploadCompletedBidFiles}
                onImportTenderNoticeUrl={onImportTenderNoticeUrl}
                onUpload={onUpload}
              />

              <section aria-labelledby="project-material-list-title">
                <header className="project-section-heading">
                  <div>
                    <p className="project-material-eyebrow">招标材料识别结果</p>
                    <h2 id="project-material-list-title">材料与解析状态</h2>
                    <p>补遗和替换文件创建新 revision，原版本保留在本项目事件链中。</p>
                  </div>
                  <span className="project-project-only-badge">
                    <FileLock2 aria-hidden="true" size={14} />
                    仅当前项目
                  </span>
                </header>

                <div className="project-material-list">
                  {materials.map((material) => {
                    const progress = Math.min(100, Math.max(0, material.parseProgress));
                    return (
                      <article className="project-material-row" key={material.id}>
                        <span className="project-material-row__file" aria-hidden="true"><FileText size={18} /></span>
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
                      <p>当前招标材料是启动解析、生成或校核任务的必传输入。</p>
                    </div>
                  )}
                </div>
              </section>

              {materials.length > 0 && (
                <div className="project-start-task-wrap">
                  <button
                    className="project-start-task"
                    disabled={taskState.status === 'loading' || taskState.status === 'success'}
                    onClick={() => void startTask()}
                    type="button"
                  >
                    <Sparkles aria-hidden="true" size={18} />
                    {taskState.status === 'loading'
                      ? '正在创建任务…'
                      : taskState.status === 'success'
                        ? '任务已进入队列'
                      : completedBidNames.length > 0
                        ? '开始校核'
                        : '开始生成'}
                  </button>
                  {taskState.status !== 'idle' ? (
                    <p
                      className={`project-start-task-status project-start-task-status--${taskState.status}`}
                      role={taskState.status === 'error' ? 'alert' : 'status'}
                    >
                      {taskState.message}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
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
      </section>
    </ProjectWorkbench>
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
