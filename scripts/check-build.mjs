// Post-build gate: every prerendered page carries the tags crawlers and link previews read,
// drafts and posts scheduled after today never ship, every logo file stays 1:1, and build.txt names the built commit.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = process.argv[2] ?? 'build';
const fail = [];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(BUILD);
const pages = files.filter((f) => f.endsWith('.html') && !f.endsWith('404.html'));

for (const need of ['index.html', 'writing/index.html', 'start/index.html', 'portfolio/index.html', 'about/index.html', '404.html', 'rss.xml', 'sitemap.xml', 'robots.txt', '_headers', 'og.png', 'favicon.svg', 'build.txt', 'released.txt', 'logo.svg']) {
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
const today = process.env.RELEASE_DATE || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
const drafts = readdirSync('src/content/writing')
  .filter((f) => {
    const raw = readFileSync(join('src/content/writing', f), 'utf8');
    const publish = raw.match(/^publish:\s*'?(\d{4}-\d{2}-\d{2})'?\s*$/m)?.[1];
    return /^draft:\s*true\s*$/m.test(raw) || (publish && publish > today);
  })
  .map((f) => f.replace(/\.md$/, ''));
for (const slug of drafts) {
  if (existsSync(join(BUILD, 'writing', slug))) fail.push(`draft or scheduled post ${slug} was built`);
  for (const feed of ['rss.xml', 'sitemap.xml', 'released.txt']) if (readFileSync(join(BUILD, feed), 'utf8').includes(slug)) fail.push(`draft or scheduled post ${slug} is in ${feed}`);
}
if (existsSync(join(BUILD, 'build.txt')) && !/^[0-9a-f]{40}\n$/.test(readFileSync(join(BUILD, 'build.txt'), 'utf8'))) fail.push('build.txt is not one 40-char commit sha and a newline');
for (const f of ['logo.svg', 'favicon.svg']) {
  const vb = readFileSync(join(BUILD, f), 'utf8').match(/viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/);
  if (!vb || vb[1] !== vb[2]) fail.push(`${f} is not 1:1`);
}

if (fail.length) {
  console.error(`check-build: FAIL (${fail.length})\n  ${fail.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-build: OK (${pages.length} pages, ${drafts.length} draft or scheduled post(s) withheld)`);
