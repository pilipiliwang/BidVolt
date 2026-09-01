import { useRef, useState } from 'react';
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
  unknown: '类型未提供',
};

interface RequirementsPanelProps {
  projectId: string;
  requirements: ProjectRequirement[];
  onConfirmRequirement?: (projectId: string, requirementId: string) => Promise<void> | void;
  onCorrectRequirement?: (
    projectId: string,
    requirementId: string,
    content: string,
  ) => Promise<void> | void;
}

function confidencePercent(confidence: number) {
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}

export function RequirementsPanel({
  projectId,
  requirements,
  onConfirmRequirement,
  onCorrectRequirement,
}: RequirementsPanelProps) {
  const confirmingRequirementIdsRef = useRef(new Set<string>());
  const correctingRequirementIdsRef = useRef(new Set<string>());
  const [confirmingRequirementIds, setConfirmingRequirementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [correctingRequirementIds, setCorrectingRequirementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [confirmationErrors, setConfirmationErrors] = useState<Record<string, string>>({});
  const [correctionErrors, setCorrectionErrors] = useState<Record<string, string>>({});
  const pendingCount = requirements.filter(
    (requirement) => requirement.confirmationStatus === 'needs_confirmation',
  ).length;
  const unavailableCount = requirements.filter(
    (requirement) => requirement.confirmationStatus === 'unavailable',
  ).length;

  const handleConfirm = async (requirementId: string) => {
    if (
      !onConfirmRequirement
      || confirmingRequirementIdsRef.current.has(requirementId)
      || correctingRequirementIdsRef.current.has(requirementId)
    ) return;

    confirmingRequirementIdsRef.current.add(requirementId);
    setConfirmingRequirementIds(new Set(confirmingRequirementIdsRef.current));
    setConfirmationErrors((current) => {
      if (!(requirementId in current)) return current;
      const next = { ...current };
      delete next[requirementId];
      return next;
    });

    try {
      await onConfirmRequirement(projectId, requirementId);
    } catch (error) {
      const detail = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : '服务暂时不可用，请稍后重试。';
      setConfirmationErrors((current) => ({
        ...current,
        [requirementId]: `确认失败：${detail}`,
      }));
    } finally {
      confirmingRequirementIdsRef.current.delete(requirementId);
      setConfirmingRequirementIds(new Set(confirmingRequirementIdsRef.current));
    }
  };

  const beginCorrection = (requirement: ProjectRequirement) => {
    if (
      !onCorrectRequirement
      || correctingRequirementIdsRef.current.has(requirement.id)
      || confirmingRequirementIdsRef.current.has(requirement.id)
    ) return;
    setCorrectionDrafts((current) => ({
      ...current,
      [requirement.id]: requirement.content,
    }));
    setCorrectionErrors((current) => {
      if (!(requirement.id in current)) return current;
      const next = { ...current };
      delete next[requirement.id];
      return next;
    });
  };

  const cancelCorrection = (requirementId: string) => {
    if (correctingRequirementIdsRef.current.has(requirementId)) return;
    setCorrectionDrafts((current) => {
      const next = { ...current };
      delete next[requirementId];
      return next;
    });
    setCorrectionErrors((current) => {
      if (!(requirementId in current)) return current;
      const next = { ...current };
      delete next[requirementId];
      return next;
    });
  };

  const handleCorrect = async (requirementId: string) => {
    if (
      !onCorrectRequirement
      || correctingRequirementIdsRef.current.has(requirementId)
      || confirmingRequirementIdsRef.current.has(requirementId)
    ) return;

    const content = correctionDrafts[requirementId]?.trim() ?? '';
    if (!content) {
      setCorrectionErrors((current) => ({
        ...current,
        [requirementId]: '请输入纠正后的 Requirement 内容。',
      }));
      return;
    }

    correctingRequirementIdsRef.current.add(requirementId);
    setCorrectingRequirementIds(new Set(correctingRequirementIdsRef.current));
    setCorrectionErrors((current) => {
      if (!(requirementId in current)) return current;
      const next = { ...current };
      delete next[requirementId];
      return next;
    });

    try {
      await onCorrectRequirement(projectId, requirementId, content);
      setCorrectionDrafts((current) => {
        const next = { ...current };
        delete next[requirementId];
        return next;
      });
    } catch (error) {
      const detail = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : '服务暂时不可用，请稍后重试。';
      setCorrectionErrors((current) => ({
        ...current,
        [requirementId]: `纠正失败：${detail}`,
      }));
    } finally {
      correctingRequirementIdsRef.current.delete(requirementId);
      setCorrectingRequirementIds(new Set(correctingRequirementIdsRef.current));
    }
  };

  return (
    <section className="project-requirements" aria-labelledby="project-requirements-title">
      <header className="project-section-heading">
        <div>
          <p className="project-material-eyebrow">Parsed requirements</p>
          <h2 id="project-requirements-title">Requirement 基线</h2>
          <p>每条要求都绑定当前项目材料版本和原文坐标。</p>
        </div>
        <span className={pendingCount || unavailableCount ? 'project-attention' : 'project-complete'}>
          {pendingCount || unavailableCount ? <AlertTriangle aria-hidden="true" size={16} /> : <CheckCircle2 aria-hidden="true" size={16} />}
          {pendingCount
            ? `${pendingCount} 条待确认`
            : unavailableCount
              ? '后端未提供确认状态'
              : '全部已确认'}
        </span>
      </header>

      <div className="project-requirement-list">
        {requirements.map((requirement) => {
          const confidence = requirement.confidence === undefined
            ? undefined
            : confidencePercent(requirement.confidence);
          const needsConfirmation = requirement.confirmationStatus === 'needs_confirmation';
          const isConfirming = confirmingRequirementIds.has(requirement.id);
          const isCorrecting = correctingRequirementIds.has(requirement.id);
          const isEditingCorrection = correctionDrafts[requirement.id] !== undefined;
          const confirmationError = confirmationErrors[requirement.id];
          const correctionError = correctionErrors[requirement.id];
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
                  <span className={confidence !== undefined && confidence < 70 ? 'project-confidence project-confidence--low' : 'project-confidence'}>
                    {confidence === undefined ? '置信度未提供' : `置信度 ${confidence}%`}
                  </span>
                </div>
                <p>{requirement.content}</p>
                <div className="project-requirement__source">
                  <MapPin aria-hidden="true" size={14} />
                  <span>
                    {coordinate.fileName} · {coordinate.fileRevisionNo === undefined ? '文件版本未提供' : `文件版本 ${coordinate.fileRevisionNo}`}
                    {coordinate.pageNo ? ` · 第 ${coordinate.pageNo} 页` : ''}
                    {coordinate.blockIndex ? ` · 文本块 ${coordinate.blockIndex}` : ''}
                  </span>
                  <span>Requirement 版本 {requirement.revisionNo}</span>
                </div>
                {isEditingCorrection ? (
                  <form
                    className="project-requirement__correction"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleCorrect(requirement.id);
                    }}
                  >
                    <label htmlFor={`requirement-correction-${requirement.id}`}>
                      纠正后内容
                    </label>
                    <textarea
                      id={`requirement-correction-${requirement.id}`}
                      disabled={isCorrecting}
                      rows={4}
                      value={correctionDrafts[requirement.id] ?? ''}
                      onChange={(event) => {
                        const { value } = event.target;
                        setCorrectionDrafts((current) => ({
                          ...current,
                          [requirement.id]: value,
                        }));
                      }}
                    />
                    <div className="project-requirement__correction-actions">
                      <button
                        className="project-primary-button"
                        aria-busy={isCorrecting}
                        disabled={isCorrecting}
                        type="submit"
                      >
                        {isCorrecting ? '保存中…' : '保存纠正'}
                      </button>
                      <button
                        className="project-requirement__cancel-button"
                        disabled={isCorrecting}
                        type="button"
                        onClick={() => cancelCorrection(requirement.id)}
                      >
                        取消
                      </button>
                    </div>
                    {correctionError ? (
                      <p className="project-requirement__error" role="alert">
                        {correctionError}
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </div>
              <div className="project-requirement__action">
                {needsConfirmation ? (
                  <>
                    <button
                      aria-busy={isConfirming}
                      className="project-primary-button"
                      disabled={isConfirming || isCorrecting}
                      type="button"
                      onClick={() => void handleConfirm(requirement.id)}
                    >
                      {isConfirming ? '确认中…' : '确认原文'}
                    </button>
                    {confirmationError ? (
                      <p className="project-requirement__error" role="alert">
                        {confirmationError}
                      </p>
                    ) : null}
                  </>
                ) : requirement.confirmationStatus === 'confirmed' ? (
                  <span className="project-confirmed">
                    <CheckCircle2 aria-hidden="true" size={15} />
                    已确认
                  </span>
                ) : (
                  <span className="project-attention">确认状态未提供</span>
                )}
                {onCorrectRequirement ? (
                  <button
                    aria-expanded={isEditingCorrection}
                    className="project-requirement__correct-button"
                    disabled={isConfirming || isCorrecting || isEditingCorrection}
                    type="button"
                    onClick={() => beginCorrection(requirement)}
                  >
                    纠正内容
                  </button>
                ) : null}
              </div>
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
