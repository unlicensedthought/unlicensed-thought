# unlicensed-thought

Front page and writing for unlicensedthought.com (crow-pro lane, real name).

- SvelteKit + Svelte 5, every route prerendered at build time, then a client-routed SPA with view transitions.
- Theme: `piggy:phosphene` compiled from `tokens/phosphene.tokens.json`, a vendored subset of the piggy token set (`PIGGY_TOKENS_UPSTREAM=<file> npm run tokens -- --check` proves parity).
- Writing: `src/content/writing/<slug>.md` with `title`, `summary`, `date` (YYYY-MM-DD), optional `updated`, `tags`, `draft`. Drafts show in `npm run dev` only.
- Logo: the eye mark. `brand/eye.svg` is the square source; `static/logo.svg` (header), `static/favicon.svg`, `brand/og.svg` and `brand/avatar.svg` are built from it, and `bash scripts/brand.sh` renders `apple-touch-icon.png`, `og.png` and the 512 px GitHub avatar.
- `scripts/verify.sh` is the land gate; `scripts/check-build.mjs` fails a build missing canonical/OG tags, shipping a draft, or losing the 1:1 mark.
- Deploy: Cloudflare Workers static assets (`wrangler.jsonc`), custom domain unlicensedthought.com.

## Deploy

Every land on `hee-haw` runs `scripts/deploy-landed.sh <before> <sha>`. It builds that exact commit, runs `wrangler deploy`, and fails unless `https://unlicensedthought.com/` answers 200 and `/build.txt` names the landed sha. A land that is no longer trunk's tip is not deployed.
