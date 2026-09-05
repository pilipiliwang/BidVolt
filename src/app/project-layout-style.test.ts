import { describe, expect, it } from 'vitest';

import shellCss from './AppShell.css?raw';
import workflowCss from '../domains/projects/project-workflow.css?raw';
import resultCss from '../domains/projects/project-result-workspace.css?raw';
import workbenchCss from '../domains/projects/project-workbench.css?raw';
import uiShellCss from '../styles/ui0802-shell.css?raw';
import materialsCss from '../features/project-materials/project-materials.css?raw';

function ruleBody(css: string, selector: string) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1]!.split(',').some((candidate) => candidate.trim() === selector))
    .map((match) => match[2]).join('\n');
}

describe('project viewport layout styles', () => {
  it('shares workflow elevation with the resource rail and leaves room to paint its shadow', () => {
    expect(workflowCss).toMatch(/\.project-workflow-frame\s*\{[^}]*--project-canvas-shadow:/s);
    expect(workflowCss).toMatch(/\.project-workflow-header\s*\{[^}]*box-shadow:\s*var\(--project-canvas-shadow\)/s);
    expect(resultCss).toContain('--result-canvas-shadow: var(--project-canvas-shadow,');
    expect(resultCss).toMatch(/\.project-result-workspace__rail\s*\{[^}]*border-radius:\s*16px;[^}]*box-shadow:\s*var\(--result-canvas-shadow\);/s);
    expect(resultCss).toMatch(/\.project-workflow-frame > \.project-result-workspace\s*\{[^}]*overflow:\s*visible;/s);
    expect(resultCss).toMatch(/--rail-collapsed \.project-result-workspace__rail\s*\{[^}]*box-shadow:\s*none;/s);
  });

  it('elevates the complete summary as a rounded card without a green divider', () => {
    expect(resultCss).toMatch(/\.project-result-workspace__summary\s*\{[^}]*border-radius:\s*18px;[^}]*box-shadow:\s*var\(--result-canvas-shadow\);/s);
    expect(resultCss).toMatch(/\.project-result-workspace__context-divider\s*\{[^}]*background:\s*transparent;/s);
    expect(resultCss).toMatch(/\.project-result-workspace__context-divider::after\s*\{\s*content:\s*none;/s);
    expect(resultCss).not.toContain('background: #9dc5af');
    // Only remove the separator, not the real generation-progress indicator.
    expect(resultCss).toMatch(/\.project-result-workspace__progress > span\s*\{[^}]*background:\s*linear-gradient/s);
  });

  it('keeps the handle on the card edge and removes the hidden status shadow when focused', () => {
    expect(resultCss).toMatch(/\.project-result-workspace__summary-toggle\s*\{[^}]*transform:\s*translateY\(-7px\);/s);
    expect(resultCss).toMatch(/--summary-collapsed \.project-result-workspace__summary-toggle\s*\{[^}]*transform:\s*none;/s);
    expect(resultCss).toMatch(/--summary-collapsed \.project-result-workspace__status\s*\{[^}]*box-shadow:\s*none;/s);
  });

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
      /\.project-workflow-frame > \.bv-project-workspace\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*visible;/s,
    );
    expect(workflowCss).not.toMatch(
      /\.project-workflow-frame > \.bv-project-workspace\s*\{[^}]*calc\(100(?:d)?vh/s,
    );
    expect(workbenchCss).toMatch(
      /\.bv-project-workspace__main,\s*\.bv-project-workspace__right\s*\{[^}]*min-height:\s*0;/s,
    );
  });

  it('matches the upload source rail elevation to the top workflow bar without removing its internal scroll', () => {
    const sourceRail = ruleBody(workflowCss, '.project-workflow-frame .bv-source-rail');
    expect(sourceRail).toMatch(/border-radius:\s*18px;/);
    expect(sourceRail).toMatch(/background:\s*#fff;/);
    expect(sourceRail).toMatch(/box-shadow:\s*var\(--project-canvas-shadow\);/);
    expect(ruleBody(workflowCss, '.project-workflow-frame')).toMatch(/padding:\s*0 18px 18px;/);
    expect(ruleBody(workbenchCss, '.bv-source-rail__folders')).toMatch(/overflow-y:\s*auto;/);
    expect(ruleBody(workbenchCss, '.bv-source-rail__folders')).toMatch(/min-height:\s*0;/);
  });

  it('preserves the narrow workspace scroll and container-driven upload stacking', () => {
    expect(workflowCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.project-workflow-frame > \.bv-project-workspace\s*\{[^}]*overflow-y:\s*auto;/);
    expect(workflowCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.project-workflow-frame > \.bv-project-workspace\s*\{[^}]*padding:\s*4px 6px 14px;/);
    expect(materialsCss).toMatch(/@container material-setup \(max-width: 820px\)\s*\{[\s\S]*?\.project-generation-setup > \.project-material-upload\s*\{[^}]*overflow-y:\s*auto;/);
    expect(materialsCss).toMatch(/@container material-setup \(max-width: 820px\)[\s\S]*?\.project-generation-upload-layout\s*\{[^}]*height:\s*auto;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(ruleBody(materialsCss, '.project-generation-material-list__body')).toMatch(/overflow-y:\s*auto;/);
    expect(ruleBody(materialsCss, '.project-generation-material-list__body')).toMatch(/min-height:\s*0;/);
    expect(ruleBody(materialsCss, '.project-generation-setup')).toMatch(/min-height:\s*0;/);
    expect(ruleBody(materialsCss, '.project-generation-setup')).toMatch(/overflow:\s*hidden;/);
    const uploadList = ruleBody(materialsCss, '.project-generation-upload-layout > .project-upload-card-list');
    expect(uploadList).toMatch(/overflow-y:\s*auto;/);
    expect(uploadList).toMatch(/padding:\s*3px 6px 8px 3px;/);
  });

  it('lets mobile upload content establish its height after the workspace switches from grid to block', () => {
    // A zero flex basis inside a percentage-height setup collapsed the upload
    // scrollport to 0px at 390px, even though its children were 1355px tall.
    const mobileSetup = ruleBody(materialsCss, '.project-workflow-frame .project-generation-setup');
    const mobileUpload = ruleBody(materialsCss, '.project-workflow-frame .project-generation-setup > .project-material-upload');
    expect(mobileSetup).toMatch(/height:\s*auto;/);
    expect(mobileSetup).toMatch(/overflow:\s*visible;/);
    expect(mobileUpload).toMatch(/flex:\s*0 0 auto;/);
    expect(mobileUpload).toMatch(/overflow:\s*visible;/);
    expect(materialsCss).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.project-workflow-frame \.project-generation-setup\s*\{[^}]*height:\s*auto;/);
    // The stronger workflow-only override must follow the tablet container
    // rule; desktop remains a bounded canvas with its original scroll area.
    expect(materialsCss.indexOf('.project-workflow-frame .project-generation-setup > .project-material-upload'))
      .toBeGreaterThan(materialsCss.indexOf('@container material-setup (max-width: 820px)'));
    expect(ruleBody(materialsCss, '.project-generation-setup')).toMatch(/height:\s*100%;/);
    expect(ruleBody(materialsCss, '.project-generation-setup > .project-material-upload')).toMatch(/flex:\s*1 1 0;/);
  });

  it('lowers only the upload setup canvas beneath its white cards', () => {
    const setupMain = ruleBody(workflowCss, '.project-workflow-frame .bv-project-workspace__main:has(.project-generation-setup)');
    expect(setupMain).toMatch(/background:\s*#eef3f2;/);
    expect(setupMain).toMatch(/border-color:\s*#dfe7e2;/);
    expect(setupMain).toMatch(/border-radius:\s*18px;/);
    expect(setupMain).toMatch(/box-shadow:\s*none;/);
    expect(ruleBody(materialsCss, '.project-generation-setup')).toMatch(/background:\s*#eef3f2;/);
    expect(ruleBody(materialsCss, '.project-generation-setup__header')).toMatch(/background:\s*transparent;/);
    expect(ruleBody(materialsCss, '.project-generation-setup__header')).toMatch(/border-bottom:\s*0;/);
    // Normal editor/material pages must not inherit the new upload-only backdrop.
    expect(ruleBody(workflowCss, '.project-workflow-frame .bv-project-workspace__main')).not.toMatch(/background:\s*#eef3f2|box-shadow:\s*none/);
    expect(ruleBody(materialsCss, '.project-material-page')).toMatch(/background:\s*#fff;/);
  });

  it('gives upload cards, material lists and the action panel a consistent white foreground', () => {
    const uploadCard = ruleBody(materialsCss, '.project-generation-upload-layout > .project-upload-card-list > .project-upload-card');
    const materialList = ruleBody(materialsCss, '.project-generation-material-list');
    for (const panel of [uploadCard, materialList]) {
      expect(panel).toMatch(/background:\s*#fff;/);
      expect(panel).toMatch(/border-radius:\s*12px;/);
      expect(panel).toMatch(/box-shadow:\s*var\(--project-setup-card-shadow,/);
    }
    const actions = ruleBody(materialsCss, '.project-generation-setup__actions');
    expect(actions).toMatch(/grid-column:\s*1;/);
    expect(actions).toMatch(/grid-row:\s*2;/);
    expect(actions).toMatch(/background:\s*#fff;/);
    expect(actions).toMatch(/padding:\s*10px 12px;/);
    expect(actions).toMatch(/border-radius:\s*12px;/);
    expect(actions).toMatch(/box-shadow:\s*0 -5px 14px -10px[^;]+var\(--project-setup-card-shadow\);/);
    expect(ruleBody(materialsCss, '.project-material-upload--generation')).toMatch(/background:\s*transparent;/);
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
