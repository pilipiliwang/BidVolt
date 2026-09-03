import { describe, expect, it } from 'vitest';

import shellCss from './AppShell.css?raw';
import workflowCss from '../domains/projects/project-workflow.css?raw';
import workbenchCss from '../domains/projects/project-workbench.css?raw';
import uiShellCss from '../styles/ui0802-shell.css?raw';

describe('project viewport layout styles', () => {
  it('allocates the workflow and diagnostics inside a single viewport', () => {
    expect(shellCss).toMatch(
      /\.ui0802-shell\.ui0802-shell--project-workflow\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    );
    expect(shellCss).toMatch(
      /\.ui0802-shell--project-workflow \.page-content\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s,
    );
    expect(shellCss).toMatch(
      /\.ui0802-shell--project-workflow \.page-diagnostics\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*auto;/s,
    );
  });

  it('lets the workflow grid fill its assigned row without viewport subtraction', () => {
    expect(workflowCss).toMatch(
      /\.project-workflow-frame\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*overflow:\s*hidden;/s,
    );
    expect(workflowCss).toMatch(
      /\.project-workflow-frame > \.bv-project-workspace\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(workflowCss).not.toMatch(
      /\.project-workflow-frame > \.bv-project-workspace\s*\{[^}]*calc\(100(?:d)?vh/s,
    );
    expect(workbenchCss).toMatch(
      /\.bv-project-workspace__main,\s*\.bv-project-workspace__right\s*\{[^}]*min-height:\s*0;/s,
    );
  });

  it('keeps project-list overflow inside the table at laptop widths', () => {
    expect(uiShellCss).toMatch(
      /\.ui0802-project-table-scroll\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s,
    );
    expect(uiShellCss).toMatch(
      /\.ui0802-project-table\s*\{[^}]*min-width:\s*920px;/s,
    );
    expect(uiShellCss).toMatch(
      /@media \(min-width: 1025px\) and \(max-width: 1180px\)[\s\S]*\.ui0802-shell--project-list/s,
    );
  });
});
