<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { posts, heldBack } from '$lib/content';
  import { resolve } from '$lib/start';
  const groups = resolve(posts(), heldBack());
</script>

<Seo title="Start here" description="The write-ups in reading order, grouped by the problem each one solves, with one line on what each proves." />

<section class="wrap">
  <h1>Start here</h1>
  <p class="lede">I run a lot of AI agents across a few machines, mostly by myself. These write-ups are what I learned doing it, grouped by the problem each one solves. Every one comes with numbers or a check you can run.</p>
  {#each groups as g}
    <h2>{g.title}</h2>
    <p class="why">{g.why}</p>
    <ol class="list">
      {#each g.entries as e}
        <li><a class="t" href="/writing/{e.slug}/">{e.post.title}</a><p>{e.proves}</p></li>
      {/each}
    </ol>
  {/each}
</section>

<style>
  .lede, .why { color: var(--ut-text-secondary); }
  .list { list-style: none; padding: 0; }
  .list li { border-top: 1px solid var(--ut-border); padding-block: var(--ut-space-3); }
  .t { font-family: var(--ut-font-display); font-size: 1.15rem; }
  .list p { margin: var(--ut-space-1) 0 0; }
</style>
