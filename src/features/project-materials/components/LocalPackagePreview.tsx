import { ArrowLeft, Download, FileSpreadsheet, FileText, FolderOpen, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import './local-package-preview.css';

const categories = [
  { id: 'business', title: '商务文件' },
  { id: 'technical', title: '技术文件' },
  { id: 'price', title: '价格文件' },
  { id: 'internal', title: '内部管理文件' },
] as const;

export type LocalPackageFile = {
  id: string;
  name: string;
  category: 'business' | 'internal' | 'technical' | 'price';
  size: number;
  extension: '.docx' | '.xlsx';
};
export type LocalPackageManifest = {
  projectId: string;
  taskId: string;
  source: string;
  files: LocalPackageFile[];
};

export function parseLocalPackage(value: unknown, projectId: string, taskId?: string): LocalPackageManifest | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as LocalPackageManifest;
  if (data.projectId !== projectId || data.taskId !== taskId || !Array.isArray(data.files)
    || !data.files.length || typeof data.source !== 'string') return null;
  if (!data.files.every(file => file && /^file-\d+$/.test(file.id)
    && typeof file.name === 'string' && typeof file.size === 'number' && file.size >= 0
    && categories.some(category => category.id === file.category)
    && ['.docx', '.xlsx'].includes(file.extension))) return null;
  if (new Set(data.files.map(file => file.id)).size !== data.files.length) return null;
  return data;
}

export function useLocalPackage(projectId: string, taskId?: string, enabled = true) {
  const [manifest, setManifest] = useState<LocalPackageManifest | null>(null);
  useEffect(() => {
    setManifest(null);
    if (!enabled || !import.meta.env.DEV || projectId !== '207' || taskId !== '3499'
      || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
    const controller = new AbortController();
    void fetch(`/__local-package/${projectId}/manifest.json`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setManifest(parseLocalPackage(value, projectId, taskId)); })
      .catch(() => { /* Optional local preview must never block the normal backend workflow. */ });
    return () => controller.abort();
  }, [projectId, taskId, enabled]);
  return enabled && manifest?.projectId === projectId && manifest.taskId === taskId ? manifest : null;
}

export async function loadLocalPackageModel(
  projectId: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (projectId !== '207' || !/^file-\d+$/.test(fileId)) {
    throw new Error('本地成果文件标识无效。');
  }
  const response = await fetch(
    `/__local-package/${encodeURIComponent(projectId)}/${fileId}/model`,
    { cache: 'no-store', signal },
  );
  if (!response.ok) throw new Error('本地成果结构化内容暂不可用。');
  return response.json();
}

const fileSize = (size: number) => size >= 1024 * 1024
  ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${(size / 1024).toFixed(1)} KB`;

export function LocalPackagePreview({ manifest, onBackToStatus, onOpenTasks }: {
  manifest: LocalPackageManifest;
  onBackToStatus?: () => void;
  onOpenTasks?: () => void;
}) {
  const [selectedId, setSelectedId] = useState(manifest.files[0].id);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const selected = manifest.files.find(file => file.id === selectedId) ?? manifest.files[0];
  const base = `/__local-package/${manifest.projectId}/${selected.id}`;
  return (
    <section className="local-package-preview" aria-label="本地成果文件包预览">
      <header className="local-package-preview__heading">
        <div><h1>标书成果预览 <span>本地文件包</span></h1>
          <p>项目 {manifest.projectId} · 任务 {manifest.taskId} · {manifest.files.length} 份文件，仅供预览与下载；正式成果版本仍待同步。</p>
        </div>
        <div className="local-package-preview__actions">
          {onBackToStatus ? <button type="button" onClick={onBackToStatus}><ArrowLeft size={16} aria-hidden="true" />返回状态页</button> : null}
          {onOpenTasks ? <button type="button" onClick={onOpenTasks}>查看任务状态</button> : null}
        </div>
      </header>
      <div className="local-package-preview__layout">
        <nav className="local-package-preview__catalog" aria-label="成果文件分类">
          {categories.map(category => {
            const files = manifest.files.filter(file => file.category === category.id);
            return <section key={category.id}>
              <h2><FolderOpen size={17} aria-hidden="true" />{category.title}<span>{files.length}</span></h2>
              {files.map(file => <button type="button" key={file.id} aria-current={selected.id === file.id ? 'true' : undefined}
                onClick={() => { if (file.id !== selected.id) { setSelectedId(file.id); setLoading(true); setPreviewError(false); } }}>
                {file.extension === '.xlsx' ? <FileSpreadsheet size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}
                <span>{file.name}<small>{file.extension.slice(1).toUpperCase()} · {fileSize(file.size)}</small></span>
              </button>)}
            </section>;
          })}
        </nav>
        <div className="local-package-preview__document">
          <header><strong title={selected.name}>{selected.name}</strong>
            <a href={`${base}/download`} download={selected.name}><Download size={16} aria-hidden="true" />下载原件</a>
          </header>
          <p className="local-package-preview__notice">只读内容预览，分页和完整格式以原文件为准。暂不支持在线编辑、模拟评分。</p>
          <div className="local-package-preview__canvas">
            {loading ? <p className="local-package-preview__loading" role="status"><LoaderCircle size={18} />正在载入文件…</p> : null}
            {previewError ? <p role="alert">预览暂时不可用，请下载原件查看。</p> : null}
            <iframe key={base} title={`文件预览：${selected.name}`} src={`${base}/preview`} sandbox=""
              onLoad={() => setLoading(false)} onError={() => { setLoading(false); setPreviewError(true); }} />
          </div>
        </div>
      </div>
    </section>
  );
}
