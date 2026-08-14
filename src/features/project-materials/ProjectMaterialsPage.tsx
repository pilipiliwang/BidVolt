import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileLock2,
  FileText,
  FolderCheck,
  Layers3,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { ProjectWorkbench } from '../../domains/projects/ProjectWorkbench';
import { ProjectWorkspaceTabs } from '../../domains/projects/ProjectWorkspaceTabs';
import { ProjectMaterialUpload } from './components/ProjectMaterialUpload';
import { RequirementsPanel } from './components/RequirementsPanel';
import { SnapshotsPanel } from './components/SnapshotsPanel';
import type {
  ProjectMaterial,
  ProjectMaterialKind,
  ProjectMaterialParseStatus,
  ProjectMaterialsDeliverableSummary,
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

function CollapsibleMaterialGroup({
  children,
  count,
  description,
  expanded,
  icon,
  onToggle,
  panelId,
  title,
  titleId,
}: {
  children: ReactNode;
  count: number;
  description: string;
  expanded: boolean;
  icon: ReactNode;
  onToggle: () => void;
  panelId: string;
  title: string;
  titleId: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className="project-material-group"
      data-expanded={expanded}
    >
      <header className="project-section-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="project-section-heading__actions">
          <span className="project-project-only-badge">
            {icon}
            {count} 项
          </span>
          <button
            aria-controls={panelId}
            aria-expanded={expanded}
            aria-label={`${expanded ? '收起' : '展开'}${title}，${count}项`}
            className="project-section-heading__toggle"
            onClick={onToggle}
            type="button"
          >
            <ChevronDown aria-hidden="true" size={19} />
          </button>
        </div>
      </header>

      <div className="project-material-group__panel" hidden={!expanded} id={panelId}>
        {expanded ? children : null}
      </div>
    </section>
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

type ReviewMetricState = 'available' | 'generated' | 'in-progress' | 'missing' | 'unavailable';

function ReviewMetricCard({
  detail,
  Icon,
  label,
  state,
  unit,
  value,
}: {
  detail: string;
  Icon: typeof BadgeCheck;
  label: string;
  state: ReviewMetricState;
  unit?: string;
  value: number | string;
}) {
  return (
    <article className="project-review-metric-card" data-metric-state={state} role="listitem">
      <div className="project-review-metric-copy">
        <small>{label}</small>
        <strong>{value}{unit ? <span>{unit}</span> : null}</strong>
        <p>{detail}</p>
      </div>
      <span className="project-review-metric-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
    </article>
  );
}

function deliverableMetric(
  deliverables: readonly ProjectMaterialsDeliverableSummary[],
  kind: ProjectMaterialsDeliverableSummary['kind'],
  generationInProgress: boolean,
) {
  const version = deliverables.reduce<number | undefined>((latest, deliverable) => {
    const currentVersionNo = deliverable.currentVersionNo;
    if (deliverable.kind !== kind
      || !Number.isInteger(currentVersionNo)
      || currentVersionNo === undefined
      || currentVersionNo <= 0) return latest;
    return Math.max(latest ?? 0, currentVersionNo);
  }, undefined);

  if (version !== undefined) {
    return { detail: `当前版本 V${version}`, state: 'generated' as const, value: '已生成' };
  }
  if (generationInProgress) {
    return { detail: '后端生成任务处理中', state: 'in-progress' as const, value: '执行中' };
  }
  return { detail: '暂无有效成果版本', state: 'missing' as const, value: '未生成' };
}

function SimulatedReviewPanel({
  deliverables,
  generationInProgress,
  requirements,
}: {
  deliverables: readonly ProjectMaterialsDeliverableSummary[];
  generationInProgress: boolean;
  requirements: ProjectMaterialsPageProps['requirements'];
}) {
  const scoreRuleCount = requirements.filter((item) => item.type === 'score_rule').length;
  const business = deliverableMetric(deliverables, 'business', generationInProgress);
  const technical = deliverableMetric(deliverables, 'technical', generationInProgress);
  const quote = deliverableMetric(deliverables, 'quote', generationInProgress);

  return (
    <section className="project-review-preview" aria-labelledby="project-review-preview-title">
      <div className="project-review-preview__heading">
        <div>
          <h2 id="project-review-preview-title">模拟评标</h2>
          <p>材料与成果真实状态</p>
        </div>
      </div>

      <div className="project-review-metrics" aria-label="模拟评标六项指标" role="list">
        <ReviewMetricCard
          detail="来自招标要求"
          Icon={BadgeCheck}
          label="已识别评分项"
          state="available"
          unit="项"
          value={scoreRuleCount}
        />
        <ReviewMetricCard
          detail="接口待提供"
          Icon={FileText}
          label="已上传标书数量"
          state="unavailable"
          value="—"
        />
        <ReviewMetricCard
          {...business}
          Icon={FileCheck2}
          label="商务标状态"
        />
        <ReviewMetricCard
          {...technical}
          Icon={FolderCheck}
          label="技术标状态"
        />
        <ReviewMetricCard
          {...quote}
          Icon={FileLock2}
          label="报价单状态"
        />
        <ReviewMetricCard
          detail="接口待提供"
          Icon={ShieldAlert}
          label="待校核内容数量"
          state="unavailable"
          value="—"
        />
      </div>

      <p className="project-review-disclaimer">
        指标仅展示后端可复核数据；缺少读取接口的项目不会由前端推算。
      </p>
    </section>
  );
}

export function ProjectMaterialsPage({
  deliverables = [],
  enterpriseCategories = [],
  enterpriseLibraryKey,
  enterpriseMaterials = [],
  generationInProgress = false,
  onAddEnterpriseFiles,
  onAssistantAddFiles,
  onAssistantSend,
  onCompletedBidUpload,
  onImportTenderNoticeUrl,
  projectId,
  projectName,
  materials,
  requirements,
  snapshots,
  completedBidMaterialIds = [],
  supplementalMaterialIds = [],
  onUpload,
  onConfirmRequirement,
  onOpenSnapshot,
  onStartTask,
  taskStatus,
}: ProjectMaterialsPageProps) {
  const [activeTab, setActiveTab] = useState<ProjectMaterialsTab>('materials');
  const [isSupplementalExpanded, setSupplementalExpanded] = useState(false);
  const [isCurrentTenderExpanded, setCurrentTenderExpanded] = useState(true);
  const [isCompletedBidExpanded, setCompletedBidExpanded] = useState(false);
  const materialGroupId = useId();
  const supplementalPanelId = `${materialGroupId}-supplemental-materials`;
  const currentTenderPanelId = `${materialGroupId}-current-tender-materials`;
  const completedBidPanelId = `${materialGroupId}-completed-bid-materials`;
  const [selectedTaskMode, setSelectedTaskMode] = useState<'generate' | 'validate' | null>(null);
  const [taskState, setTaskState] = useState<{
    message: string;
    status: 'error' | 'idle' | 'loading';
  }>({ message: '', status: 'idle' });
  const supplementalMaterialIdSet = useMemo(
    () => new Set(supplementalMaterialIds.map(String)),
    [supplementalMaterialIds],
  );
  const completedBidMaterialIdSet = useMemo(
    () => new Set(completedBidMaterialIds.map(String)),
    [completedBidMaterialIds],
  );
  const supplementalMaterials = useMemo(
    () => materials.filter(
      (material) => supplementalMaterialIdSet.has(material.id)
        && !completedBidMaterialIdSet.has(material.id),
    ),
    [completedBidMaterialIdSet, materials, supplementalMaterialIdSet],
  );
  const completedBidMaterials = useMemo(
    () => materials.filter((material) => completedBidMaterialIdSet.has(material.id)),
    [completedBidMaterialIdSet, materials],
  );
  const currentTenderMaterials = useMemo(
    () => materials.filter(
      (material) => !supplementalMaterialIdSet.has(material.id)
        && !completedBidMaterialIdSet.has(material.id),
    ),
    [completedBidMaterialIdSet, materials, supplementalMaterialIdSet],
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
      enterpriseCategories={enterpriseCategories}
      enterpriseLibraryKey={enterpriseLibraryKey}
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
          deliverables={deliverables}
          generationInProgress={generationInProgress}
          requirements={requirements}
        />
      }
    >
      <section className="project-material-page">
        <div className="project-material-content">
          <div className="project-material-flow">
            <CollapsibleMaterialGroup
              count={supplementalMaterials.length}
              description="仅展示当前登录会话内，通过页面底部“添加文件”成功上传的文件；刷新后分组可能无法恢复。"
              expanded={isSupplementalExpanded}
              icon={<FolderCheck aria-hidden="true" size={14} />}
              onToggle={() => setSupplementalExpanded((current) => !current)}
              panelId={supplementalPanelId}
              title="补充资料"
              titleId="project-supplemental-material-list-title"
            >
              <ProjectMaterialRows
                emptyDescription="请使用页面底部项目助手的“添加文件”上传本项目补充资料。"
                emptyTitle="暂无补充资料"
                materials={supplementalMaterials}
              />
            </CollapsibleMaterialGroup>

            <CollapsibleMaterialGroup
              count={currentTenderMaterials.length}
              description="主上传区和招标公告网址导入的文件保留在本区，解析状态来自后端。"
              expanded={isCurrentTenderExpanded}
              icon={<FileLock2 aria-hidden="true" size={14} />}
              onToggle={() => setCurrentTenderExpanded((current) => !current)}
              panelId={currentTenderPanelId}
              title="当前招标材料"
              titleId="project-current-material-list-title"
            >
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
                      existingBidFileNames={completedBidMaterials.map((material) => material.name)}
                      onExistingBidUpload={onCompletedBidUpload
                        ? (files) => onCompletedBidUpload(projectId, files)
                        : undefined}
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
            </CollapsibleMaterialGroup>

            {completedBidMaterials.length > 0 ? (
              <CollapsibleMaterialGroup
                count={completedBidMaterials.length}
                description="仅展示已由后端返回文件 ID 并归入本项目已完成标书分组的材料。"
                expanded={isCompletedBidExpanded}
                icon={<FileCheck2 aria-hidden="true" size={14} />}
                onToggle={() => setCompletedBidExpanded((current) => !current)}
                panelId={completedBidPanelId}
                title="已完成标书材料"
                titleId="project-completed-bid-material-list-title"
              >
                <ProjectMaterialRows
                  emptyDescription="后端尚未返回可显示的已完成标书材料。"
                  emptyTitle="暂无已完成标书材料"
                  materials={completedBidMaterials}
                />
              </CollapsibleMaterialGroup>
            ) : null}
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
  ProjectMaterialsDeliverableKind,
  ProjectMaterialsDeliverableSummary,
  ProjectMaterialsPageProps,
  ProjectMaterialUploadProps,
  ProjectRequirement,
  ProjectSnapshot,
  RequirementCoordinate,
  RequirementType,
} from './types';
