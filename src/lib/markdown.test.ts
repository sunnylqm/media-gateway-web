import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, parseMarkdown, plainText, safeHref } from './markdown';

const html = (source: string) =>
  renderToStaticMarkup(createElement(Markdown, { source }));

describe('model note markdown', () => {
  it('splits headings, paragraphs, and lists', () => {
    expect(
      parseMarkdown(
        '# Title\n\nFirst line\nsecond line\n\n- one\n- two\n1. three',
      ),
    ).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'First line second line' },
      { kind: 'list', ordered: false, items: ['one', 'two'] },
      { kind: 'list', ordered: true, items: ['three'] },
    ]);
  });

  it('renders emphasis, code, and links', () => {
    expect(html('**Wan** is `async`, see [docs](https://example.com/a)')).toBe(
      '<div class="markdown"><p><strong>Wan</strong> is <code>async</code>, see <a href="https://example.com/a" target="_blank" rel="noopener noreferrer">docs</a></p></div>',
    );
  });

  it('keeps emphasis markers inside code literal', () => {
    expect(html('`**not bold**`')).toBe(
      '<div class="markdown"><p><code>**not bold**</code></p></div>',
    );
  });

  it('never emits markup or unsafe links from the note', () => {
    const rendered = html(
      '<img src=x onerror=alert(1)> [click](javascript:alert(1))',
    );
    expect(rendered).not.toContain('<img');
    expect(rendered).not.toContain('href');
    expect(rendered).toContain('&lt;img');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://example.com')).toBe('https://example.com/');
  });

  it('flattens a note to one line', () => {
    expect(
      plainText('**Wan 3.0** — video\n\n- `480P` / [docs](https://x)'),
    ).toBe('Wan 3.0 — video 480P / docs');
  });
});
