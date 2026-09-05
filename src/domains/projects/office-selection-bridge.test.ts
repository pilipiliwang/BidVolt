import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficeSelectionBridge } from './office-selection-bridge';

const origin = 'http://localhost:8081';
const channel = 'unique-editor-channel';
const bridges: OfficeSelectionBridge[] = [];
function setup() {
  const bridge = new OfficeSelectionBridge({ origin, channel });
  bridges.push(bridge);
  const postMessage = vi.fn();
  const source = { postMessage } as unknown as Window;
  const emit = (data: Record<string, unknown>, overrides: MessageEventInit = {}) => window.dispatchEvent(
    new MessageEvent('message', { origin, source, data: { channel, ...data }, ...overrides }),
  );
  return { bridge, postMessage, source, emit };
}
afterEach(() => { bridges.splice(0).forEach((bridge) => bridge.dispose()); vi.useRealTimers(); });

describe('OfficeSelectionBridge', () => {
  it('waits for the plugin handshake and returns real selected text for the matching request', async () => {
    const { bridge, emit, postMessage } = setup();
    const response = bridge.requestSelection();
    expect(postMessage).not.toHaveBeenCalled();
    emit({ type: 'bidvolt-office-selection-ready' });
    const request = postMessage.mock.calls[0][0];
    expect(request).toMatchObject({ type: 'bidvolt-office-selection-request', channel });
    expect(postMessage.mock.calls[0][1]).toBe(origin);
    emit({ type: 'bidvolt-office-selection-result', requestId: request.requestId, text: '原文第一段\n第二段' });
    await expect(response).resolves.toBe('原文第一段\n第二段');
  });

  it('rejects messages from other origins, channels, frames and stale requests', async () => {
    const { bridge, emit, postMessage } = setup();
    emit({ type: 'bidvolt-office-selection-ready' }, { origin: 'http://example.com' });
    emit({ type: 'bidvolt-office-selection-ready', channel: 'another-document' });
    const response = bridge.requestSelection();
    expect(postMessage).not.toHaveBeenCalled();
    emit({ type: 'bidvolt-office-selection-ready' });
    const request = postMessage.mock.calls[0][0];
    const reply = { type: 'bidvolt-office-selection-result', requestId: request.requestId, text: 'selected' };
    const settled = vi.fn();
    void response.then(settled);
    emit(reply, { origin: 'http://example.com' });
    emit({ ...reply, channel: 'another-document' });
    emit(reply, { source: { postMessage: vi.fn() } as unknown as Window });
    emit({ ...reply, requestId: 'stale' });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    emit(reply);
    await expect(response).resolves.toBe('selected');
  });

  it('cancels pending requests on close and does not accept late results', async () => {
    const { bridge, emit, postMessage } = setup();
    emit({ type: 'bidvolt-office-selection-ready' });
    const response = bridge.requestSelection();
    const assertion = expect(response).rejects.toMatchObject({ name: 'AbortError' });
    bridge.dispose();
    emit({ type: 'bidvolt-office-selection-result', requestId: postMessage.mock.calls[0][0].requestId, text: 'late' });
    await assertion;
  });

  it('reports a timeout instead of silently quoting the whole file', async () => {
    vi.useFakeTimers();
    const { bridge } = setup();
    const response = bridge.requestSelection(50);
    const assertion = expect(response).rejects.toThrow('选区读取超时');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
