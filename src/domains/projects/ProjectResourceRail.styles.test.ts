import { describe, expect, it } from 'vitest';
import css from './project-resource-rail.css?raw';

function ruleBody(selector: string) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => (
    match[1]!.split(',').some((candidate) => candidate.trim() === selector)
  ));
  return rules.map((rule) => rule[2]).join('\n');
}

describe('project resource rail visual contracts', () => {
  it('uses the same inset panel shape and spacing for enterprise files and generated results', () => {
    const enterprise = ruleBody('.bv-resource-rail__group-content--enterprise');
    const results = ruleBody('.bv-resource-rail__group-content--results');
    expect(enterprise).not.toBe('');
    expect(enterprise).toBe(results);
    expect(enterprise).toMatch(/margin:\s*8px 2px 7px/);
    expect(enterprise).toMatch(/padding:\s*12px 8px 10px/);
    expect(enterprise).toMatch(/border:\s*1px solid/);
    expect(enterprise).toMatch(/border-radius:\s*12px/);
  });

  it('aligns enterprise and result folder rows while retaining the result status column', () => {
    const common = ruleBody('.bv-resource-folder__toggle');
    const result = ruleBody('.bv-resource-folder__toggle--result');
    expect(common).toMatch(/min-height:\s*46px/);
    expect(common).toMatch(/grid-template-columns:\s*14px 18px minmax\(0, 1fr\) auto/);
    expect(result).toMatch(/grid-template-columns:\s*14px 18px minmax\(0, 1fr\) auto auto/);
    if (/min-height:/.test(result)) expect(result).toMatch(/min-height:\s*46px/);
    if (/padding:/.test(result)) expect(result).toMatch(/padding:\s*8px/);
  });

  it('removes the separate line above enterprise upload while matching the result action spacing', () => {
    const upload = ruleBody('.bv-resource-rail__upload-slot');
    expect(upload).toMatch(/margin:\s*10px 4px 2px/);
    expect(upload).toMatch(/padding:\s*0(?:px)?\s*;/);
    expect(upload).toMatch(/border:\s*0(?:px)?\s*;/);
    expect(upload).not.toMatch(/border-top:\s*(?!0\b|none\b)[^;]+;/);
    expect(ruleBody('.bv-resource-rail__download-all')).toMatch(/margin:\s*10px 4px 2px/);
    for (const selector of ['.bv-resource-rail .bv-resource-rail__upload-slot button', '.bv-resource-rail__download-all']) {
      expect(ruleBody(selector)).toMatch(/min-height:\s*40px/);
      expect(ruleBody(selector)).toMatch(/font-size:\s*14px/);
      expect(ruleBody(selector)).toMatch(/padding:\s*7px 10px/);
    }
  });

  it('keeps counts aligned in top-level toggles and the package selector in one compact row', () => {
    expect(ruleBody('.bv-resource-rail__group-toggle')).toMatch(/grid-template-columns:\s*26px minmax\(0, 1fr\) auto 17px/);
    expect(ruleBody('.bv-resource-rail__group-count')).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(ruleBody('.bv-resource-rail__group-count')).toMatch(/min-width:\s*2\.5rem/);
    expect(ruleBody('.bv-resource-rail__group-count')).toMatch(/font-size:\s*13px/);
    expect(ruleBody('.bv-resource-rail__package-version')).toMatch(/grid-template-columns:\s*auto minmax\(0, 1fr\)/);
    expect(ruleBody('.bv-resource-rail__package-version select')).toMatch(/min-height:\s*34px/);
    expect(ruleBody('.bv-resource-rail__package-version select:focus-visible')).toMatch(/outline:\s*2px solid/);
    expect(css).not.toContain('.bv-resource-rail__package-version small');
  });
});
