import { describe, expect, it } from 'vitest';

import { canUseLocalPreview, localPreviewWriteError } from './local-preview';

describe('local preview safety gate', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])('allows development local-preview mode on %s', (hostname) => {
    expect(canUseLocalPreview({ dev: true, hostname, mode: 'local-preview' })).toBe(true);
  });

  it('cannot be enabled in a production build', () => {
    expect(canUseLocalPreview({ dev: false, hostname: 'localhost', mode: 'local-preview' })).toBe(false);
  });

  it('cannot be enabled on a remote host or in the normal development mode', () => {
    expect(canUseLocalPreview({ dev: true, hostname: 'preview.example.com', mode: 'local-preview' })).toBe(false);
    expect(canUseLocalPreview({ dev: true, hostname: 'localhost', mode: 'backend' })).toBe(false);
  });

  it('returns an explicit error instead of a fake successful write', () => {
    expect(localPreviewWriteError('创建项目').message).toContain('不会伪造成功结果');
  });
});
