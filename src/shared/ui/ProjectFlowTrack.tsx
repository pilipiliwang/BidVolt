import {
  AlertCircle,
  Check,
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
}

const stageDefinitions: StageDefinition[] = [
  { id: 'enterprise-assets', label: '上传企业资料' },
  { id: 'project-materials', label: '上传材料' },
  { id: 'bid-preparation', label: '标书制作 / 审核' },
  { id: 'deliverables', label: '成果生成' },
];

const statusLabels: Record<ProjectFlowStageStatus, string> = {
  completed: '已完成',
  current: '进行中',
  pending: '未开始',
  error: '存在异常',
};

function StageMarker({ index, status }: {
  index: number;
  status: ProjectFlowStageStatus;
}) {
  if (status === 'completed') return <Check aria-hidden="true" size={18} strokeWidth={2.5} />;
  if (status === 'error') return <AlertCircle aria-hidden="true" size={18} />;
  return <span aria-hidden="true">{index + 1}</span>;
}

export function ProjectFlowTrack({ className = '', stages }: ProjectFlowTrackProps) {
  return (
    <nav
      aria-label="项目流程"
      className={`project-flow-track ${className}`.trim()}
    >
      <ol className="project-flow-track__list">
        {stageDefinitions.map(({ id, label }, index) => {
          const stage = stages[id];
          return (
            <li
              aria-current={stage.status === 'current' ? 'step' : undefined}
              className={`project-flow-track__stage project-flow-track__stage--${stage.status} project-flow-track__stage--${stage.activity ?? 'manual'}`}
              key={id}
            >
              <span className="project-flow-track__marker">
                <StageMarker index={index} status={stage.status} />
              </span>
              <span className="project-flow-track__content">
                <strong>{label}</strong>
                <span className="project-flow-track__status">{statusLabels[stage.status]}</span>
                {stage.description ? <small>{stage.description}</small> : null}
              </span>
              {index < stageDefinitions.length - 1 ? (
                <span aria-hidden="true" className="project-flow-track__connector" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
