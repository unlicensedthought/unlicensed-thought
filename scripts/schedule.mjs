// schedule.mjs [YYYY-MM-DD]: lists what is written but not out yet, soonest first.
// One line each: "<date> post <slug>" or "<date> update <slug>". The date defaults to today in Denver.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const DIR = 'src/content/writing';
const today = process.argv[2] || process.env.RELEASE_DATE || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error(`schedule: date must be YYYY-MM-DD, got ${today}`);
  process.exit(2);
}
const rows = [];
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  const m = readFileSync(join(DIR, f), 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) {
    console.error(`schedule: ${f} has no frontmatter`);
    process.exit(1);
  }
  const fm = parse(m[1]) ?? {};
  if (fm.draft === true) continue;
  const slug = f.replace(/\.md$/, '');
  if (fm.publish && String(fm.publish) > today) rows.push(`${fm.publish} post ${slug}`);
  for (const u of fm.updates ?? []) if (String(u.date) > today) rows.push(`${u.date} update ${slug}`);
}
for (const r of rows.sort()) console.log(r);
