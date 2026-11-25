import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { collect } from '../src/lib/content';
import { groups, resolve } from '../src/lib/start';

const dir = 'src/content/writing';
const files = Object.fromEntries(readdirSync(dir).map((f) => [`/${dir}/${f}`, readFileSync(`${dir}/${f}`, 'utf8')]));
const all = collect(files, false);

describe('start page', () => {
  it('lists every published post exactly once', () => {
    const n = resolve(all).reduce((s, g) => s + g.entries.length, 0);
    expect(n).toBe(all.length);
  });
  it('refuses a published post it does not list', () => {
    const extra = { ...all[0], slug: 'a-new-post-nobody-placed' };
    expect(() => resolve([...all, extra])).toThrow(/missing published posts: a-new-post-nobody-placed/);
  });
  it('refuses a slug that is not a post', () => {
    expect(() => resolve(all.filter((p) => p.slug !== groups[0].entries[0].slug))).toThrow(/unknown post/);
  });
});
