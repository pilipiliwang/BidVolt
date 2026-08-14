import { describe, expect, it } from 'vitest';

import overviewCss from './project-overview-0802.css?raw';

describe('overview active task styling', () => {
  it('uses a white neutral surface for both queued and running states', () => {
    expect(overviewCss).toMatch(
      /\.bv-overview-empty\[data-task-status='queued'\],\s*\.bv-overview-empty\[data-task-status='running'\]\s*\{[^}]*border-color: #d5ddd8;[^}]*color: #445149;[^}]*background: #fff;/,
    );
    expect(overviewCss).toMatch(
      /\.bv-overview-empty\[data-task-status='queued'\] > svg,\s*\.bv-overview-empty\[data-task-status='running'\] > svg\s*\{ color: #526057; \}/,
    );
    expect(overviewCss).toMatch(
      /\.bv-overview-empty__task--queued,\s*\.bv-overview-empty__task--running\s*\{[^}]*border-color: #d5ddd8;[^}]*color: #29362f;[^}]*background: #fff;/,
    );
  });

  it('keeps green limited to the active progress treatment and action', () => {
    expect(overviewCss).toMatch(
      /\.bv-overview-empty__task--queued \.bv-overview-empty__progress,\s*\.bv-overview-empty__task--running \.bv-overview-empty__progress\s*\{\s*background: #d7efe2;/,
    );
    expect(overviewCss).toMatch(
      /\.bv-overview-empty__task--queued \.bv-overview-empty__progress > span,\s*\.bv-overview-empty__task--running \.bv-overview-empty__progress > span\s*\{\s*background: #009a55;/,
    );
    expect(overviewCss).toMatch(
      /\.bv-overview-empty__task--queued button,\s*\.bv-overview-empty__task--running button\s*\{[^}]*color: #fff;[^}]*background: #009a55;/,
    );
  });

  it('does not color the active surface, border, text, or icon green', () => {
    const activeRules = [...overviewCss.matchAll(
      /[^{}]*(?:task-status='(?:queued|running)'|task--(?:queued|running))[^{}]*\{[^}]*\}/g,
    )].map((match) => match[0]).join('\n');

    expect(activeRules).not.toContain('#a96c07');
    expect(activeRules).not.toContain('#eed59e');
    expect(activeRules).not.toContain('#285d86');
    expect(activeRules).not.toContain('#bfd8ec');
    expect(activeRules).not.toContain('background: #effaf4');
    expect(activeRules).not.toContain('border-color: #a9dcbf');
    expect(activeRules).not.toContain('color: #087747');
    expect(activeRules).not.toMatch(/> svg\s*\{ color: #009a55;/);
  });
});
