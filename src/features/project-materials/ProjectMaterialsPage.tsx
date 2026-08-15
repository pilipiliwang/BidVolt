import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileLock2,
  FileText,
  FolderCheck,
  Layers3,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { ProjectReviewSidebar } from '../../domains/projects/ProjectReviewSidebar';
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
  unknown: '解析状态未提供',
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
                <span>{material.revisionNo === undefined ? '文件版本未提供' : `文件版本 ${material.revisionNo}`}</span>
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
  count: number | '—';
  description: string;
  expanded: boolean;
  icon: ReactNode;
  onToggle: () => void;
  panelId: string;
  title: string;
  titleId: string;
}) {
  const countText = count === '—' ? '接口待提供' : `${count} 项`;
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
            {countText}
          </span>
          <button
            aria-controls={panelId}
            aria-expanded={expanded}
            aria-label={`${expanded ? '收起' : '展开'}${title}，${count === '—' ? '数量待接口提供' : `${count}项`}`}
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

export function ProjectMaterialsPage({
  enterpriseCategories = [],
  enterpriseLibraryKey,
  enterpriseMaterials = [],
  onAddEnterpriseFiles,
  onAssistantAddFiles,
  onAssistantSend,
  onCompletedBidUpload,
  onImportTenderNoticeUrl,
  projectId,
  projectName,
  reviewSidebar,
  materials,
  requirements,
  snapshots,
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
  const supplementalMaterials = useMemo(
    () => materials.filter((material) => material.purpose === 'supplemental'),
    [materials],
  );
  const completedBidMaterials = useMemo(
    () => materials.filter((material) => material.purpose === 'completed_bid'),
    [materials],
  );
  const unclassifiedMaterials = useMemo(
    () => materials.filter((material) => material.purpose === undefined),
    [materials],
  );
  const currentProjectMaterials = useMemo(
    () => materials.filter(
      (material) => material.purpose === 'current_tender' || material.purpose === undefined,
    ),
    [materials],
  );
  const hasUnclassifiedMaterials = unclassifiedMaterials.length > 0;
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
      rightRail={<ProjectReviewSidebar viewModel={reviewSidebar} />}
    >
      <section className="project-material-page">
        <div className="project-material-content">
          <div className="project-material-flow">
            <CollapsibleMaterialGroup
              count={hasUnclassifiedMaterials ? '—' : supplementalMaterials.length}
              description={hasUnclassifiedMaterials
                ? '后端文件列表尚未返回用途字段，前端不会根据本次操作或文件名伪造补充资料分类。'
                : '仅展示后端明确标记为补充资料的项目文件。'}
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
              count={currentProjectMaterials.length}
              description={hasUnclassifiedMaterials
                ? '下列文件均来自真实项目文件接口；因后端未返回用途字段，暂不宣称它们全部属于当前招标材料。'
                : '仅展示后端明确标记为当前招标材料的文件，解析状态来自后端。'}
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
                  <span>{currentProjectMaterials.length}</span>
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
                    materials={currentProjectMaterials}
                  />

                  {currentProjectMaterials.length > 0 && !taskBlocksActions ? (
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
  ProjectMaterialsPageProps,
  ProjectMaterialUploadProps,
  ProjectRequirement,
  ProjectSnapshot,
  RequirementCoordinate,
  RequirementType,
} from './types';
