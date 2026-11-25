import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

export type Post = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  updated?: string;
  publish?: string;
  released: string;
  tags: string[];
  open: string[];
  updates: { date: string; html: string; closes?: string }[];
  draft: boolean;
  minutes: number;
  html: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const inline = (md: string) => marked.parseInline(md, { async: false }) as string;

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
  const publish = fm.publish === undefined ? undefined : String(fm.publish);
  if (publish && !DATE.test(publish)) throw new Error(`${file}: publish must be YYYY-MM-DD`);
  const open = Array.isArray(fm.open) ? fm.open.map(String) : [];
  const updates: { date: string; text: string; closes?: string }[] = (Array.isArray(fm.updates) ? fm.updates : []).map((u: Record<string, unknown>, i: number): { date: string; text: string; closes?: string } => {
    const d = String(u?.date ?? '');
    if (!DATE.test(d) || !u?.text) throw new Error(`${file}: updates[${i}] needs date YYYY-MM-DD and text`);
    const closes = u.closes === undefined ? undefined : String(u.closes);
    if (closes !== undefined && !open.includes(closes)) throw new Error(`${file}: updates[${i}] closes "${closes}", which is not in open`);
    return { date: d, text: String(u.text), closes };
  });
  const body = m[2];
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: String(fm.title),
    summary: String(fm.summary),
    date,
    updated: fm.updated ? String(fm.updated) : undefined,
    publish,
    released: publish ?? date,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    open,
    updates: updates.map((u) => ({ date: u.date, html: inline(u.text), closes: u.closes })),
    draft: fm.draft === true,
    minutes: Math.max(1, Math.round(words / 230)),
    html: marked.parse(body, { async: false }) as string
  };
}

// The date a build counts as "today", in the author's time zone. RELEASE_DATE overrides it for tests and previews.
export function today(): string {
  const forced = typeof process !== 'undefined' ? process.env.RELEASE_DATE : undefined;
  if (forced) {
    if (!DATE.test(forced)) throw new Error(`RELEASE_DATE must be YYYY-MM-DD, got ${forced}`);
    return forced;
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}

export const PACE_DAYS = 7;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;

// Release a post or update on its publish date, never before. Scheduled posts must sit at least PACE_DAYS apart,
// so a backlog worked ahead goes out one a week instead of all at once.
export function collect(files: Record<string, string>, includeDrafts: boolean, on: string = today()): Post[] {
  const all = Object.entries(files).map(([f, raw]) => parsePost(f, raw));
  const seen = new Set<string>();
  for (const p of all) {
    if (seen.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
    seen.add(p.slug);
  }
  const queued = all.filter((p) => !p.draft && p.publish && p.publish > on).sort((a, b) => a.publish!.localeCompare(b.publish!));
  for (let i = 1; i < queued.length; i++) {
    const gap = dayNum(queued[i].publish!) - dayNum(queued[i - 1].publish!);
    if (gap < PACE_DAYS) throw new Error(`${queued[i - 1].slug} and ${queued[i].slug} are scheduled ${gap} days apart; keep scheduled posts ${PACE_DAYS} days apart`);
  }
  return all
    .filter((p) => includeDrafts || (!p.draft && p.released <= on))
    .map((p) => {
      const ups = p.updates.filter((u) => includeDrafts || u.date <= on).sort((a, b) => a.date.localeCompare(b.date));
      const closed = new Set(ups.map((u) => u.closes).filter(Boolean));
      const last = ups.at(-1)?.date;
      return {
        ...p,
        updates: ups.map(({ date, html }) => ({ date, html })),
        open: p.open.filter((o) => !closed.has(o)),
        updated: [p.updated, last].filter(Boolean).sort().at(-1)
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

// Slugs that exist but are not out yet, so pages that list posts by name can skip them until their day.
export function held(files: Record<string, string>, on: string = today()): Set<string> {
  return new Set(Object.entries(files).map(([f, raw]) => parsePost(f, raw)).filter((p) => p.draft || p.released > on).map((p) => p.slug));
}

const files = import.meta.glob('/src/content/writing/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const posts = (): Post[] => collect(files, import.meta.env.DEV);
export const heldBack = (): Set<string> => (import.meta.env.DEV ? new Set() : held(files));
