import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

export type Post = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  updated?: string;
  tags: string[];
  draft: boolean;
  minutes: number;
  html: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePost(file: string, raw: string): Post {
  const slug = file.replace(/^.*\//, '').replace(/\.md$/, '');
  if (!SLUG.test(slug)) throw new Error(`${file}: slug "${slug}" must be lowercase-hyphenated`);
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing --- frontmatter ---`);
  const fm = parseYaml(m[1]) ?? {};
  for (const k of ['title', 'summary', 'date']) if (!fm[k]) throw new Error(`${file}: frontmatter needs ${k}`);
  const date = String(fm.date);
  if (!DATE.test(date)) throw new Error(`${file}: date must be YYYY-MM-DD, got ${date}`);
  if (fm.updated && !DATE.test(String(fm.updated))) throw new Error(`${file}: updated must be YYYY-MM-DD`);
  const body = m[2];
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: String(fm.title),
    summary: String(fm.summary),
    date,
    updated: fm.updated ? String(fm.updated) : undefined,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    draft: fm.draft === true,
    minutes: Math.max(1, Math.round(words / 230)),
    html: marked.parse(body, { async: false }) as string
  };
}

export function collect(files: Record<string, string>, includeDrafts: boolean): Post[] {
  const posts = Object.entries(files).map(([f, raw]) => parsePost(f, raw));
  const seen = new Set<string>();
  for (const p of posts) {
    if (seen.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
    seen.add(p.slug);
  }
  return posts.filter((p) => includeDrafts || !p.draft).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

const files = import.meta.glob('/src/content/writing/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const posts = (): Post[] => collect(files, import.meta.env.DEV);
