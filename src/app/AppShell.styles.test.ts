import { describe, expect, it } from 'vitest';

import globalCss from '../styles/global.css?raw';
import shellCss from '../styles/ui0802-shell.css?raw';
import appShellCss from './AppShell.css?raw';

describe('workbench typography and shell layout contracts', () => {
  it('honors browser text preferences instead of scaling the root with the viewport', () => {
    const htmlRule = globalCss.match(/\nhtml\s*\{([^}]+)\}/)?.[1];
    expect(htmlRule).toContain('font-size: 100%');
    expect(htmlRule).toContain('min-width: 0');
    expect(htmlRule).not.toMatch(/font-size:\s*clamp/);
    expect(shellCss).toContain('--sidebar-width: clamp(14rem, 15vw, 15.5rem)');
    expect(shellCss).not.toContain('--sidebar-width: 220px');
  });

  it('limits the project list reading width without constraining document workspaces', () => {
    expect(appShellCss).toContain('--workbench-max-width: 115rem');
    expect(appShellCss).toContain('.ui0802-shell.ui0802-shell--project-list .page-content');
    expect(appShellCss).toContain('max-width: var(--workbench-max-width)');
    expect(appShellCss).toContain('margin-inline: auto');
    expect(appShellCss).toContain('.ui0802-shell.ui0802-shell--project-workflow');
  });

  it('keeps the mobile page heading visible and lets navigation branding wrap', () => {
    expect(appShellCss).toMatch(/\.ui0802-shell\.ui0802-shell--project-list \.topbar__heading\s*\{\s*display: grid/);
    expect(appShellCss).toMatch(/\.ui0802-shell \.mobile-nav__header \.brand\s*\{[^}]*min-width: 0;[^}]*white-space: normal/s);
    expect(appShellCss).toMatch(/\.ui0802-shell \.mobile-nav__header \.icon-button\s*\{\s*flex-shrink: 0/);
  });
});
