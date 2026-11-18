import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: '404.html', strict: true }),
    prerender: { handleHttpError: 'fail', handleMissingId: 'fail', handleUnseenRoutes: ({ routes }) => {
      // /writing/[slug] has no entries while every post is a draft; any other unseen route is a bug.
      const unexpected = routes.filter((r) => r !== '/writing/[slug]');
      if (unexpected.length) throw new Error(`prerender: routes never reached: ${unexpected.join(', ')}`);
    } },
    // Prerendered pages get a hashed CSP <meta>; _headers adds frame-ancestors and the rest.
    csp: { mode: 'hash', directives: { 'default-src': ['self'], 'script-src': ['self'], 'style-src': ['self', 'unsafe-inline'], 'img-src': ['self', 'data:'], 'font-src': ['self'], 'connect-src': ['self'], 'base-uri': ['self'], 'form-action': ['none'], 'object-src': ['none'] } }
  }
};
