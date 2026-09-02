import {
  AlertCircle,
  Check,
  FileCheck2,
  FileOutput,
  FolderUp,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';

import './ProjectFlowTrack.css';

export type ProjectFlowStageId =
  | 'enterprise-assets'
  | 'project-materials'
  | 'bid-preparation'
  | 'deliverables';

export type ProjectFlowStageStatus = 'completed' | 'current' | 'pending' | 'error';

export interface ProjectFlowStageState {
  /** Optional secondary text supplied by the current backend-backed page state. */
  activity?: 'manual' | 'processing';
  description?: string;
  status: ProjectFlowStageStatus;
}

export interface ProjectFlowTrackProps {
  /** Every status is supplied by the caller; this component does not infer project progress. */
  stages: Record<ProjectFlowStageId, ProjectFlowStageState>;
  className?: string;
}

interface StageDefinition {
  id: ProjectFlowStageId;
  label: string;
  Icon: LucideIcon;
}

const stageDefinitions: StageDefinition[] = [
  { id: 'enterprise-assets', label: '上传企业资料', Icon: FolderUp },
  { id: 'project-materials', label: '上传材料', Icon: FileCheck2 },
  { id: 'bid-preparation', label: '标书制作 / 审核', Icon: FileOutput },
  { id: 'deliverables', label: '成果生成', Icon: Check },
];

const statusLabels: Record<ProjectFlowStageStatus, string> = {
  completed: '已完成',
  current: '进行中',
  pending: '未开始',
  error: '存在异常',
};

function StatusIcon({ activity, status, StageIcon }: {
  activity?: ProjectFlowStageState['activity'];
  status: ProjectFlowStageStatus;
  StageIcon: LucideIcon;
}) {
  if (status === 'completed') return <Check aria-hidden="true" size={18} strokeWidth={2.5} />;
  if (status === 'current') return activity === 'processing'
    ? <LoaderCircle aria-hidden="true" size={18} />
    : <StageIcon aria-hidden="true" size={18} />;
  if (status === 'error') return <AlertCircle aria-hidden="true" size={18} />;
  return <StageIcon aria-hidden="true" size={18} />;
}

export function ProjectFlowTrack({ className = '', stages }: ProjectFlowTrackProps) {
  return (
    <nav
      aria-label="项目流程"
      className={`project-flow-track ${className}`.trim()}
    >
      <ol className="project-flow-track__list">
        {stageDefinitions.map(({ id, label, Icon }, index) => {
          const stage = stages[id];
          return (
            <li
              aria-current={stage.status === 'current' ? 'step' : undefined}
              className={`project-flow-track__stage project-flow-track__stage--${stage.status} project-flow-track__stage--${stage.activity ?? 'manual'}`}
              key={id}
            >
              {index > 0 ? <span aria-hidden="true" className="project-flow-track__connector" /> : null}
              <span className="project-flow-track__marker">
                <StatusIcon activity={stage.activity} StageIcon={Icon} status={stage.status} />
              </span>
              <span className="project-flow-track__content">
                <span className="project-flow-track__eyebrow">
                  第 {index + 1} 步 · {statusLabels[stage.status]}
                </span>
                <strong>{label}</strong>
                {stage.description ? <small>{stage.description}</small> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
