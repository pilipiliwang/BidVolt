import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  LoaderCircle,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

import './project-resource-rail.css';
import './project-resource-simplified.css';
import { officeVersionLabel, type OfficeFileVersion } from './OnlyOfficeSaveControls';
import { FileDownloadButton } from '../../shared/ui/FileDownloadButton';
import { buildEnterpriseWorkspaceFolders } from '../../features/enterprise-assets/category-folders';

export type ProjectResourceFile = {
  id: string;
  fileId?: string;
  name: string;
  sizeLabel?: string;
  statusLabel?: string;
  officeVersion?: number;
  officeVersions?: readonly OfficeFileVersion[];
};

export type ProjectEnterpriseCategory = {
  id: string;
  label: string;
  parentId?: string | null;
};

export type ProjectEnterpriseFile = ProjectResourceFile & {
  categoryId?: string | null;
};

export type ProjectTenderMaterialKind = 'tender' | 'notice' | 'supplement';

export type ProjectTenderMaterial = ProjectResourceFile & {
  kind?: ProjectTenderMaterialKind;
};

export const PROJECT_RESULT_CATEGORIES = [
  'business',
  'technical',
  'price',
  'internal',
  'unclassified',
] as const;

export type ProjectResultCategory = (typeof PROJECT_RESULT_CATEGORIES)[number];

export type ProjectResultFile = ProjectResourceFile & {
  /** Supplied by the backend. The UI deliberately never infers it from the filename. */
  category: ProjectResultCategory;
  mediaType?: string;
  selectedVersionId?: string;
  versionLabel?: string;
  /** A freshness key for the remote bytes, not a requestable historical version. */
  remoteRevision?: string;
  versions?: readonly ProjectResultFileVersion[];
};

export type ProjectResultFileVersion = {
  id: string;
  isCurrent?: boolean;
  label?: string;
  name?: string;
  sizeLabel?: string;
};

export type ProjectResultGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';

export type ProjectResultGenerationState = {
  folders?: Partial<Record<ProjectResultCategory, ProjectResultGenerationStatus>>;
  overall: ProjectResultGenerationStatus;
};

export type ProjectResultFileSelection = {
  category: ProjectResultCategory;
  id: string;
  versionId?: string;
};

export type ProjectResourceFileSelection = {
  id: string;
  source: 'enterprise' | 'tender';
};

export type ProjectResourceRailProps = {
  enterpriseCategories?: readonly ProjectEnterpriseCategory[];
  enterpriseFiles?: readonly ProjectEnterpriseFile[];
  enterpriseUploadControl?: ReactNode;
  onSelectEnterpriseFile?: (file: ProjectEnterpriseFile) => void;
  onSelectResultFile?: (file: ProjectResultFile) => void;
  onSelectTenderMaterial?: (file: ProjectTenderMaterial) => void;
  onDownloadAllResults?: () => void | Promise<void>;
  onSelectResultVersion?: (versionId: string) => void;
  resultFiles?: readonly ProjectResultFile[];
  resultGeneration: ProjectResultGenerationState;
  selectedResourceFile?: ProjectResourceFileSelection | null;
  selectedResultFile?: ProjectResultFileSelection | null;
  selectedResultVersionId?: string | null;
  tenderMaterials?: readonly ProjectTenderMaterial[];
};

type ResourceGroupKey = 'enterprise' | 'tender' | 'results';

const RESULT_CATEGORY_LABELS: Record<ProjectResultCategory, string> = {
  business: '商务文件',
  technical: '技术文件',
  price: '价格文件',
  internal: '内部管理文件',
  unclassified: '待分类成果',
};

const GENERATION_STATUS_LABELS: Record<ProjectResultGenerationStatus, string> = {
  pending: '待生成',
  generating: '生成中',
  completed: '已生成',
  failed: '生成失败',
};

function isProjectResultCategory(value: unknown): value is ProjectResultCategory {
  return typeof value === 'string'
    && (PROJECT_RESULT_CATEGORIES as readonly string[]).includes(value);
}

export function projectResultFileKey(file: Pick<ProjectResultFile, 'category' | 'id'>) {
  return `${file.category}:${file.id}`;
}

/**
 * Applies an incremental backend file batch without guessing a folder from the filename.
 * Existing positions remain stable, updates replace the matching category + id record,
 * and genuinely new files are appended in backend arrival order.
 */
export function upsertProjectResultFiles(
  current: readonly ProjectResultFile[],
  incoming: readonly ProjectResultFile[],
): ProjectResultFile[] {
  const merged: ProjectResultFile[] = [];
  const indexByKey = new Map<string, number>();

  const apply = (file: ProjectResultFile) => {
    if (!file.id || !isProjectResultCategory(file.category)) return;
    const key = projectResultFileKey(file);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...file });
      return;
    }
    merged[existingIndex] = { ...merged[existingIndex], ...file };
  };

  current.forEach(apply);
  incoming.forEach(apply);
  return merged;
}

export function ProjectResourceRail({
  enterpriseCategories = [],
  enterpriseFiles = [],
  enterpriseUploadControl,
  onSelectEnterpriseFile,
  onDownloadAllResults,
  onSelectResultFile,
  onSelectResultVersion,
  onSelectTenderMaterial,
  resultFiles = [],
  resultGeneration,
  selectedResourceFile,
  selectedResultFile,
  selectedResultVersionId,
  tenderMaterials = [],
}: ProjectResourceRailProps) {
  const contentIdPrefix = useId();
  const [expandedGroups, setExpandedGroups] = useState<Record<ResourceGroupKey, boolean>>({
    enterprise: false,
    tender: false,
    results: true,
  });
  const [expandedEnterpriseFolders, setExpandedEnterpriseFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedResultFolders, setExpandedResultFolders] = useState<Set<ProjectResultCategory>>(
    () => new Set(),
  );

  const normalizedResultFiles = useMemo(
    () => upsertProjectResultFiles([], resultFiles),
    [resultFiles],
  );
  const enterpriseFolders = useMemo(
    () => buildEnterpriseFolders(enterpriseCategories, enterpriseFiles),
    [enterpriseCategories, enterpriseFiles],
  );
  const resultVersions = useMemo(
    () => collectWholePackageVersions(normalizedResultFiles),
    [normalizedResultFiles],
  );
  const requestedPackageVersion = selectedResultVersionId
    && resultVersions.some((version) => version.id === selectedResultVersionId)
    ? selectedResultVersionId
    : null;
  const selectedPackageVersion = requestedPackageVersion
    ?? resultVersions.find((version) => version.isCurrent)?.id
    ?? resultVersions[0]?.id;

  useEffect(() => {
    if (!selectedResultVersionId || !selectedPackageVersion
      || selectedResultVersionId === selectedPackageVersion) return;
    onSelectResultVersion?.(selectedPackageVersion);
  }, [onSelectResultVersion, selectedPackageVersion, selectedResultVersionId]);

  useEffect(() => {
    if (!selectedResultFile) return;
    setExpandedGroups((current) => current.results
      ? current
      : { ...current, results: true });
    setExpandedResultFolders((current) => {
      if (current.has(selectedResultFile.category)) return current;
      const next = new Set(current);
      next.add(selectedResultFile.category);
      return next;
    });
  }, [selectedResultFile]);

  useEffect(() => {
    if (!selectedResourceFile) return;
    setExpandedGroups((current) => current[selectedResourceFile.source]
      ? current
      : { ...current, [selectedResourceFile.source]: true });
    if (selectedResourceFile.source !== 'enterprise') return;
    const selectedFile = enterpriseFiles.find((file) => file.id === selectedResourceFile.id);
    const folder = enterpriseFolders.find((candidate) => (
      candidate.files.some((file) => file.id === selectedFile?.id)
    ));
    if (folder) setExpandedEnterpriseFolders((current) => (
      current.has(folder.id) ? current : new Set(current).add(folder.id)
    ));
  }, [enterpriseFiles, enterpriseFolders, selectedResourceFile]);

  const toggleGroup = (group: ResourceGroupKey) => {
    setExpandedGroups((current) => ({ ...current, [group]: !current[group] }));
  };
  const toggleEnterpriseFolder = (folderId: string) => {
    setExpandedEnterpriseFolders((current) => toggleSetValue(current, folderId));
  };
  const toggleResultFolder = (category: ProjectResultCategory) => {
    setExpandedResultFolders((current) => toggleSetValue(current, category));
  };

  const resultGroupLabel = resultGeneration.overall === 'generating'
      ? '标书成果（生成中）'
      : '标书成果';

  return (
    <aside aria-label="项目资源与标书成果" className="bv-resource-rail">
      <ResourceGroupToggle
        contentId={`${contentIdPrefix}-enterprise`}
        count={enterpriseFiles.length}
        expanded={expandedGroups.enterprise}
        icon={<Building2 aria-hidden="true" size={20} />}
        label="企业资料"
        onToggle={() => toggleGroup('enterprise')}
      />
      {expandedGroups.enterprise ? (
        <section
          aria-label="企业资料内容"
          className="bv-resource-rail__group-content bv-resource-rail__group-content--enterprise"
          id={`${contentIdPrefix}-enterprise`}
        >
          {enterpriseFolders.length > 0 ? (
            enterpriseFolders.map((folder) => {
              const expanded = expandedEnterpriseFolders.has(folder.id);
              const folderContentId = `${contentIdPrefix}-enterprise-folder-${folder.id}`;
              return (
                <div className="bv-resource-folder" key={folder.id}>
                  <FolderToggle
                    contentId={folderContentId}
                    count={folder.files.length}
                    expanded={expanded}
                    label={folder.label}
                    onToggle={() => toggleEnterpriseFolder(folder.id)}
                  />
                  {expanded ? (
                    folder.files.length > 0 ? (
                      <ResourceFileList
                        files={folder.files}
                        id={folderContentId}
                        label={`${folder.label}企业资料`}
                        onSelect={onSelectEnterpriseFile}
                        selectedId={selectedResourceFile?.source === 'enterprise'
                          ? selectedResourceFile.id
                          : undefined}
                      />
                    ) : (
                      <EmptyFolder id={folderContentId} label="该分类暂无资料" />
                    )
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="bv-resource-rail__empty" role="status">暂无企业资料分类</p>
          )}
          {enterpriseUploadControl ? (
            <div className="bv-resource-rail__upload-slot">{enterpriseUploadControl}</div>
          ) : null}
        </section>
      ) : null}

      <ResourceGroupToggle
        contentId={`${contentIdPrefix}-tender`}
        count={tenderMaterials.length}
        expanded={expandedGroups.tender}
        icon={<Folder aria-hidden="true" size={20} />}
        label="招标材料"
        onToggle={() => toggleGroup('tender')}
      />
      {expandedGroups.tender ? (
        <section
          aria-label="本项目招标材料"
          className="bv-resource-rail__group-content"
          id={`${contentIdPrefix}-tender`}
        >
          {tenderMaterials.length > 0 ? (
            <ResourceFileList
              files={tenderMaterials}
              label="本项目招标材料文件"
              onSelect={onSelectTenderMaterial}
              selectedId={selectedResourceFile?.source === 'tender'
                ? selectedResourceFile.id
                : undefined}
              showKind
            />
          ) : (
            <p className="bv-resource-rail__empty" role="status">暂无招标材料</p>
          )}
        </section>
      ) : null}

      <ResourceGroupToggle
        contentId={`${contentIdPrefix}-results`}
        count={normalizedResultFiles.length}
        expanded={expandedGroups.results}
        icon={<FileArchive aria-hidden="true" size={20} />}
        label={resultGroupLabel}
        onToggle={() => toggleGroup('results')}
      />
      {expandedGroups.results ? (
        <section
          aria-label="标书成果文件夹"
          className="bv-resource-rail__group-content bv-resource-rail__group-content--results"
          id={`${contentIdPrefix}-results`}
        >
          {resultVersions.length > 0 ? (
            <label className="bv-resource-rail__package-version">
              <span>成果版本</span>
              <select
                aria-label="标书成果整包版本"
                onChange={(event) => onSelectResultVersion?.(event.target.value)}
                value={selectedPackageVersion}
              >
                {resultVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.label}{version.isCurrent ? ' · 最新' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {PROJECT_RESULT_CATEGORIES.map((category) => {
            const files = normalizedResultFiles.filter((file) => file.category === category);
            if (category === 'unclassified' && files.length === 0) return null;
            const expanded = expandedResultFolders.has(category);
            const folderStatus = resultGeneration.folders?.[category] ?? resultGeneration.overall;
            const folderContentId = `${contentIdPrefix}-result-folder-${category}`;
            return (
              <div className="bv-resource-folder bv-resource-folder--result" key={category}>
                <ResultFolderToggle
                  category={category}
                  contentId={folderContentId}
                  count={files.length}
                  expanded={expanded}
                  onToggle={() => toggleResultFolder(category)}
                  status={folderStatus}
                />
                {expanded ? (
                  files.length > 0 ? (
                    <ResultFileList
                      files={files}
                      id={folderContentId}
                      onSelect={onSelectResultFile}
                      selected={selectedResultFile}
                    />
                  ) : (
                    <EmptyFolder
                      id={folderContentId}
                      label={folderStatus === 'generating'
                        ? '文件生成后将自动出现在此处'
                        : '该文件夹暂无成果'}
                    />
                  )
                ) : null}
              </div>
            );
          })}
          {normalizedResultFiles.length > 0 && onDownloadAllResults ? (
            <FileDownloadButton className="bv-resource-rail__download-all" onDownload={onDownloadAllResults}
              label="下载全部标书成果" pendingLabel="正在打包下载…" />
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

function ResourceGroupToggle({
  contentId,
  count,
  expanded,
  icon,
  label,
  onToggle,
}: {
  contentId: string;
  count: number;
  expanded: boolean;
  icon: ReactNode;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-controls={contentId}
      aria-expanded={expanded}
      aria-label={`${label} ${count}项`}
      className="bv-resource-rail__group-toggle"
      onClick={onToggle}
      type="button"
    >
      <span className="bv-resource-rail__group-icon">{icon}</span>
      <span className="bv-resource-rail__group-label">{label}</span>
      <small className="bv-resource-rail__group-count">{`${count}项`}</small>
      <ChevronDown aria-hidden="true" className="bv-resource-rail__group-chevron" size={17} />
    </button>
  );
}

function FolderToggle({
  contentId,
  count,
  expanded,
  label,
  onToggle,
}: {
  contentId: string;
  count: number;
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-controls={contentId}
      aria-expanded={expanded}
      className="bv-resource-folder__toggle"
      onClick={onToggle}
      title={label}
      type="button"
    >
      <ChevronRight aria-hidden="true" className="bv-resource-folder__chevron" size={14} />
      {expanded
        ? <FolderOpen aria-hidden="true" size={18} />
        : <Folder aria-hidden="true" size={18} />}
      <span>{label}</span>
      <small>{count}</small>
    </button>
  );
}

function ResultFolderToggle({
  category,
  contentId,
  count,
  expanded,
  onToggle,
  status,
}: {
  category: ProjectResultCategory;
  contentId: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  status: ProjectResultGenerationStatus;
}) {
  return (
    <button
      aria-controls={contentId}
      aria-expanded={expanded}
      className="bv-resource-folder__toggle bv-resource-folder__toggle--result"
      onClick={onToggle}
      title={RESULT_CATEGORY_LABELS[category]}
      type="button"
    >
      <ChevronRight aria-hidden="true" className="bv-resource-folder__chevron" size={14} />
      {expanded
        ? <FolderOpen aria-hidden="true" size={18} />
        : <Folder aria-hidden="true" size={18} />}
      <span>{RESULT_CATEGORY_LABELS[category]}</span>
      {count > 0 ? <small className="bv-resource-folder__count">{count}</small> : null}
      <span className={`bv-resource-folder__status bv-resource-folder__status--${status}`}>
        <GenerationStatusIcon status={status} />
        {status !== 'completed' ? <span>{GENERATION_STATUS_LABELS[status]}</span> : null}
      </span>
    </button>
  );
}

function GenerationStatusIcon({ status }: { status: ProjectResultGenerationStatus }) {
  const Icon = status === 'completed'
    ? CheckCircle2
    : status === 'generating'
      ? LoaderCircle
      : status === 'failed'
        ? AlertCircle
        : CircleDashed;
  return (
    <span
      aria-label={GENERATION_STATUS_LABELS[status]}
      className={`bv-resource-generation-icon bv-resource-generation-icon--${status}`}
      role="img"
      title={GENERATION_STATUS_LABELS[status]}
    >
      <Icon aria-hidden="true" size={15} />
    </span>
  );
}

function ResourceFileList<TFile extends ProjectResourceFile>({
  files,
  id,
  label,
  onSelect,
  selectedId,
  showKind = false,
}: {
  files: readonly TFile[];
  id?: string;
  label: string;
  onSelect?: (file: TFile) => void;
  selectedId?: string;
  showKind?: boolean;
}) {
  return (
    <ul aria-label={label} className="bv-resource-rail__files" id={id}>
      {files.map((file) => (
        <li key={file.id}>
          <button
            aria-current={selectedId === file.id ? 'page' : undefined}
            className={selectedId === file.id ? 'is-selected' : undefined}
            disabled={!onSelect}
            onClick={() => onSelect?.(file)}
            title={file.name}
            type="button"
          >
            <FileText aria-hidden="true" size={15} />
            <span>{file.name}</span>
            {showKind && 'kind' in file && typeof file.kind === 'string' ? (
              <small>{tenderKindLabel(file.kind as ProjectTenderMaterialKind)}</small>
            ) : null}
          </button>
          <OfficeVersionList file={file} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function ResultFileList({
  files,
  id,
  onSelect,
  selected,
}: {
  files: readonly ProjectResultFile[];
  id: string;
  onSelect?: (file: ProjectResultFile) => void;
  selected?: ProjectResultFileSelection | null;
}) {
  return (
    <ul aria-label="标书成果文件" className="bv-resource-rail__files bv-resource-rail__files--results" id={id}>
      {files.map((file) => {
        const isSelected = selected?.category === file.category && selected.id === file.id;
        return (
          <li key={projectResultFileKey(file)}>
            <button
              aria-current={isSelected ? 'page' : undefined}
              className={isSelected ? 'is-selected' : undefined}
              disabled={!onSelect}
              onClick={() => onSelect?.(file)}
              title={file.name}
              type="button"
            >
              <FileText aria-hidden="true" size={15} />
              <span>
                <span>{file.name}</span>
                {file.versionLabel || file.sizeLabel ? (
                  <small>{[file.versionLabel, file.sizeLabel].filter(Boolean).join(' · ')}</small>
                ) : null}
              </span>
            </button>
            <OfficeVersionList file={file} onSelect={onSelect} />
          </li>
        );
      })}
    </ul>
  );
}

function OfficeVersionList<TFile extends ProjectResourceFile>({ file, onSelect }: {
  file: TFile;
  onSelect?: (file: TFile) => void;
}) {
  if (!file.officeVersions || file.officeVersions.length < 2) return null;
  return <details className="bv-resource-rail__office-versions">
    <summary>历史版本 · {file.officeVersions.length}</summary>
    <ul aria-label={`${file.name} 的历史版本`}>
      {file.officeVersions.map((version) => <li key={version.version}>
        <button type="button" disabled={!onSelect}
          onClick={() => onSelect?.({ ...file, officeVersion: version.version })}
          aria-label={`打开 ${file.name} ${officeVersionLabel(version.version)}`}>
          <FileText aria-hidden="true" size={13} />
          <span>{officeVersionLabel(version.version)}{version.isCurrent ? ' · 最新' : ''}</span>
        </button>
      </li>)}
    </ul>
  </details>;
}

function formatResultVersion(versionId: string) {
  const normalized = versionId.trim();
  if (!normalized) return '版本待返回';
  return /^v/i.test(normalized) ? `V${normalized.slice(1)}` : `V${normalized}`;
}

/**
 * A version can be advertised as an entire result package only when every
 * customer-facing result file supplies that exact version. Using a union here
 * silently mixed old and new files whenever one deliverable lagged behind.
 */
export function collectWholePackageVersions(files: readonly ProjectResultFile[]) {
  const customerFiles = files.filter((file) => file.category !== 'internal');
  if (customerFiles.length === 0 || customerFiles.some((file) => !file.versions?.length)) return [];

  const [firstFile, ...remainingFiles] = customerFiles;
  const firstVersions = firstFile.versions ?? [];
  return firstVersions
    .filter((version) => remainingFiles.every((file) => (
      file.versions?.some((candidate) => candidate.id === version.id)
    )))
    .map((version) => ({
      id: version.id,
      isCurrent: customerFiles.every((file) => (
        file.versions?.find((candidate) => candidate.id === version.id)?.isCurrent
      )),
      label: version.label ?? formatResultVersion(version.id),
    }))
    .sort((left, right) => {
      const leftNumber = Number(left.id);
      const rightNumber = Number(right.id);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return rightNumber - leftNumber;
      return right.id.localeCompare(left.id, undefined, { numeric: true });
    });
}

function EmptyFolder({ id, label }: { id: string; label: string }) {
  return <p className="bv-resource-folder__empty" id={id} role="status">{label}</p>;
}

function buildEnterpriseFolders(
  categories: readonly ProjectEnterpriseCategory[],
  files: readonly ProjectEnterpriseFile[],
) {
  return buildEnterpriseWorkspaceFolders(categories.map(category => ({ ...category, parentId: category.parentId ?? null })), files)
    .map(folder => ({ id: folder.id, label: folder.label, files: folder.items }));
}

function toggleSetValue<T>(current: Set<T>, value: T) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function tenderKindLabel(kind: ProjectTenderMaterialKind) {
  if (kind === 'notice') return '招标公告';
  if (kind === 'supplement') return '补充材料';
  return '招标文件';
}
