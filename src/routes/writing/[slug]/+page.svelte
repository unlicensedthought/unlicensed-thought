<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const post = $derived(data.post);
</script>

<Seo title={post.title} description={post.summary} type="article" />

<article class="wrap">
  <p class="meta"><a href="/writing/">Writing</a></p>
  <h1>{post.title}</h1>
  <p class="meta">
    <time datetime={post.date}>{post.date}</time>{#if post.updated} · updated <time datetime={post.updated}>{post.updated}</time>{/if}
    · {post.minutes} min read{#if post.tags.length} · {post.tags.join(', ')}{/if}
  </p>
  <div class="prose">{@html post.html}</div>
</article>

<style>
  .prose { margin-top: var(--ut-space-6); }
  .prose :global(img) { max-width: 100%; height: auto; }
  .prose :global(blockquote) { margin: 0 0 var(--ut-space-4); padding-left: var(--ut-space-4); border-left: 2px solid var(--ut-accent); color: var(--ut-text-secondary); }
</style>
