import {
  ArrowUp,
  CornerDownRight,
  FileText,
  ListTodo,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import './AgentWorkspaceComposer.css';

export type AgentWorkspaceMessageMode = 'queue' | 'steer';

export type AgentWorkspaceQueuedMessage = {
  /** Backend message id. It is optional while the queue only exists in the browser. */
  id?: number | string | null;
  /** Stable client id for optimistic/local-only queued messages. */
  localId?: string;
  content: string;
  createdAt?: string | null;
  error?: string | null;
  pending?: boolean;
  summary?: string;
};

export type AgentWorkspaceContextReference = {
  detail?: string;
  id?: number | string | null;
  label: string;
  localId?: string;
};

export type AgentWorkspaceAttachment = {
  detail?: string;
  id?: number | string | null;
  localId?: string;
  name: string;
};

type AsyncCallbackResult = unknown | Promise<unknown>;

export type AgentWorkspaceComposerProps = {
  accept?: string;
  attachments?: readonly AgentWorkspaceAttachment[];
  contextReferences?: readonly AgentWorkspaceContextReference[];
  defaultValue?: string;
  disabled?: boolean;
  error?: string | null;
  focusRequest?: number;
  onAddFiles?: (files: File[]) => AsyncCallbackResult;
  onDeleteQueued?: (message: AgentWorkspaceQueuedMessage) => AsyncCallbackResult;
  onRemoveAttachment?: (attachment: AgentWorkspaceAttachment) => void;
  onRemoveContextReference?: (reference: AgentWorkspaceContextReference) => void;
  onSend?: (message: string, mode: AgentWorkspaceMessageMode) => AsyncCallbackResult;
  onSteerQueued?: (message: AgentWorkspaceQueuedMessage) => AsyncCallbackResult;
  onValueChange?: (value: string) => void;
  pending?: boolean;
  placeholder?: string;
  queuedMessages?: readonly AgentWorkspaceQueuedMessage[];
  value?: string;
};

type QueueAction = {
  key: string;
  type: 'delete' | 'steer';
} | null;

function queueMessageKey(message: AgentWorkspaceQueuedMessage, index: number) {
  if (message.id !== undefined && message.id !== null) return `backend:${message.id}`;
  if (message.localId) return `local:${message.localId}`;
  return `fallback:${index}:${message.content}`;
}

function contextReferenceKey(reference: AgentWorkspaceContextReference, index: number) {
  if (reference.id !== undefined && reference.id !== null) return `backend:${reference.id}`;
  if (reference.localId) return `local:${reference.localId}`;
  return `fallback:${index}:${reference.label}:${reference.detail ?? ''}`;
}

function attachmentKey(attachment: AgentWorkspaceAttachment, index: number) {
  if (attachment.id !== undefined && attachment.id !== null) return `backend:${attachment.id}`;
  if (attachment.localId) return `local:${attachment.localId}`;
  return `fallback:${index}:${attachment.name}:${attachment.detail ?? ''}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AgentWorkspaceComposer({
  accept,
  attachments = [],
  contextReferences = [],
  defaultValue = '',
  disabled = false,
  error = null,
  focusRequest,
  onAddFiles,
  onDeleteQueued,
  onRemoveAttachment,
  onRemoveContextReference,
  onSend,
  onSteerQueued,
  onValueChange,
  pending = false,
  placeholder = '补充要求或询问当前进度，可上传图片/文件…',
  queuedMessages = [],
  value,
}: AgentWorkspaceComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const submittingRef = useRef(false);
  const [localValue, setLocalValue] = useState(defaultValue);
  const [attachmentState, setAttachmentState] = useState<{ error: string | null; pending: boolean }>({
    error: null,
    pending: false,
  });
  const [sendState, setSendState] = useState<{ error: string | null; pending: boolean }>({
    error: null,
    pending: false,
  });
  const [queueAction, setQueueAction] = useState<QueueAction>(null);
  const [queueActionErrors, setQueueActionErrors] = useState<Record<string, string>>({});
  const currentValue = value ?? localValue;
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;

  // `pending` reflects a parent/backend request still waiting for a reply.
  // Queue-mode composing must remain available while it finishes, otherwise one
  // slow request can freeze every later message. Only this composer's own
  // submission lock disables the send action.
  const isSending = sendState.pending;
  const isBusy = pending || isSending || attachmentState.pending || queueAction !== null;
  const displayedError = error || sendState.error || attachmentState.error;
  const hasMessagePayload = Boolean(currentValue.trim() || attachments.length > 0);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.height = '0px';
      textarea.style.height = `${Math.min(160, Math.max(30, textarea.scrollHeight))}px`;
    };
    resize();
    if (typeof ResizeObserver === 'undefined' || !textarea.parentElement) return;
    let previousWidth = textarea.parentElement.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === previousWidth) return;
      previousWidth = entry.contentRect.width;
      resize();
    });
    observer.observe(textarea.parentElement);
    return () => observer.disconnect();
  }, [currentValue]);

  useEffect(() => {
    if (!focusRequest) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [focusRequest]);

  const updateValue = (nextValue: string) => {
    if (value === undefined) setLocalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!onAddFiles || files.length === 0 || attachmentState.pending) return;

    setAttachmentState({ error: null, pending: true });
    try {
      await onAddFiles(files);
      setAttachmentState({ error: null, pending: false });
    } catch (caughtError) {
      setAttachmentState({
        error: errorMessage(caughtError, '文件添加失败，请重试。'),
        pending: false,
      });
    }
  };

  const sendMessage = async () => {
    const message = currentValue.trim();
    if (!onSend || !hasMessagePayload || disabled || submittingRef.current) return;

    submittingRef.current = true;
    setSendState({ error: null, pending: true });
    try {
      // The queue owner decides whether this starts now or waits locally. This
      // does not assert that the backend has received or processed the message.
      await onSend(message, 'queue');
      if (currentValueRef.current.trim() === message) updateValue('');
      setSendState({ error: null, pending: false });
    } catch (caughtError) {
      setSendState({
        error: errorMessage(caughtError, '消息发送失败，请重试。'),
        pending: false,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendMessage();
  };

  const runQueueAction = async (
    message: AgentWorkspaceQueuedMessage,
    key: string,
    type: 'delete' | 'steer',
  ) => {
    const callback = type === 'steer' ? onSteerQueued : onDeleteQueued;
    if (!callback || queueAction || message.pending) return;

    setQueueActionErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setQueueAction({ key, type });
    try {
      // Pass the complete local object. A backend id is deliberately not
      // required so callers can support optimistic queues before that API exists.
      await callback(message);
      setQueueAction(null);
    } catch (caughtError) {
      setQueueActionErrors((current) => ({
        ...current,
        [key]: errorMessage(
          caughtError,
          type === 'steer' ? '调整方向失败，请重试。' : '删除排队消息失败，请重试。',
        ),
      }));
      setQueueAction(null);
    }
  };

  return (
    <section
      aria-busy={isBusy}
      aria-label="BidVolt 输入"
      className="agent-workspace-composer"
    >
      {queuedMessages.length > 0 ? (
        <div className="agent-workspace-composer__queue" role="region" aria-label="排队消息">
          <ol>
            {queuedMessages.map((message, index) => {
              const key = queueMessageKey(message, index);
              const action = queueAction?.key === key ? queueAction.type : null;
              const itemError = message.error || queueActionErrors[key];
              return (
                <li key={key}>
                  <ListTodo aria-hidden="true" className="agent-workspace-composer__queue-icon" size={15} />
                  <div className="agent-workspace-composer__queued-content">
                    <p title={message.content}>{message.summary || message.content}</p>
                    {message.pending ? <span role="status">正在提交…</span> : null}
                  </div>
                  <div className="agent-workspace-composer__queued-actions">
                    <button
                      aria-label={`调整方向：${message.summary || message.content}`}
                      disabled={disabled || message.pending || Boolean(queueAction) || !onSteerQueued}
                      onClick={() => void runQueueAction(message, key, 'steer')}
                      title={onSteerQueued ? '立即发送这条本页待发消息' : '当前无法调整方向'}
                      type="button"
                    >
                      <CornerDownRight aria-hidden="true" size={15} />
                      {action === 'steer' ? '调整中…' : '调整方向'}
                    </button>
                    <button
                      aria-label={`删除排队消息：${message.summary || message.content}`}
                      className="agent-workspace-composer__delete"
                      disabled={disabled || message.pending || Boolean(queueAction) || !onDeleteQueued}
                      onClick={() => void runQueueAction(message, key, 'delete')}
                      title={onDeleteQueued ? '删除尚未发送的本页消息' : '当前无法删除待发消息'}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                      <span className="agent-workspace-composer__visually-hidden">删除</span>
                    </button>
                  </div>
                  {itemError ? <p className="agent-workspace-composer__queue-error" role="alert">{itemError}</p> : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <form className="agent-workspace-composer__form" onSubmit={submit}>
        {attachments.length > 0 ? (
          <div className="agent-workspace-composer__attachments" aria-label="已添加附件">
            {attachments.map((attachment, index) => (
              <span
                className="agent-workspace-composer__attached-file"
                key={attachmentKey(attachment, index)}
                title={[attachment.name, attachment.detail].filter(Boolean).join(' · ')}
              >
                <Paperclip aria-hidden="true" size={14} />
                <span>
                  <strong>{attachment.name}</strong>
                  {attachment.detail ? <small>{attachment.detail}</small> : null}
                </span>
                {onRemoveAttachment ? (
                  <button
                    aria-label={`移除附件：${attachment.name}`}
                    disabled={disabled || isSending}
                    onClick={() => onRemoveAttachment(attachment)}
                    type="button"
                  >
                    <X aria-hidden="true" size={13} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        {contextReferences.length > 0 ? (
          <div className="agent-workspace-composer__contexts" aria-label="当前引用上下文">
            {contextReferences.map((reference, index) => (
              <span
                className="agent-workspace-composer__context"
                key={contextReferenceKey(reference, index)}
                title={[reference.label, reference.detail].filter(Boolean).join(' · ')}
              >
                <FileText aria-hidden="true" size={14} />
                <span>
                  <strong>{reference.label}</strong>
                  {reference.detail ? <small>{reference.detail}</small> : null}
                </span>
                {onRemoveContextReference ? (
                  <button
                    aria-label={`移除引用：${reference.label}`}
                    disabled={disabled || isSending}
                    onClick={() => onRemoveContextReference(reference)}
                    type="button"
                  >
                    <X aria-hidden="true" size={13} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="agent-workspace-composer__input-row">
          <button
            aria-label={attachmentState.pending ? '添加中…' : '添加文件'}
            className="agent-workspace-composer__attachment"
            disabled={disabled || attachmentState.pending || !onAddFiles}
            onClick={() => fileInputRef.current?.click()}
            title={onAddFiles ? '添加发送给 BidVolt 的文件' : '附件接口尚未接入'}
            type="button"
          >
            {attachmentState.pending
              ? <LoaderCircle aria-hidden="true" className="agent-workspace-composer__spinner" size={20} />
              : <Plus aria-hidden="true" size={22} />}
          </button>
          {onAddFiles ? (
            <input
              accept={accept}
              aria-label="选择发送给 BidVolt 的文件"
              className="agent-workspace-composer__file-input"
              disabled={disabled || attachmentState.pending}
              multiple
              onChange={(event) => void addFiles(event)}
              ref={fileInputRef}
              type="file"
            />
          ) : null}
          <label className="agent-workspace-composer__textarea-wrap">
            <span className="agent-workspace-composer__visually-hidden">向 BidVolt 发送消息</span>
            <textarea
              aria-describedby={displayedError ? errorId : undefined}
              aria-label="向 BidVolt 发送消息"
              disabled={disabled}
              onChange={(event) => updateValue(event.currentTarget.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={placeholder}
              ref={textareaRef}
              rows={1}
              value={currentValue}
            />
          </label>
          <button
            aria-label={isSending ? '正在发送消息' : '发送消息'}
            className="agent-workspace-composer__send"
            disabled={disabled || isSending || !onSend || !hasMessagePayload}
            title={onSend ? (pending ? '加入本页待发队列' : '发送给 BidVolt') : '当前会话暂不可用'}
            type="submit"
          >
            {isSending
              ? <LoaderCircle aria-hidden="true" className="agent-workspace-composer__spinner" size={18} />
              : <ArrowUp aria-hidden="true" size={20} />}
          </button>
        </div>
        {displayedError ? (
          <p className="agent-workspace-composer__error" id={errorId} role="alert">
            {displayedError}
          </p>
        ) : null}
        {isSending ? (
          <p className="agent-workspace-composer__status" role="status">正在提交消息…</p>
        ) : pending ? (
          <p className="agent-workspace-composer__status" role="status">正在等待 BidVolt 回复，可继续添加消息。</p>
        ) : null}
      </form>
    </section>
  );
}
