export function canUseLocalPreview({
  dev,
  hostname,
  mode,
}: {
  dev: boolean;
  hostname: string;
  mode: string;
}) {
  const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return dev
    && mode === 'local-preview'
    && ['localhost', '127.0.0.1', '::1'].includes(normalizedHost);
}

export function isLocalPreviewAvailable() {
  return canUseLocalPreview({
    dev: import.meta.env.DEV,
    hostname: window.location.hostname,
    mode: import.meta.env.MODE,
  });
}

export function localPreviewWriteError(action: string) {
  return new Error(`本地只读预览已阻止“${action}”：没有连接真实后端，也不会伪造成功结果。`);
}
