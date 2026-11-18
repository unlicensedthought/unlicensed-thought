<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { posts } from '$lib/content';
  const all = posts();
</script>

<Seo title="Writing" description="Write-ups on AI evaluation, model routing and agent infrastructure: what was built, what broke, and the numbers." />

<section class="wrap">
  <h1>Writing</h1>
  <p class="lede">What I built, what broke, and the numbers. New pieces also go out by <a href="/rss.xml">RSS</a>.</p>
  {#if all.length}
    <ol class="list">
      {#each all as post}
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
  .list { list-style: none; padding: 0; }
  .list li { border-top: 1px solid var(--ut-border); padding-block: var(--ut-space-4); }
  .t { font-family: var(--ut-font-display); font-size: 1.3rem; }
  .list p { margin: var(--ut-space-1) 0 0; }
</style>
