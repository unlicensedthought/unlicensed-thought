<script lang="ts">
  import { page } from '$app/state';
  import { site, abs } from '$lib/site';
  let { title, description = site.description, type = 'website' }: { title?: string; description?: string; type?: string } = $props();
  const full = $derived(title ? `${title} · ${site.name}` : `${site.name} · ${site.author}`);
  const url = $derived(abs(page.url.pathname));
</script>

<svelte:head>
  <title>{full}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <meta property="og:title" content={title ?? site.name} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:type" content={type} />
  <meta property="og:site_name" content={site.name} />
  <meta property="og:image" content={abs('/og.png')} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>
