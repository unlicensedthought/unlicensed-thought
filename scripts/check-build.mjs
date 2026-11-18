// Post-build gate: every prerendered page carries the tags crawlers and link previews read,
// drafts never ship, and every logo file stays 1:1.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = process.argv[2] ?? 'build';
const fail = [];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(BUILD);
const pages = files.filter((f) => f.endsWith('.html') && !f.endsWith('404.html'));

for (const need of ['index.html', 'writing/index.html', 'work/index.html', 'about/index.html', '404.html', 'rss.xml', 'sitemap.xml', 'robots.txt', '_headers', 'og.png', 'favicon.svg']) {
  if (!existsSync(join(BUILD, need))) fail.push(`missing ${need}`);
}
for (const f of pages) {
  const h = readFileSync(f, 'utf8');
  for (const [what, re] of [
    ['<title>', /<title>[^<]+<\/title>/],
    ['meta description', /<meta name="description" content="[^"]+"/],
    ['canonical', /<link rel="canonical" href="https:\/\/unlicensedthought\.com\/[^"]*"/],
    ['og:title', /property="og:title"/],
    ['og:image', /property="og:image" content="https:\/\/unlicensedthought\.com\/og\.png"/],
    ['prerendered body text', /<main[^>]*>[\s\S]*<h1[^>]*>[^<]+/]
  ]) if (!re.test(h)) fail.push(`${f}: no ${what}`);
}
const drafts = readdirSync('src/content/writing').filter((f) => /^draft:\s*true\s*$/m.test(readFileSync(join('src/content/writing', f), 'utf8'))).map((f) => f.replace(/\.md$/, ''));
for (const slug of drafts) {
  if (existsSync(join(BUILD, 'writing', slug))) fail.push(`draft ${slug} was built`);
  for (const feed of ['rss.xml', 'sitemap.xml']) if (readFileSync(join(BUILD, feed), 'utf8').includes(slug)) fail.push(`draft ${slug} is in ${feed}`);
}
for (const f of ['logo.svg', 'favicon.svg']) {
  const vb = readFileSync(join(BUILD, f), 'utf8').match(/viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/);
  if (!vb || vb[1] !== vb[2]) fail.push(`${f} is not 1:1`);
}

if (fail.length) {
  console.error(`check-build: FAIL (${fail.length})\n  ${fail.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-build: OK (${pages.length} pages, ${drafts.length} draft(s) withheld)`);
