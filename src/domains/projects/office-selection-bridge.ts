export type OfficeSelectionBridgeConfig = { channel: string; origin: string };

type PendingSelection = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** A per-editor, nonce-bound channel to our read-only ONLYOFFICE plugin iframe. */
export class OfficeSelectionBridge {
  private source: Window | null = null;
  private pending = new Map<string, PendingSelection>();
  private disposed = false;

  constructor(private readonly config: OfficeSelectionBridgeConfig) {
    window.addEventListener('message', this.receive);
  }

  private post(requestId: string) {
    this.source?.postMessage({
      type: 'bidvolt-office-selection-request',
      channel: this.config.channel,
      requestId,
    }, this.config.origin);
  }

  private receive = (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | null;
    if (this.disposed || event.origin !== this.config.origin || !event.source
      || !data || typeof data !== 'object' || data.channel !== this.config.channel) return;
    if (data.type === 'bidvolt-office-selection-ready') {
      if (this.source) return;
      this.source = event.source as Window;
      for (const requestId of this.pending.keys()) this.post(requestId);
      return;
    }
    if (data.type !== 'bidvolt-office-selection-result' || event.source !== this.source
      || typeof data.requestId !== 'string') return;
    const request = this.pending.get(data.requestId);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(data.requestId);
    if (data.error || typeof data.text !== 'string') {
      request.reject(new Error('Office 未能读取当前选区，请重新选择文字后重试。'));
    } else {
      request.resolve(data.text);
    }
  };

  requestSelection(timeoutMs = 5_000): Promise<string> {
    if (this.disposed) return Promise.reject(new DOMException('引用已取消', 'AbortError'));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('选区读取超时，请重新打开文档后重试。'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      if (this.source) this.post(requestId);
    });
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('message', this.receive);
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new DOMException('引用已取消', 'AbortError'));
    }
    this.pending.clear();
    this.source = null;
  }
}
