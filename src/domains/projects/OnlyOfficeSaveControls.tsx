import { Download, LoaderCircle, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type OfficeSaveStatus = {
  baseVersion?: number;
  draftRevision?: number;
  decisionRevision?: number;
  needsDecision?: boolean;
  pendingSave?: { requestId: string; strategy: string } | null;
  savedVersion?: number | null;
  savedRevision?: number | string | null;
  savedAt?: string;
  lastSaveRequestId?: string | null;
  saveError?: { code: string; message: string; requestId?: string } | null;
  status?: string;
};

export type OfficeFileVersion = {
  version: number;
  name?: string;
  size?: number;
  savedAt?: string;
  url?: string;
  isCurrent?: boolean;
};

export function officeVersionLabel(version: number) {
  return version === 0 ? '原始版本' : `修订 V${version}`;
}

/** Autosave is a recoverable draft; publishing always needs an explicit choice. */
export function OnlyOfficeSaveControls({
  bridgeUrl, sessionId, fileId, displayName, disabled, onSaved, onDraftAvailable,
}: {
  bridgeUrl: string;
  sessionId: string | null;
  fileId: string;
  displayName: string;
  disabled?: boolean;
  onSaved: (version: number) => void;
  onDraftAvailable: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<OfficeSaveStatus>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const seenDecisionRef = useRef(0);
  const lastSavedRef = useRef<string | null>(null);
  const callbacks = useRef({ onSaved, onDraftAvailable });
  callbacks.current = { onSaved, onDraftAvailable };
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const generationRef = useRef(0);
  const pendingRequestRef = useRef<string | null>(null);
  const statusRef = useRef<OfficeSaveStatus>({});
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const transientErrorRef = useRef(false);
  const seenErrorRef = useRef<string | null>(null);
  const applyStatusRef = useRef<(next: OfficeSaveStatus, sequence: number) => void>(() => undefined);

  applyStatusRef.current = (next, sequence) => {
    // A late GET/POST receipt must not restore an older pending/error snapshot.
    if (sequence < appliedSequenceRef.current) return;
    appliedSequenceRef.current = sequence;
    statusRef.current = next;
    setStatus(next);
    const requestId = pendingRequestRef.current;
    const relevantError = next.saveError && !next.pendingSave
      && (!requestId || next.saveError.requestId === requestId);
    const acknowledgedSave = Boolean(requestId && next.lastSaveRequestId === requestId
      && typeof next.savedVersion === 'number' && !next.pendingSave && !next.saveError);
    const hasNewDraft = next.needsDecision || next.status === 'draft';
    const cleanSavedState = typeof next.savedVersion === 'number' && !next.pendingSave
      && !next.saveError && !hasNewDraft && (!requestId || acknowledgedSave);
    if (transientErrorRef.current && (relevantError || acknowledgedSave || !requestId
      || next.pendingSave?.requestId === requestId)) {
      transientErrorRef.current = false;
      setError('');
    }
    if (relevantError && next.saveError) {
      pendingRequestRef.current = null;
      setSubmitting(false);
      setError(next.saveError.message);
      const errorKey = `${next.saveError.code}:${next.saveError.message}:${next.saveError.requestId ?? ''}`;
      if (seenErrorRef.current !== errorKey) { seenErrorRef.current = errorKey; setDialogOpen(true); }
    }
    if ((acknowledgedSave || cleanSavedState) && typeof next.savedVersion === 'number') {
      const marker = String(next.savedRevision ?? next.lastSaveRequestId ?? `${next.savedVersion}:${next.savedAt ?? ''}`);
      const newSuccess = marker !== lastSavedRef.current;
      if (newSuccess) {
        lastSavedRef.current = marker;
        callbacks.current.onSaved(next.savedVersion);
      }
      // Historical saved snapshots cannot see later edits still held inside Office.
      // They must not dismiss a newly opened manual save choice or its current error.
      if (acknowledgedSave || newSuccess) {
        pendingRequestRef.current = null;
        setSubmitting(false);
        if (!hasNewDraft) setDialogOpen(false);
        setError('');
      }
    }
    if (hasNewDraft) {
      // A historic savedVersion must never overwrite the newer draft's dirty state.
      callbacks.current.onDraftAvailable();
      const decision = next.decisionRevision ?? next.draftRevision ?? 0;
      if (next.needsDecision && decision > seenDecisionRef.current
        && !pendingRequestRef.current && !next.pendingSave) {
        seenDecisionRef.current = decision;
        setDialogOpen(true);
      }
    }
  };

  useEffect(() => {
    generationRef.current += 1;
    const controller = new AbortController();
    let polling = false;
    seenDecisionRef.current = 0;
    lastSavedRef.current = null;
    pendingRequestRef.current = null;
    seenErrorRef.current = null;
    transientErrorRef.current = false;
    statusRef.current = {};
    requestSequenceRef.current = 0;
    appliedSequenceRef.current = 0;
    setStatus({});
    setDialogOpen(false);
    setSubmitting(false);
    setError('');
    if (!sessionId) return () => controller.abort();
    const poll = async () => {
      if (polling || controller.signal.aborted) return;
      polling = true;
      const sequence = ++requestSequenceRef.current;
      try {
        const response = await fetch(`${bridgeUrl}/api/editor-sessions/${encodeURIComponent(sessionId)}`, {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('无法确认保存状态，请保留当前页面并稍后重试。');
        const next = await response.json() as OfficeSaveStatus;
        if (!controller.signal.aborted) applyStatusRef.current(next, sequence);
      } catch (caughtError) {
        if (!controller.signal.aborted && sequence >= appliedSequenceRef.current
          && (pendingRequestRef.current || statusRef.current.pendingSave)) {
          transientErrorRef.current = true;
          setError(caughtError instanceof Error ? caughtError.message : '保存结果待确认，请勿关闭页面。');
        }
      } finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_500);
    return () => { generationRef.current += 1; controller.abort(); window.clearInterval(timer); };
  }, [bridgeUrl, sessionId]);

  useEffect(() => {
    if (dialogOpen) primaryButtonRef.current?.focus();
  }, [dialogOpen]);

  const chooseSave = async (strategy: 'new-version' | 'overwrite') => {
    if (!sessionId || disabled || submitting || pendingRequestRef.current || statusRef.current.pendingSave) return;
    const generation = generationRef.current;
    const sequence = ++requestSequenceRef.current;
    appliedSequenceRef.current = sequence;
    const requestId = crypto.randomUUID();
    pendingRequestRef.current = requestId;
    setSubmitting(true);
    setError('');
    transientErrorRef.current = false;
    try {
      const response = await fetch(`${bridgeUrl}/api/editor-sessions/${encodeURIComponent(sessionId)}/save`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strategy, requestId }),
      });
      const payload = await response.json() as OfficeSaveStatus & { error?: string };
      if (generation !== generationRef.current) return;
      if (!response.ok) {
        // A definitive rejection belongs to the write, not to the GET snapshot
        // order; only the still-current request may be released by a late receipt.
        if (pendingRequestRef.current !== requestId) return;
        // A server/gateway timeout can happen after beginSave accepted the write.
        // Only explicit client rejection releases the lock; unknown results are polled.
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          pendingRequestRef.current = null;
          setSubmitting(false);
          setError(payload.saveError?.message || payload.error || '未能保存，请重试；当前草稿仍保留。');
        } else {
          transientErrorRef.current = true;
          setError('保存结果待确认，正在核对；请勿关闭页面或重复保存。');
        }
        return;
      }
      if (sequence < appliedSequenceRef.current) return;
      applyStatusRef.current(payload, sequence);
    } catch {
      if (generation !== generationRef.current || pendingRequestRef.current !== requestId) return;
      // Do not issue a new write after an ambiguous lost HTTP receipt.
      transientErrorRef.current = true;
      setError('保存结果待确认，正在核对；请勿关闭页面或重复保存。');
    }
  };

  const dismiss = () => {
    if (submitting || pendingRequestRef.current || statusRef.current.pendingSave) return;
    setDialogOpen(false);
    saveButtonRef.current?.focus();
  };
  const busy = submitting || Boolean(status.pendingSave);

  return <>
    <button
      ref={saveButtonRef} className="onlyoffice-workspace__save" type="button"
      aria-label="保存文档" title="另存为新版本或覆盖当前版本"
      disabled={disabled || !sessionId || busy}
      onClick={() => { setError(''); setDialogOpen(true); }}
    >{busy ? <LoaderCircle aria-hidden="true" size={15} /> : <Save aria-hidden="true" size={15} />}</button>
    {typeof status.savedVersion === 'number' ? <a
      className="onlyoffice-workspace__save" aria-label="下载已保存文档" title="下载已保存文档"
      href={`${bridgeUrl}/files/${encodeURIComponent(fileId)}/versions/${status.savedVersion}`} download={displayName}
    ><Download aria-hidden="true" size={15} /></a> : null}
    {dialogOpen ? createPortal(<div className="onlyoffice-save-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="onlyoffice-save-title" className="onlyoffice-save-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
          if (event.key === 'Tab') {
            const elements = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const first = elements[0]; const last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <header><h2 id="onlyoffice-save-title">保存文档</h2><button aria-label="取消保存" disabled={busy} onClick={dismiss} type="button"><X size={18} /></button></header>
        <p className="onlyoffice-save-dialog__filename">{displayName}</p>
        <p>选择保存方式。另存会保留原版本。</p>
        <p className="onlyoffice-save-dialog__note">当前保存到本机。</p>
        {error ? <p role="alert" className="onlyoffice-save-dialog__error">{error}</p> : null}
        {busy ? <p role="status">正在从 Office 获取最新内容并保存，请稍候…</p> : null}
        <footer>
          <button disabled={busy} onClick={dismiss} type="button">继续编辑</button>
          <button disabled={disabled || busy} onClick={() => void chooseSave('overwrite')} type="button">覆盖当前版本</button>
          <button ref={primaryButtonRef} className="is-primary" disabled={disabled || busy} onClick={() => void chooseSave('new-version')} type="button">另存为新版本</button>
        </footer>
      </section>
    </div>, document.body) : null}
  </>;
}
