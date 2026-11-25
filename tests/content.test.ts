import { describe, expect, it } from 'vitest';
import { collect, held, parsePost } from '../src/lib/content';

const post = (fm: string, body = 'Hello world.') => `---\n${fm}\n---\n${body}`;
const ok = 'title: T\nsummary: S\ndate: 2026-11-18';

describe('writing pipeline', () => {
  it('parses frontmatter, reading time and html', () => {
    const p = parsePost('/src/content/writing/a-post.md', post(ok, 'word '.repeat(460)));
    expect(p).toMatchObject({ slug: 'a-post', title: 'T', date: '2026-11-18', minutes: 2, draft: false });
    expect(p.html).toContain('<p>');
  });

  it('orders posts with the same date by title, so the list is stable', () => {
    const files = {
      '/w/b.md': post('title: Beta\nsummary: S\ndate: 2026-11-15'),
      '/w/a.md': post('title: Alpha\nsummary: S\ndate: 2026-11-15'),
      '/w/c.md': post('title: Gamma\nsummary: S\ndate: 2026-11-16')
    };
    expect(collect(files, false).map((p) => p.slug)).toEqual(['c', 'a', 'b']);
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

  it('holds a post until its publish date and an update until its own date', () => {
    const files = {
      '/w/out.md': post('title: Out\nsummary: S\ndate: 2026-04-01\nopen: [No idle timer.]\nupdates:\n  - date: 2026-12-08\n    text: Added an *idle* timer.\n    closes: No idle timer.'),
      '/w/soon.md': post('title: Soon\nsummary: S\ndate: 2026-11-03\npublish: 2026-12-01')
    };
    const before = collect(files, false, '2026-11-30');
    expect(before.map((p) => p.slug)).toEqual(['out']);
    expect(before[0]).toMatchObject({ open: ['No idle timer.'], updates: [], updated: undefined });
    expect([...held(files, '2026-11-30')]).toEqual(['soon']);
    const after = collect(files, false, '2026-12-08');
    expect(after.map((p) => p.slug)).toEqual(['soon', 'out']);
    expect(after.find((p) => p.slug === 'soon')!.released).toBe('2026-12-01');
    const out = after.find((p) => p.slug === 'out')!;
    expect(out).toMatchObject({ open: [], updated: '2026-12-08' });
    expect(out.updates[0].html).toContain('<em>idle</em>');
    expect(held(files, '2026-12-08').size).toBe(0);
  });

  it('refuses scheduled posts closer than a week apart, and an update that closes nothing', () => {
    const files = {
      '/w/a.md': post('title: A\nsummary: S\ndate: 2026-11-01\npublish: 2026-12-01'),
      '/w/b.md': post('title: B\nsummary: S\ndate: 2026-11-02\npublish: 2026-12-05')
    };
    expect(() => collect(files, false, '2026-11-25')).toThrow(/4 days apart/);
    expect(collect(files, false, '2026-12-05').map((p) => p.slug)).toEqual(['b', 'a']);
    expect(() => parsePost('/w/c.md', post(`${ok}\nupdates:\n  - date: 2026-12-01\n    text: T\n    closes: nope`))).toThrow(/not in open/);
  });
});
