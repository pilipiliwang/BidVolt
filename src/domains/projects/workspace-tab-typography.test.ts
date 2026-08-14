import { describe, expect, it } from 'vitest';

import workbenchCss from './project-workbench.css?raw';
import workspaceTabsCss from './project-workspace-tabs.css?raw';

function ruleBodies(stylesheet: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...stylesheet.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

describe('workspace tab typography', () => {
  it('keeps the enterprise source as a card heading instead of restoring fake tabs', () => {
    const sourceHeading = ruleBodies(workbenchCss, '.bv-source-rail__header h2');
    const sourceFolders = ruleBodies(workbenchCss, '.bv-source-folder__toggle');
    const workspaceTabs = ruleBodies(workspaceTabsCss, '.project-workspace-tabs__link');

    expect(workbenchCss).not.toContain('.bv-source-rail__tabs');
    expect(sourceHeading[0]).toMatch(/font-size:\s*21px/);
    expect(sourceFolders[0]).toMatch(/font-size:\s*13px/);
    expect(sourceFolders[0]).toMatch(/font-weight:\s*650/);
    expect(workspaceTabs[0]).toMatch(/font-size:\s*15px/);
    expect(workspaceTabs[0]).toMatch(/font-weight:\s*600/);
  });

  it('enlarges folder controls in content mode without reducing workspace tabs on narrow screens', () => {
    const contentFolderSizes = ruleBodies(
      workbenchCss,
      '.bv-project-workspace--content .bv-source-folder__toggle',
    )
      .flatMap((body) => body.match(/font-size:\s*[^;]+/g) ?? []);
    const workspaceTabSizes = ruleBodies(workspaceTabsCss, '.project-workspace-tabs__link')
      .flatMap((body) => body.match(/font-size:\s*[^;]+/g) ?? []);

    expect(contentFolderSizes).toEqual(['font-size: 15px']);
    expect(workspaceTabSizes).toEqual(['font-size: 15px', 'font-size: 15px']);
  });

  it('keeps active and inactive workspace tabs at the same size and weight', () => {
    const activeWorkspaceTab = ruleBodies(
      workspaceTabsCss,
      ".project-workspace-tabs__link[aria-current='page']",
    )[0];

    expect(activeWorkspaceTab).not.toMatch(/font-(?:size|weight)/);
  });
});
