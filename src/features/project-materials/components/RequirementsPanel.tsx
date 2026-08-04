import { AlertTriangle, CheckCircle2, FileSearch, MapPin } from 'lucide-react';

import type { ProjectRequirement, RequirementType } from '../types';

const requirementTypeLabel: Record<RequirementType, string> = {
  basic_info: '基本信息',
  qualification: '资格要求',
  score_rule: '评分细则',
  reject_clause: '否决条款',
  tech_requirement: '技术要求',
  quote_rule: '报价规则',
  material_checklist: '材料清单',
  attachment: '附件说明',
};

interface RequirementsPanelProps {
  projectId: string;
  requirements: ProjectRequirement[];
  onConfirmRequirement?: (projectId: string, requirementId: string) => void;
}

function confidencePercent(confidence: number) {
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}

export function RequirementsPanel({
  projectId,
  requirements,
  onConfirmRequirement,
}: RequirementsPanelProps) {
  const pendingCount = requirements.filter(
    (requirement) => requirement.confirmationStatus === 'needs_confirmation',
  ).length;

  return (
    <section className="project-requirements" aria-labelledby="project-requirements-title">
      <header className="project-section-heading">
        <div>
          <p className="project-material-eyebrow">Parsed requirements</p>
          <h2 id="project-requirements-title">Requirement 基线</h2>
          <p>每条要求都绑定当前项目材料版本和原文坐标。</p>
        </div>
        <span className={pendingCount ? 'project-attention' : 'project-complete'}>
          {pendingCount ? <AlertTriangle aria-hidden="true" size={16} /> : <CheckCircle2 aria-hidden="true" size={16} />}
          {pendingCount ? `${pendingCount} 条待确认` : '全部已确认'}
        </span>
      </header>

      <div className="project-requirement-list">
        {requirements.map((requirement) => {
          const confidence = confidencePercent(requirement.confidence);
          const needsConfirmation = requirement.confirmationStatus === 'needs_confirmation';
          const { coordinate } = requirement;

          return (
            <article
              className={`project-requirement${needsConfirmation ? ' project-requirement--attention' : ''}`}
              key={requirement.id}
            >
              <div className="project-requirement__type">
                <FileSearch aria-hidden="true" size={18} />
                <span>{requirementTypeLabel[requirement.type]}</span>
              </div>
              <div className="project-requirement__body">
                <div className="project-requirement__title-row">
                  <h3>{requirement.title}</h3>
                  <span className={confidence < 70 ? 'project-confidence project-confidence--low' : 'project-confidence'}>
                    置信度 {confidence}%
                  </span>
                </div>
                <p>{requirement.content}</p>
                <div className="project-requirement__source">
                  <MapPin aria-hidden="true" size={14} />
                  <span>
                    {coordinate.fileName} · 文件版本 {coordinate.fileRevisionNo}
                    {coordinate.pageNo ? ` · 第 ${coordinate.pageNo} 页` : ''}
                    {coordinate.blockIndex ? ` · 文本块 ${coordinate.blockIndex}` : ''}
                  </span>
                  <span>Requirement 版本 {requirement.revisionNo}</span>
                </div>
              </div>
              {needsConfirmation ? (
                <button
                  className="project-primary-button"
                  type="button"
                  onClick={() => onConfirmRequirement?.(projectId, requirement.id)}
                >
                  确认原文
                </button>
              ) : (
                <span className="project-confirmed">
                  <CheckCircle2 aria-hidden="true" size={15} />
                  已确认
                </span>
              )}
            </article>
          );
        })}
        {requirements.length === 0 && (
          <div className="project-empty-state">
            <FileSearch aria-hidden="true" size={28} />
            <h3>尚未生成 Requirement</h3>
            <p>材料解析完成后会在此生成资格、评分、技术和报价要求。</p>
          </div>
        )}
      </div>
    </section>
  );
}
