<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { posts, heldBack } from '$lib/content';
  import { resolve } from '$lib/start';
  const all = posts();
  const topics = resolve(all, heldBack()).map((g) => ({ short: g.short, slugs: new Set(g.entries.map((e) => e.slug)) }));
  let topic = $state<string | null>(null);
  let newestFirst = $state(true);
  const shown = $derived.by(() => {
    const t = topics.find((x) => x.short === topic);
    const list = t ? all.filter((p) => t.slugs.has(p.slug)) : all;
    return newestFirst ? list : [...list].reverse();
  });
</script>

<Seo title="Writing" description="Write-ups on AI evaluation, model routing and agent infrastructure: what was built, what broke, and the numbers." />

<section class="wrap">
  <h1>Writing</h1>
  <p class="lede">What I built, what broke, and the numbers, dated by when I found it. New pieces also go out by <a href="/rss.xml">RSS</a>. New here? <a href="/start/">Start here</a>.</p>
  {#if all.length}
    <div class="controls">
      <div class="chips" role="group" aria-label="Topic">
        <button type="button" aria-pressed={topic === null} onclick={() => (topic = null)}>All</button>
        {#each topics as t}
          <button type="button" aria-pressed={topic === t.short} onclick={() => (topic = t.short)}>{t.short}</button>
        {/each}
      </div>
      <button type="button" class="order" onclick={() => (newestFirst = !newestFirst)}>{newestFirst ? 'Newest first' : 'Oldest first'}</button>
    </div>
    <p class="meta" aria-live="polite">{shown.length} of {all.length}</p>
    <ol class="list">
      {#each shown as post (post.slug)}
        <li>
          <a class="t" href="/writing/{post.slug}/">{post.title}</a>
          <p>{post.summary}</p>
          <p class="meta"><time datetime={post.date}>{post.date}</time> · {post.minutes} min read{#if post.draft} · <strong>draft</strong>{/if}</p>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="meta">Nothing published yet. The first write-ups are on the way.</p>
  {/if}
</section>

<style>
  .lede { color: var(--ut-text-secondary); }
  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ut-space-3); margin-top: var(--ut-space-5); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--ut-space-2); }
  .controls button { font: inherit; font-size: 0.9rem; color: var(--ut-text-secondary); background: none; border: 1px solid var(--ut-border); border-radius: 999px; padding: 0.3rem 0.85rem; min-height: var(--ut-target); cursor: pointer; }
  .controls button:hover { color: var(--ut-text-body); background: var(--ut-accent-soft); }
  .controls button:focus-visible { outline: 2px solid var(--ut-accent); outline-offset: 2px; }
  .chips button[aria-pressed='true'] { color: var(--ut-accent); border-color: var(--ut-accent); }
  .list { list-style: none; padding: 0; }
  .list li { border-top: 1px solid var(--ut-border); padding-block: var(--ut-space-4); }
  .t { font-family: var(--ut-font-display); font-size: 1.3rem; }
  .list p { margin: var(--ut-space-1) 0 0; }
</style>
