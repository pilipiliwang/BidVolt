import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Pencil, X } from 'lucide-react';

export type ProjectDetailsUpdate = {
  title?: string;
  packageNo?: string;
  deadline?: string;
};

type IdentityField = keyof ProjectDetailsUpdate;

const fieldLabels: Record<IdentityField, string> = {
  title: '项目名称',
  packageNo: '包号',
  deadline: '截止时间',
};

function deadlineInputValue(value?: string) {
  if (!value?.trim()) return '';
  // Server ISO timestamps may include a time zone; the editor uses local time.
  const date = new Date(value.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function deadlineLabel(value?: string) {
  const formatted = deadlineInputValue(value);
  return formatted ? formatted.replace('T', ' ') : '待解析';
}

/** Displays only persisted props; a failed save never changes the visible project data. */
export function ProjectIdentityEditor({
  projectTitle,
  projectPackageNo,
  projectDeadline,
  onUpdateProjectDetails,
}: {
  projectTitle?: string;
  projectPackageNo?: string;
  projectDeadline?: string;
  onUpdateProjectDetails?: (update: ProjectDetailsUpdate) => Promise<void>;
}) {
  const [editing, setEditing] = useState<IdentityField | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRefs = useRef<Partial<Record<IdentityField, HTMLButtonElement | null>>>({});
  const restoreFocusRef = useRef<IdentityField | null>(null);
  const savePendingRef = useRef(false);
  const editorId = useId();

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      if (editing !== 'deadline') inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing && !saving && restoreFocusRef.current) {
      triggerRefs.current[restoreFocusRef.current]?.focus();
      restoreFocusRef.current = null;
    }
  }, [editing, saving]);

  function openEditor(field: IdentityField) {
    if (!onUpdateProjectDetails || savePendingRef.current) return;
    setDraft(field === 'title'
      ? projectTitle ?? ''
      : field === 'packageNo'
        ? projectPackageNo ?? ''
        : deadlineInputValue(projectDeadline));
    setError('');
    setNotice('');
    setEditing(field);
  }

  function closeEditor() {
    if (savePendingRef.current) return;
    // The trigger is unmounted while its field is edited. Restore focus only
    // after React puts that button back in the header flow.
    restoreFocusRef.current = editing;
    setEditing(null);
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !onUpdateProjectDetails || savePendingRef.current) return;
    const value = draft.trim();
    if (!value) {
      setError(`请填写${fieldLabels[editing]}。`);
      inputRef.current?.focus();
      return;
    }
    if (editing === 'deadline' && !Number.isFinite(new Date(value).getTime())) {
      setError('请填写有效的截止时间。');
      return;
    }
    const field = editing;
    savePendingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onUpdateProjectDetails({ [field]: field === 'deadline' ? value.replace('T', ' ') : value });
      setNotice(`${fieldLabels[field]}已保存`);
      restoreFocusRef.current = field;
      setEditing(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败，请重试。');
    } finally {
      savePendingRef.current = false;
      setSaving(false);
    }
  }

  function fieldControl(field: IdentityField, value: string) {
    const editable = Boolean(onUpdateProjectDetails);
    if (editable && editing === field) {
      return (
        <form
          aria-label={`修改${fieldLabels[field]}`}
          className={`project-identity__inline-editor project-identity__inline-editor--${field}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeEditor();
            }
          }}
          onSubmit={(event) => void save(event)}
        >
          <label className="sr-only" htmlFor={editorId}>{fieldLabels[field]}</label>
          <input
            aria-describedby={error ? `${editorId}-error` : undefined}
            aria-invalid={Boolean(error)}
            disabled={saving}
            id={editorId}
            maxLength={field === 'title' ? 200 : 100}
            onChange={(event) => { setDraft(event.target.value); setError(''); }}
            ref={inputRef}
            required
            type={field === 'deadline' ? 'datetime-local' : 'text'}
            value={draft}
          />
          <button aria-label="保存修改" disabled={saving} type="submit" title={saving ? '正在保存' : '保存'}>
            {saving ? <LoaderCircle aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}
          </button>
          <button aria-label="取消修改" disabled={saving} onClick={closeEditor} title="取消" type="button"><X aria-hidden="true" size={15} /></button>
          {error ? <p id={`${editorId}-error`} role="alert">{error}</p> : null}
        </form>
      );
    }
    return editable ? (
      <button
        aria-label={`编辑${fieldLabels[field]}`}
        className={`project-identity__value project-identity__value--${field}`}
        disabled={saving}
        onClick={() => openEditor(field)}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            openEditor(field);
          }
        }}
        ref={(node) => { triggerRefs.current[field] = node; }}
        title={`编辑${fieldLabels[field]}`}
        type="button"
      >
        <span>{value}</span>
        <Pencil aria-hidden="true" size={12} />
      </button>
    ) : <span className={`project-identity__value project-identity__value--${field}`} title={value}>{value}</span>;
  }

  return (
    <div className="project-identity" aria-label="项目基础信息">
      <div className="project-identity__name">
        <span className="project-identity__label">项目</span>
        {fieldControl('title', projectTitle || '当前项目')}
      </div>
      <div className="project-identity__meta">
        <div className="project-identity__item"><span className="project-identity__label">包号</span>{fieldControl('packageNo', projectPackageNo || '待解析')}</div>
        <div className="project-identity__item"><span className="project-identity__label">截止</span>{fieldControl('deadline', deadlineLabel(projectDeadline))}</div>
      </div>
      <span aria-live="polite" className="sr-only" role={notice ? 'status' : undefined}>{notice}</span>
    </div>
  );
}
