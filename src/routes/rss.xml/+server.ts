import { posts } from '$lib/content';
import { site, abs } from '$lib/site';

export const prerender = true;

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function GET() {
  const items = posts()
    .filter((p) => !p.draft)
    .map((p) => `<item><title>${esc(p.title)}</title><link>${abs(`/writing/${p.slug}/`)}</link><guid>${abs(`/writing/${p.slug}/`)}</guid><pubDate>${new Date(`${p.date}T12:00:00Z`).toUTCString()}</pubDate><description>${esc(p.summary)}</description></item>`)
    .join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.name)}</title><link>${site.url}/</link><description>${esc(site.description)}</description><language>en-us</language>${items}</channel></rss>`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
