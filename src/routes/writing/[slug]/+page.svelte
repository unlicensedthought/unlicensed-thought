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
  {#if post.updates.length}
    <section class="updates" aria-labelledby="updates">
      <h2 id="updates">Updates</h2>
      <ul>
        {#each post.updates as u}
          <li><time datetime={u.date}>{u.date}</time> {@html u.html}</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if post.open.length}
    <section class="open" aria-labelledby="open">
      <h2 id="open">Still open</h2>
      <p class="meta">What I said this doesn't do yet and mean to fix or measure. Each one moves to Updates when it's done.</p>
      <ul>
        {#each post.open as o}
          <li>{o}</li>
        {/each}
      </ul>
    </section>
  {/if}
</article>

<style>
  .prose { margin-top: var(--ut-space-6); }
  .updates, .open { margin-top: var(--ut-space-6); padding: var(--ut-space-4); border: 1px solid var(--ut-border); border-radius: 6px; }
  .updates h2, .open h2 { margin-top: 0; font-size: 1.1rem; }
  .updates ul, .open ul { margin: 0; padding-left: var(--ut-space-4); }
  .updates li, .open li { margin-bottom: var(--ut-space-2); }
  .updates time { font-weight: 600; margin-right: var(--ut-space-2); }
  .prose :global(img) { max-width: 100%; height: auto; }
  .prose :global(blockquote) { margin: 0 0 var(--ut-space-4); padding-left: var(--ut-space-4); border-left: 2px solid var(--ut-accent); color: var(--ut-text-secondary); }
</style>
