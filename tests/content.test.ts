import { describe, expect, it } from 'vitest';
import { collect, parsePost } from '../src/lib/content';

const post = (fm: string, body = 'Hello world.') => `---\n${fm}\n---\n${body}`;
const ok = 'title: T\nsummary: S\ndate: 2026-11-18';

describe('writing pipeline', () => {
  it('parses frontmatter, reading time and html', () => {
    const p = parsePost('/src/content/writing/a-post.md', post(ok, 'word '.repeat(460)));
    expect(p).toMatchObject({ slug: 'a-post', title: 'T', date: '2026-11-18', minutes: 2, draft: false });
    expect(p.html).toContain('<p>');
  });

  it('refuses a missing field, a bad date and a bad slug', () => {
    expect(() => parsePost('/x/a.md', post('title: T\ndate: 2026-11-18'))).toThrow(/summary/);
    expect(() => parsePost('/x/a.md', post('title: T\nsummary: S\ndate: 11/18/2026'))).toThrow(/YYYY-MM-DD/);
    expect(() => parsePost('/x/Bad_Slug.md', post(ok))).toThrow(/slug/);
    expect(() => parsePost('/x/a.md', 'no frontmatter')).toThrow(/frontmatter/);
  });

  it('drops drafts unless asked, sorts newest first, refuses duplicate slugs', () => {
    const files = {
      '/w/old.md': post('title: Old\nsummary: S\ndate: 2026-01-01'),
      '/w/new.md': post('title: New\nsummary: S\ndate: 2026-06-01'),
      '/w/wip.md': post('title: Wip\nsummary: S\ndate: 2026-07-01\ndraft: true')
    };
    expect(collect(files, false).map((p) => p.slug)).toEqual(['new', 'old']);
    expect(collect(files, true).map((p) => p.slug)).toEqual(['wip', 'new', 'old']);
    expect(() => collect({ '/a/x.md': post(ok), '/b/x.md': post(ok) }, false)).toThrow(/duplicate/);
  });
});
