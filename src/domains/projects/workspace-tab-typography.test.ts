import { describe, expect, it } from 'vitest';

import workbenchCss from './project-workbench.css?raw';
import workspaceTabsCss from './project-workspace-tabs.css?raw';

function ruleBodies(stylesheet: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...stylesheet.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

describe('workspace tab typography', () => {
  it('uses the same enlarged typography for source and workspace tabs', () => {
    const sourceTabs = ruleBodies(workbenchCss, '.bv-source-rail__tabs button');
    const workspaceTabs = ruleBodies(workspaceTabsCss, '.project-workspace-tabs__link');

    expect(sourceTabs[0]).toMatch(/font-size:\s*15px/);
    expect(sourceTabs[0]).toMatch(/font-weight:\s*600/);
    expect(workspaceTabs[0]).toMatch(/font-size:\s*15px/);
    expect(workspaceTabs[0]).toMatch(/font-weight:\s*600/);
  });

  it('does not reduce either tab group below 15px in contextual or narrow-screen rules', () => {
    const sourceTabSizes = ruleBodies(workbenchCss, '.bv-source-rail__tabs button')
      .flatMap((body) => body.match(/font-size:\s*[^;]+/g) ?? []);
    const workspaceTabSizes = ruleBodies(workspaceTabsCss, '.project-workspace-tabs__link')
      .flatMap((body) => body.match(/font-size:\s*[^;]+/g) ?? []);

    expect(sourceTabSizes).toEqual(['font-size: 15px', 'font-size: 15px']);
    expect(workspaceTabSizes).toEqual(['font-size: 15px', 'font-size: 15px']);
  });

  it('keeps active and inactive tabs at the same size and weight', () => {
    const activeSourceTab = ruleBodies(
      workbenchCss,
      ".bv-source-rail__tabs [aria-selected='true']",
    )[0];
    const activeWorkspaceTab = ruleBodies(
      workspaceTabsCss,
      ".project-workspace-tabs__link[aria-current='page']",
    )[0];

    expect(activeSourceTab).not.toMatch(/font-(?:size|weight)/);
    expect(activeWorkspaceTab).not.toMatch(/font-(?:size|weight)/);
  });
});
