# unlicensed-thought

Front page and writing for unlicensedthought.com (crow-pro lane, real name).

- SvelteKit + Svelte 5, every route prerendered at build time, then a client-routed SPA with view transitions.
- Theme: `piggy:phosphene` compiled from `tokens/phosphene.tokens.json`, a vendored subset of the piggy token set (`PIGGY_TOKENS_UPSTREAM=<file> npm run tokens -- --check` proves parity).
- Writing: `src/content/writing/<slug>.md` with `title`, `summary`, `date` (YYYY-MM-DD), optional `updated`, `tags`, `draft`. Drafts show in `npm run dev` only.
- Logo: 1:1 stand-ins (`static/logo-here.svg`, `favicon.svg`, `apple-touch-icon.png`, `src/lib/LogoHere.svelte`, the block in `og.png`). Replace them together.
- `scripts/verify.sh` is the land gate; `scripts/check-build.mjs` fails a build missing canonical/OG tags, shipping a draft, or losing the 1:1 mark.
- Deploy: Cloudflare Workers static assets (`wrangler.jsonc`), custom domain unlicensedthought.com.
