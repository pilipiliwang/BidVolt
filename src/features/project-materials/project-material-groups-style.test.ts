import { describe, expect, it } from 'vitest';

import projectMaterialsCss from './project-materials.css?raw';

describe('project material group accordion styles', () => {
  it('rotates the chevron clearly and preserves keyboard focus styling', () => {
    expect(projectMaterialsCss).toMatch(
      /\.project-section-heading__toggle svg\s*{[^}]*transform:\s*rotate\(-90deg\)[^}]*transition:/s,
    );
    expect(projectMaterialsCss).toMatch(
      /\.project-section-heading__toggle\[aria-expanded='true'\] svg\s*{[^}]*rotate\(0deg\)/s,
    );
    expect(projectMaterialsCss).toMatch(
      /\.project-section-heading__toggle:focus-visible\s*{[^}]*outline:/s,
    );
  });

  it('keeps accordion actions usable on narrow screens and respects reduced motion', () => {
    expect(projectMaterialsCss).toMatch(
      /@media \(max-width: 520px\)[\s\S]*\.project-section-heading__actions\s*{[^}]*width:\s*100%[^}]*justify-content:\s*space-between/s,
    );
    expect(projectMaterialsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.project-section-heading__toggle svg\s*{[^}]*transition:\s*none/s,
    );
  });
});
