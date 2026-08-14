import { describe, expect, it } from 'vitest';

import apiStatusCss from './BackendApiStatusBar.css?raw';
import globalCss from '../styles/global.css?raw';

function customPropertyValue(css: string, property: string) {
  const match = css.match(new RegExp(`${property}:\\s*(\\d+);`));
  if (!match) throw new Error(`Missing CSS custom property ${property}`);
  return Number(match[1]);
}

describe('task drawer stacking', () => {
  it('places the drawer layer above locally scoped sticky API rows', () => {
    const localStickyLayer = customPropertyValue(globalCss, '--z-layer-local-sticky');
    const drawerLayer = customPropertyValue(globalCss, '--z-layer-drawer');

    expect(drawerLayer).toBeGreaterThan(localStickyLayer);
    expect(globalCss).toMatch(
      /\.drawer-layer\s*\{[^}]*isolation: isolate;[^}]*z-index: var\(--z-layer-drawer\);/s,
    );
    expect(globalCss).toMatch(
      /\.drawer-backdrop\s*\{ z-index: var\(--z-layer-content\); \}/,
    );
    expect(globalCss).toMatch(
      /\.task-drawer\s*\{[^}]*position: absolute;[^}]*z-index: var\(--z-layer-local-sticky\);/s,
    );
  });

  it('keeps the API table header sticky inside its own scroll stacking context', () => {
    expect(apiStatusCss).toMatch(
      /\.backend-api-status__checks\s*\{[^}]*isolation: isolate;[^}]*overflow-y: auto;/s,
    );
    expect(apiStatusCss).toMatch(
      /\.backend-api-status__check-row--heading\s*\{[^}]*position: sticky;[^}]*z-index: var\(--z-layer-local-sticky\);[^}]*top: 0;/s,
    );
  });
});
