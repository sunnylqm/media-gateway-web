import { Fragment, type ReactNode } from 'react';

// Model notes are Markdown an administrator writes and every tenant reads. The
// console renders the small subset a note needs — headings, paragraphs, lists,
// emphasis, inline code, and links — straight into React elements. Nothing is
// ever handed to the DOM as HTML, so a note cannot carry script or markup of
// its own, and a link only becomes one when it points at http(s).

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

const listItem = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const heading = /^(#{1,3})\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ...list });
      list = null;
    }
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const headingMatch = heading.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      continue;
    }
    const itemMatch = listItem.exec(line);
    if (itemMatch) {
      flushParagraph();
      const ordered = Boolean(itemMatch[2]);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(itemMatch[3]);
      continue;
    }
    if (list && /^\s+\S/.test(raw)) {
      // An indented line continues the list item above it.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

// Inline tokens, tried in this order at each position: code first, so that
// emphasis markers inside backticks stay literal.
const inlinePattern =
  /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/;

export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let index = 0;
  while (rest) {
    const match = inlinePattern.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (match[1]) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (match[2]) {
      nodes.push(
        <strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>,
      );
    } else if (match[3]) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      const label = token.slice(1, token.indexOf(']'));
      const href = safeHref(token.slice(token.indexOf('](') + 2, -1));
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {renderInline(label, key)}
          </a>
        ) : (
          <Fragment key={key}>{renderInline(label, key)}</Fragment>
        ),
      );
    }
    rest = rest.slice(match.index + token.length);
  }
  return nodes;
}

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseMarkdown(source);
  if (!blocks.length) return null;
  return (
    <div className={className ? `markdown ${className}` : 'markdown'}>
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        if (block.kind === 'heading') {
          const Tag = `h${block.level + 2}` as 'h3' | 'h4' | 'h5';
          return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>
                  {renderInline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </Tag>
          );
        }
        return <p key={key}>{renderInline(block.text, key)}</p>;
      })}
    </div>
  );
}

// plainText flattens a note to one line for places with no room for
// formatting, such as a list row's summary.
export function plainText(source: string): string {
  return source
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/\*([^*]+)\*|_([^_]+)_/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
