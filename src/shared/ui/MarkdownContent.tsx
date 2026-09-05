import type { ReactNode } from 'react';

import './MarkdownContent.css';

type MarkdownContentProps = {
  className?: string;
  content: string;
};

type MarkdownBlock =
  | { kind: 'code'; language?: string; lines: string[] }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'rule' };

export function MarkdownContent({ className = '', content }: MarkdownContentProps) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <div className={`bv-markdown ${className}`.trim()}>
      {blocks.map((block, blockIndex) => {
        const key = `${block.kind}-${blockIndex}`;
        if (block.kind === 'code') {
          return <pre key={key}><code data-language={block.language}>{block.lines.join('\n')}</code></pre>;
        }
        if (block.kind === 'heading') {
          const Heading = (`h${Math.min(4, Math.max(2, block.level + 1))}`) as 'h2' | 'h3' | 'h4';
          return <Heading key={key}>{renderInlineMarkdown(block.text, key)}</Heading>;
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>
              ))}
            </List>
          );
        }
        if (block.kind === 'quote') {
          return <blockquote key={key}>{renderLines(block.lines, key)}</blockquote>;
        }
        if (block.kind === 'rule') return <hr key={key} />;
        return <p key={key}>{renderLines(block.lines, key)}</p>;
      })}
    </div>
  );
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^\s*```([^`]*)$/.exec(line);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        kind: 'code',
        language: fence[1]?.trim() || undefined,
        lines: codeLines,
      });
      continue;
    }

    const heading = /^\s*(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index] ?? '';
        const match = isOrdered
          ? /^\s*\d+[.)]\s+(.+)$/.exec(candidate)
          : /^\s*[-*+]\s+(.+)$/.exec(candidate);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ items, kind: 'list', ordered: isOrdered });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'quote', lines: quoteLines });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const candidate = lines[index] ?? '';
      if (!candidate.trim() || isBlockStart(candidate)) break;
      paragraph.push(candidate.trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }

  return blocks;
}

function isBlockStart(line: string) {
  return /^\s*(?:```|#{1,4}\s+|[-*+]\s+|\d+[.)]\s+|>\s?|---+\s*$|___+\s*$)/.test(line);
}

function renderLines(lines: readonly string[], keyPrefix: string) {
  return lines.flatMap((line, index): ReactNode[] => [
    ...(index > 0 ? [<br key={`${keyPrefix}-break-${index}`} />] : []),
    ...renderInlineMarkdown(line, `${keyPrefix}-line-${index}`),
  ]);
}

function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const tokenPattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) output.push(value.slice(cursor, start));
    const token = match[0];
    const key = `${keyPrefix}-inline-${tokenIndex}`;
    if (token.startsWith('**')) {
      output.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      output.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = safeMarkdownHref(link?.[2]);
      output.push(href
        ? <a href={href} key={key} rel="noreferrer" target="_blank">{link?.[1]}</a>
        : token);
    }
    cursor = start + token.length;
    tokenIndex += 1;
  }
  if (cursor < value.length) output.push(value.slice(cursor));
  return output;
}

function safeMarkdownHref(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}
