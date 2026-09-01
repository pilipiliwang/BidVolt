import { describe, expect, it, vi } from 'vitest';

import {
  AgentRunStreamProtocolError,
  consumeAgentRunStream,
  parseAgentRunStreamEvent,
} from './agent-stream';

const sseResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
};

describe('agent main-session SSE parser', () => {
  it('parses message/end events separately from the legacy task stream', async () => {
    const onMessage = vi.fn();
    const response = sseResponse([
      'event: message\ndata: {"seq":8,"kind":"service",',
      '"content":"正在校验材料","internal":"discard"}\n\n',
      'event: end\ndata: {"status":3,"session_id":"session-1","outcome":"complete",',
      '"reason":null,"action_list":["上传盖章版"],"error":null,"secret":"discard"}\n\n',
    ]);

    await expect(consumeAgentRunStream(response, { onMessage })).resolves.toEqual({
      type: 'end',
      status: 3,
      sessionId: 'session-1',
      outcome: 'complete',
      reason: null,
      actionList: ['上传盖章版'],
      error: null,
    });
    expect(onMessage).toHaveBeenCalledWith({
      type: 'message', seq: 8, kind: 'service', content: '正在校验材料',
    });
    expect(JSON.stringify(onMessage.mock.calls)).not.toContain('internal');
  });

  it('rejects legacy events, malformed values, and early EOF', async () => {
    expect(() => parseAgentRunStreamEvent('progress', '{}'))
      .toThrow(AgentRunStreamProtocolError);
    expect(() => parseAgentRunStreamEvent(
      'message', '{"seq":"8","kind":"service","content":"x"}',
    )).toThrow(/seq/);
    await expect(consumeAgentRunStream(sseResponse([
      'event: message\ndata: {"seq":1,"kind":"service","content":"x"}\n\n',
    ]), { onMessage: vi.fn() })).rejects.toThrow(/end/);
  });
});
