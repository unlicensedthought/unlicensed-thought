import { posts } from '$lib/content';

export const prerender = true;

// What this build has released: the daily release job compares it with the live copy to see whether anything came due.
export function GET() {
  const lines = posts()
    .filter((p) => !p.draft)
    .flatMap((p) => [`post ${p.slug} ${p.released}`, ...p.updates.map((u) => `update ${p.slug} ${u.date}`)])
    .sort();
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
