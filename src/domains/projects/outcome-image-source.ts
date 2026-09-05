/** Images are rendered as images only; document HTML is never inserted into the app DOM. */
export function safeOutcomeImageSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const source = value.trim();
  // Reject control characters intentionally; this is URL validation, not matching normal text.
  // eslint-disable-next-line no-control-regex
  if (!source || /[\u0000-\u001f\u007f]/.test(source)) return undefined;
  if (/^data:/i.test(source)) {
    return source.length <= 28 * 1024 * 1024
      && /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(source)
      ? source : undefined;
  }
  // Relative media paths in an extracted DOCX/HTML package have no dependable
  // base URL. Show an explicit placeholder instead of requesting a wrong app URL.
  if (source.startsWith('/') && !source.startsWith('//') && !source.includes('\\')) return source;
  try {
    const url = new URL(source);
    if (url.username || url.password) return undefined;
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    if (url.protocol === 'blob:' && typeof window !== 'undefined' && url.origin === window.location.origin) return url.href;
  } catch { /* Unsupported or unresolved resource. */ }
  return undefined;
}

export function outcomeImageDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 && dimension <= 16_384 ? Math.round(dimension) : undefined;
}
