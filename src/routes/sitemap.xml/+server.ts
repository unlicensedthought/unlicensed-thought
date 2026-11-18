import { posts } from '$lib/content';
import { abs } from '$lib/site';

export const prerender = true;

export function GET() {
  const paths = ['/', '/writing/', '/work/', '/about/', ...posts().filter((p) => !p.draft).map((p) => `/writing/${p.slug}/`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${abs(p)}</loc></url>`).join('')}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
