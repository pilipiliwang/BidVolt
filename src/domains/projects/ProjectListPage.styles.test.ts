import { describe, expect, it } from 'vitest';
import css from './ProjectListPage.css?raw';

function bodies(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1]!);
}

describe('project list responsive style contracts', () => {
  it('uses rem-based readable text and compact statistics without viewport-proportional scaling', () => {
    const page = bodies('.ui0802-project-page')[0]!;
    expect(page).toContain('--project-list-text: clamp(0.9375rem, 0.89rem + 0.12vw, 1rem)');
    expect(page).toContain('--project-list-meta: clamp(0.8125rem, 0.77rem + 0.1vw, 0.875rem)');
    expect(bodies('.ui0802-project-page .ui0802-project-search input')[0]).toContain('font-size: 1rem');
    expect(bodies('.ui0802-project-page .ui0802-summary-grid .ui0802-summary-card')[0]).toContain('min-height: 7rem');
    expect(bodies('.ui0802-project-page .ui0802-summary-card .ui0802-summary-card__icon')[0]).toContain('width: 3.25rem');
    expect(bodies('.ui0802-project-page .ui0802-summary-card strong')[0]).toContain('font-size: clamp(1.875rem, 1.75rem + 0.3vw, 2.125rem)');
    expect(css).not.toMatch(/(?:zoom|transform:\s*scale)/);
  });

  it('keeps a readable desktop table with internal scrolling and removes its width floor on mobile', () => {
    const tables = bodies('.ui0802-project-page .ui0802-project-table');
    expect(tables[0]).toContain('min-width: 64rem');
    expect(tables[0]).toContain('font-size: var(--project-list-text)');
    expect(tables[1]).toContain('min-width: 0');
    expect(bodies('.ui0802-project-page .ui0802-project-table-scroll')[0]).toContain('overflow-x: auto');
    expect(css).toContain('@media (max-width: 760px)');
  });

  it('keeps mobile statistics compact while letting enlarged text reflow into fewer columns', () => {
    expect(bodies('.ui0802-project-page .ui0802-summary-grid')[0]).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr))');
    expect(bodies('.ui0802-project-page .ui0802-summary-grid').at(-1)).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 5.25rem), 1fr))');
    expect(bodies('.ui0802-project-page .ui0802-summary-grid .ui0802-summary-card').at(-1)).toContain('min-height: 6.25rem');
    expect(bodies('.ui0802-project-page .ui0802-summary-card .ui0802-summary-card__icon').at(-1)).toContain('display: none');
    expect(bodies('.ui0802-project-page .ui0802-summary-card strong').at(-1)).toContain('font-size: 1.75rem');
    expect(bodies('.ui0802-project-page .ui0802-execution-status')[0]).toContain('font-size: 0.875rem');
  });

  it('keeps long values inside their cells and mobile labels separate from every value subtree', () => {
    expect(bodies('.ui0802-project-page .ui0802-project-cell-value')[0]).toContain('overflow-wrap: anywhere');
    expect(bodies('.ui0802-project-page .ui0802-project-cell-value')[1]).toContain('grid-column: 2');
    expect(bodies('.ui0802-project-page .ui0802-project-table td').at(-1)).toContain('grid-template-columns: min(5.5rem, 35%) minmax(0, 1fr)');
    expect(bodies('.ui0802-project-page .ui0802-project-table tbody td::before')[0]).toContain('content: attr(data-label)');
    expect(bodies('.ui0802-project-page .ui0802-execution-status')[0]).toContain('white-space: normal');
    expect(bodies('.ui0802-project-page .ui0802-row-actions')[0]).toContain('flex-wrap: wrap');
  });

  it('allows dates to wrap on mobile instead of overflowing their remaining value width at 200% text size', () => {
    const dates = bodies('.ui0802-project-page .ui0802-project-table time');
    expect(dates.at(-1)).toContain('white-space: normal');
    expect(dates.at(-1)).toContain('overflow-wrap: anywhere');
    expect(css).not.toContain('grid-template-columns: 5.5rem minmax(0, 1fr)');
    expect(css).not.toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });
});
