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
import { ProjectWorkspaceTabs } from '../../domains/projects/ProjectWorkspaceTabs';
import { ProjectMaterialUpload } from './components/ProjectMaterialUpload';
import { RequirementsPanel } from './components/RequirementsPanel';
import { SnapshotsPanel } from './components/SnapshotsPanel';
import type {
  ProjectMaterial,
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

function ProjectMaterialRows({
  emptyDescription,
  emptyTitle,
  materials,
}: {
  emptyDescription: string;
  emptyTitle: string;
  materials: ProjectMaterial[];
}) {
  return (
    <div className="project-material-list">
      {materials.map((material) => {
        const progress = material.parseProgress === undefined
          ? undefined
          : Math.min(100, Math.max(0, material.parseProgress));
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
              {progress === undefined ? (
                <small className="project-parse-progress-unknown">后端未提供百分比进度</small>
              ) : (
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
              )}
            </div>
            <span className={`project-parse-state project-parse-state--${material.parseStatus}`}>
              <ParseStatusIcon status={material.parseStatus} />
              {statusLabel[material.parseStatus]}
            </span>
          </article>
        );
      })}
      {materials.length === 0 ? (
        <div className="project-empty-state project-empty-state--material-group" role="status">
          <FileText aria-hidden="true" size={30} />
          <h3>{emptyTitle}</h3>
          <p>{emptyDescription}</p>
        </div>
      ) : null}
    </div>
  );
}

const taskActionBlockingStatuses = new Set<NonNullable<ProjectMaterialsPageProps['taskStatus']>>([
  'queued',
  'running',
  'retrying',
  'waiting_user',
  'cancel_requested',
  'succeeded',
]);

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
  const recognitionStatus = parsedCount === materialCount
    ? { key: 'complete', label: '识别完成', Icon: CheckCircle2 }
    : parsedCount === 0
      ? { key: 'in-progress', label: '识别进行中', Icon: LoaderCircle }
      : { key: 'partial', label: '部分完成', Icon: LoaderCircle };
  const RecognitionStatusIcon = recognitionStatus.Icon;

  return (
    <section className="project-review-preview">
      <div className="project-review-preview__heading">
        <div>
          <h2>模拟评标</h2>
          <p>材料识别概览</p>
        </div>
        <span data-status={recognitionStatus.key}>
          <RecognitionStatusIcon aria-hidden="true" size={15} />
          {recognitionStatus.label}
        </span>
      </div>

      <div className="project-review-metrics" aria-label="材料识别核心指标" role="list">
        <article role="listitem">
          <span className="project-review-metric-icon">
            <BadgeCheck aria-hidden="true" size={23} />
          </span>
          <div>
            <small>已识别评分项</small>
            <strong>{scoreRuleCount}<em>项</em></strong>
          </div>
        </article>
        <article role="listitem">
          <span className="project-review-metric-icon">
            <ShieldAlert aria-hidden="true" size={23} />
          </span>
          <div>
            <small>已识别否决条款</small>
            <strong>{rejectClauseCount}<em>项</em></strong>
          </div>
        </article>
        <article role="listitem">
          <span className="project-review-metric-icon">
            <FolderCheck aria-hidden="true" size={23} />
          </span>
          <div>
            <small>需要交材料</small>
            <strong>{materialChecklistCount}<em>项</em></strong>
          </div>
        </article>
        <article role="listitem">
          <span className="project-review-metric-icon">
            <FileCheck2 aria-hidden="true" size={23} />
          </span>
          <div>
            <small>已识别 Requirement</small>
            <strong>{identifiedRequirementCount}<em>项</em></strong>
          </div>
        </article>
      </div>

      <div className="project-review-summary" aria-label="材料解析状态" role="list">
        <article role="listitem">
          <BadgeCheck aria-hidden="true" size={20} />
          <span><small>材料解析完成</small><strong>{parsedCount} / {materialCount} 项</strong></span>
        </article>
        <article className="project-review-summary__pending" role="listitem">
          <ShieldAlert aria-hidden="true" size={20} />
          <span><small>待人工确认</small><strong>{pendingRequirementCount} 项</strong></span>
        </article>
        <article className="project-review-summary__rate" role="listitem">
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
  onAssistantAddFiles,
  onAssistantSend,
  onImportTenderNoticeUrl,
  projectId,
  projectName,
  materials,
  requirements,
  snapshots,
  supplementalMaterialIds = [],
  onUpload,
  onConfirmRequirement,
  onOpenSnapshot,
  onStartTask,
  taskStatus,
}: ProjectMaterialsPageProps) {
  const [activeTab, setActiveTab] = useState<ProjectMaterialsTab>('materials');
  const [completedBidNames, setCompletedBidNames] = useState<string[]>([]);
  const [selectedTaskMode, setSelectedTaskMode] = useState<'generate' | 'validate' | null>(null);
  const [taskState, setTaskState] = useState<{
    message: string;
    status: 'error' | 'idle' | 'loading';
  }>({ message: '', status: 'idle' });
  const parsedCount = materials.filter((material) => material.parseStatus === 'parsed').length;
  const supplementalMaterialIdSet = useMemo(
    () => new Set(supplementalMaterialIds.map(String)),
    [supplementalMaterialIds],
  );
  const supplementalMaterials = useMemo(
    () => materials.filter((material) => supplementalMaterialIdSet.has(material.id)),
    [materials, supplementalMaterialIdSet],
  );
  const currentTenderMaterials = useMemo(
    () => materials.filter((material) => !supplementalMaterialIdSet.has(material.id)),
    [materials, supplementalMaterialIdSet],
  );
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
    if (!selectedTaskMode) return;
    const mode = selectedTaskMode;
    setTaskState({ message: '正在创建任务…', status: 'loading' });
    try {
      await onStartTask(projectId, mode);
      setTaskState({ message: '', status: 'idle' });
    } catch (error) {
      setTaskState({
        message: error instanceof Error && error.message
          ? error.message
          : `${mode === 'validate' ? '校核' : '生成'}任务创建失败，请重试。`,
        status: 'error',
      });
    }
  };
  const taskBlocksActions = taskStatus ? taskActionBlockingStatuses.has(taskStatus) : false;

  return (
    <ProjectWorkbench
      enterpriseMaterials={enterpriseMaterials}
      materials={workspaceMaterials}
      onAddEnterpriseFiles={onAddEnterpriseFiles}
      onAddFiles={onUpload ? uploadProjectFiles : undefined}
      onAssistantAddFiles={onAssistantAddFiles}
      onAssistantSend={onAssistantSend}
      workspaceNavigation={<ProjectWorkspaceTabs activeTab="materials" projectId={projectId} />}
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
        <div className="project-material-content">
          <div className="project-material-flow">
              <section className="project-material-group" aria-labelledby="project-supplemental-material-list-title">
                <header className="project-section-heading">
                  <div>
                    <h2 id="project-supplemental-material-list-title">补充资料</h2>
                    <p>仅展示当前登录会话内，通过页面底部“添加文件”成功上传的文件；刷新后分组可能无法恢复。</p>
                  </div>
                  <span className="project-project-only-badge">
                    <FolderCheck aria-hidden="true" size={14} />
                    {supplementalMaterials.length} 项
                  </span>
                </header>

                <ProjectMaterialRows
                  emptyDescription="请使用页面底部项目助手的“添加文件”上传本项目补充资料。"
                  emptyTitle="暂无补充资料"
                  materials={supplementalMaterials}
                />
              </section>

              <section className="project-material-group" aria-labelledby="project-current-material-list-title">
                <header className="project-section-heading">
                  <div>
                    <h2 id="project-current-material-list-title">当前招标材料</h2>
                    <p>主上传区和招标公告网址导入的文件保留在本区，解析状态来自后端。</p>
                  </div>
                  <span className="project-project-only-badge">
                    <FileLock2 aria-hidden="true" size={14} />
                    {currentTenderMaterials.length} 项
                  </span>
                </header>

                <nav className="project-material-subviews" aria-label="当前招标材料内容">
                  <button
                    aria-current={activeTab === 'materials' ? 'page' : undefined}
                    type="button"
                    onClick={() => setActiveTab('materials')}
                  >
                    <FileText aria-hidden="true" size={16} />
                    材料清单
                    <span>{currentTenderMaterials.length}</span>
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

                {activeTab === 'materials' ? (
                  <div className="project-material-group__body">
                    {!taskBlocksActions ? (
                      <ProjectMaterialUpload
                        projectId={projectId}
                        projectName={projectName}
                        existingBidFileNames={completedBidNames}
                        onExistingBidUpload={uploadCompletedBidFiles}
                        onImportTenderNoticeUrl={onImportTenderNoticeUrl}
                        onUpload={onUpload}
                      />
                    ) : null}

                    <ProjectMaterialRows
                      emptyDescription="当前招标材料是启动解析、生成或校核任务的必传输入。"
                      emptyTitle="请先上传当前招标材料"
                      materials={currentTenderMaterials}
                    />

                    {currentTenderMaterials.length > 0 && !taskBlocksActions ? (
                      <div className="project-start-task-wrap">
                        <fieldset className="project-task-mode">
                          <legend>选择本次任务</legend>
                          <label>
                            <input
                              checked={selectedTaskMode === 'generate'}
                              disabled={taskState.status === 'loading'}
                              name="project-task-mode"
                              type="radio"
                              value="generate"
                              onChange={() => setSelectedTaskMode('generate')}
                            />
                            生成标书
                          </label>
                          <label>
                            <input
                              checked={selectedTaskMode === 'validate'}
                              disabled={taskState.status === 'loading'}
                              name="project-task-mode"
                              type="radio"
                              value="validate"
                              onChange={() => setSelectedTaskMode('validate')}
                            />
                            校核已完成标书
                          </label>
                        </fieldset>
                        <button
                          className="project-start-task"
                          disabled={!selectedTaskMode || taskState.status === 'loading'}
                          onClick={() => void startTask()}
                          type="button"
                        >
                          <Sparkles aria-hidden="true" size={18} />
                          {taskState.status === 'loading'
                            ? '正在创建任务…'
                            : selectedTaskMode === null
                              ? '请选择任务类型'
                            : selectedTaskMode === 'validate'
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
                    ) : null}
                  </div>
                ) : null}

                {activeTab === 'requirements' ? (
                  <RequirementsPanel
                    projectId={projectId}
                    requirements={requirements}
                    onConfirmRequirement={onConfirmRequirement}
                  />
                ) : null}

                {activeTab === 'snapshots' ? (
                  <SnapshotsPanel
                    projectId={projectId}
                    snapshots={snapshots}
                    onOpenSnapshot={onOpenSnapshot}
                  />
                ) : null}
              </section>
            </div>
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
