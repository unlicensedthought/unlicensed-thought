# Changelog

## 0.1.0 - 2026-11-18

- Front page and writing for unlicensedthought.com: SvelteKit with Svelte 5, every route prerendered at build time.
- Writing pipeline from `src/content/writing/*.md` with RSS, sitemap and a post-build gate for canonical and OG tags, drafts and the 1:1 mark.
- Posts can carry a `written` field for the original date when the post says one, shown beside the publish date.
- Deploy to Cloudflare Workers static assets through `scripts/deploy-landed.sh`.
