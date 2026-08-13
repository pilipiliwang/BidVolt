import { describe, expect, it, vi } from 'vitest';

import { createEditorSaveGate } from './editor-save-gate';

describe('createEditorSaveGate', () => {
  it('coalesces concurrent saves into one request', async () => {
    let resolve: ((value: number) => void) | undefined;
    const operation = vi.fn(() => new Promise<number>((done) => { resolve = done; }));
    const gate = createEditorSaveGate(() => 'attempt-1');

    const first = gate.run('same-content', operation);
    const second = gate.run('same-content', operation);

    expect(operation).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith('attempt-1');
    resolve?.(2);
    await expect(Promise.all([first, second])).resolves.toEqual([2, 2]);
  });

  it('reuses an idempotency key when the same failed save is retried', async () => {
    const keys = ['attempt-1', 'attempt-2'];
    const createKey = vi.fn(() => keys.shift() ?? 'unexpected');
    const gate = createEditorSaveGate(createKey);
    const failure = vi.fn().mockRejectedValueOnce(new Error('network failed'));

    await expect(gate.run('same-content', failure)).rejects.toThrow('network failed');
    const retry = vi.fn().mockResolvedValue(3);
    await expect(gate.run('same-content', retry)).resolves.toBe(3);

    expect(failure).toHaveBeenCalledWith('attempt-1');
    expect(retry).toHaveBeenCalledWith('attempt-1');
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it('creates a new key after success or when content changes', async () => {
    let sequence = 0;
    const gate = createEditorSaveGate(() => `attempt-${++sequence}`);
    const operation = vi.fn().mockResolvedValue(undefined);

    await gate.run('first-content', operation);
    await gate.run('second-content', operation);

    expect(operation).toHaveBeenNthCalledWith(1, 'attempt-1');
    expect(operation).toHaveBeenNthCalledWith(2, 'attempt-2');
  });
});
