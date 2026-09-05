import { describe, expect, it } from 'vitest';
import { outcomeImageDimension, safeOutcomeImageSource } from './outcome-image-source';

describe('safe document images', () => {
  it('accepts raster image data and explicit HTTP or same-site resource URLs', () => {
    for (const value of ['https://example.test/image.png', 'http://127.0.0.1:8081/images/1', '/images/a.png', 'data:image/png;base64,aGVsbG8=']) {
      expect(safeOutcomeImageSource(value)).toBe(value);
    }
  });
  it('does not execute active markup or guess unresolved package resource locations', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html;base64,aGVsbG8=', 'data:image/svg+xml;base64,aGVsbG8=',
      'file:///C:/photo.jpg', '//other.test/a.png', '/\\other.test/a.png', 'word/media/image1.png',
      'https://user:password@example.test/a.png', 'https://example.test/\nimage.png']) {
      expect(safeOutcomeImageSource(value)).toBeUndefined();
    }
  });
  it('ignores invalid image dimensions', () => {
    expect(outcomeImageDimension('640')).toBe(640);
    for (const value of [null, undefined, '', -1, Infinity, '300px', 20_000]) expect(outcomeImageDimension(value)).toBeUndefined();
  });
});
