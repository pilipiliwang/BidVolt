import { Camera, CheckCircle2, Layers3 } from 'lucide-react';

import type { ProjectSnapshot } from '../types';

interface SnapshotsPanelProps {
  projectId: string;
  snapshots: ProjectSnapshot[];
  onOpenSnapshot?: (projectId: string, snapshotId: string) => void;
}

export type SnapshotDetailView = {
  id: string;
  manifest: string;
  type: string;
};

export function SnapshotsPanel({ projectId, snapshots, onOpenSnapshot }: SnapshotsPanelProps) {
  return (
    <section className="project-snapshots" aria-labelledby="project-snapshots-title">
      <header className="project-section-heading">
        <div>
          <p className="project-material-eyebrow">Immutable project state</p>
          <h2 id="project-snapshots-title">项目快照</h2>
          <p>生成、评审与导出只读取任务提交时冻结的材料与 Requirement 版本。</p>
        </div>
        <span className="project-snapshot-count">
          <Camera aria-hidden="true" size={16} />
          {snapshots.length} 个快照
        </span>
      </header>

      <ol className="project-snapshot-list">
        {snapshots.map((snapshot) => {
          const snapshotContent = (
            <>
              <span className="project-snapshot__icon" aria-hidden="true">
                <Layers3 size={19} />
              </span>
              <span className="project-snapshot__copy">
                <strong>{snapshot.label}</strong>
                <small>{snapshot.createdAt}</small>
              </span>
              <span className="project-snapshot__stats">
                <small>{snapshot.materialRevisionCount === undefined ? '材料版本数量未提供' : `${snapshot.materialRevisionCount} 份材料版本`}</small>
                <small>{snapshot.requirementRevisionNo === undefined ? 'Requirement 版本未提供' : `Requirement v${snapshot.requirementRevisionNo}`}</small>
              </span>
              {snapshot.isCurrent && (
                <em>
                  <CheckCircle2 aria-hidden="true" size={14} />
                  当前工作快照
                </em>
              )}
            </>
          );

          return (
            <li key={snapshot.id}>
              {onOpenSnapshot ? (
                <button
                  className={snapshot.isCurrent ? 'project-snapshot project-snapshot--current' : 'project-snapshot'}
                  type="button"
                  onClick={() => onOpenSnapshot(projectId, snapshot.id)}
                >
                  {snapshotContent}
                </button>
              ) : (
                <div
                  className={snapshot.isCurrent ? 'project-snapshot project-snapshot--current project-snapshot--static' : 'project-snapshot project-snapshot--static'}
                >
                  {snapshotContent}
                </div>
              )}
            </li>
          );
        })}
        {snapshots.length === 0 && (
          <li className="project-empty-state">
            <Camera aria-hidden="true" size={28} />
            <h3>尚未冻结快照</h3>
            <p>提交生成或评审任务时，系统会自动创建不可变快照。</p>
          </li>
        )}
      </ol>
    </section>
  );
}
