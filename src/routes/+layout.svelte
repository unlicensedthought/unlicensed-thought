<script lang="ts">
  import '$lib/styles/tokens.css';
  import '$lib/styles/app.css';
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Logo from '$lib/Logo.svelte';
  import { nav, site } from '$lib/site';

  let { children } = $props();

  // Client-side navigation is the SPA path; the View Transitions API animates it where supported.
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  const current = (href: string) => page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(href));
</script>

<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wide bar">
    <a class="brand" href="/" aria-label="{site.name}, home">
      <Logo size={40} label="{site.name} logo" />
      <span>{site.name.split(' ').slice(0, -1).join(' ')} <span class="thought">{site.name.split(' ').at(-1)}</span></span>
    </a>
    <nav aria-label="Primary">
      {#each nav as item}
        <a href={item.href} aria-current={current(item.href) ? 'page' : undefined}>{item.label}</a>
      {/each}
    </nav>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<footer class="foot">
  <div class="wide row">
    <span class="meta">© {new Date().getFullYear()} {site.author}</span>
    <span class="links">
      <a href={site.links.github} rel="me">GitHub</a>
      <a href={site.links.linkedin} rel="me">LinkedIn</a>
      <a href="/rss.xml">RSS</a>
    </span>
  </div>
</footer>

<style>
  .top { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--ut-surface-bg) 90%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--ut-border); view-transition-name: header; }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: var(--ut-space-4); min-height: var(--ut-nav-h); }
  .brand { display: inline-flex; align-items: center; gap: var(--ut-space-3); color: var(--ut-text-body); text-decoration: none; font-family: var(--ut-font-display); font-size: 1.1rem; min-height: var(--ut-target); }
  nav { display: flex; gap: var(--ut-space-1); }
  nav a { color: var(--ut-text-secondary); text-decoration: none; padding: var(--ut-space-2) var(--ut-space-3); border-radius: var(--ut-radius-sm); min-height: var(--ut-target); display: inline-flex; align-items: center; }
  nav a:hover { color: var(--ut-text-body); background: var(--ut-accent-soft); }
  nav a[aria-current='page'] { color: var(--ut-accent); }
  main { padding-block: var(--ut-space-6) calc(var(--ut-space-6) * 2); }
  .foot { border-top: 1px solid var(--ut-border); padding-block: var(--ut-space-6); }
  .row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--ut-space-3); }
  .links { display: flex; gap: var(--ut-space-4); }
  @media (max-width: 30rem) { .brand span { display: none; } }
  .thought { color: var(--ut-accent); }
</style>
