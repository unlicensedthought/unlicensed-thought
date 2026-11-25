# Changelog

## Unreleased

- Scheduled releases: posts and updates written ahead go out on their `publish` or update date, at most one new post a week, released by a daily job that redeploys trunk's tip.
- Posts show what they still owe as "Still open", and dated "Updates" retire those items.
- Each post is dated by when its subject was found or first built, from the source repo history; the `written` field is gone.
- Writing page filters by the five Start here topics and sorts newest or oldest first.
- Portfolio lists the other public repos, each with its write-up.
- Home and portfolio lead with build achievements; career figures appear once, in their case studies.

## 0.1.0 - 2026-11-18

- Front page and writing for unlicensedthought.com: SvelteKit with Svelte 5, every route prerendered at build time.
- Writing pipeline from `src/content/writing/*.md` with RSS, sitemap and a post-build gate for canonical and OG tags, drafts and the 1:1 mark.
- Posts can carry a `written` field for the original date when the post says one, shown beside the publish date.
- Deploy to Cloudflare Workers static assets through `scripts/deploy-landed.sh`.
