<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { projects, proof } from '$lib/work';
  import { posts } from '$lib/content';
  const recent = posts().slice(0, 3);
</script>

<Seo />

<section class="wrap hero">
  <p class="label">AI evaluation · model routing · OT/SCADA</p>
  <h1>I build the layer that makes AI dependable in real operations.</h1>
  <p class="lede">
    I came to it from the field side: industrial and operational technology, where a system that fails quietly is the
    expensive kind. Now I build the routing and evaluation infrastructure that keeps AI systems honest.
  </p>
  <ul class="proof" aria-label="Shipped work">
    {#each proof as p}
      <li><strong>{p.figure}</strong> <span>{p.text}</span></li>
    {/each}
  </ul>
</section>

<section class="wrap">
  <h2>Open source</h2>
  <div class="cards">
    {#each projects as p}
      <article class="card">
        <h3><a href={p.href}>{p.name}</a></h3>
        <p>{p.what}</p>
        <p class="meta">{p.stack}</p>
      </article>
    {/each}
  </div>
  <p><a href="/portfolio/">The full portfolio →</a></p>
</section>

<section class="wrap">
  <h2>Writing</h2>
  {#if recent.length}
    <ul class="posts">
      {#each recent as post}
        <li><a href="/writing/{post.slug}/">{post.title}</a> <span class="meta">{post.minutes} min</span></li>
      {/each}
    </ul>
    <p><a href="/writing/">All writing →</a></p>
  {:else}
    <p class="meta">The first write-ups are on the way. <a href="/rss.xml">Subscribe by RSS</a> to get them.</p>
  {/if}
</section>

<style>
  .hero { padding-top: var(--ut-space-6); }
  .lede { font-size: 1.15rem; color: var(--ut-text-secondary); max-width: 36rem; }
  .proof { list-style: none; padding: 0; margin: var(--ut-space-6) 0 0; display: grid; gap: var(--ut-space-3); }
  .proof li { display: grid; grid-template-columns: 7.5rem 1fr; gap: var(--ut-space-3); align-items: baseline; border-top: 1px solid var(--ut-border); padding-top: var(--ut-space-3); }
  .proof strong { font-family: var(--ut-font-display); font-weight: 400; font-size: 1.35rem; color: var(--ut-accent); }
  .cards { display: grid; gap: var(--ut-space-4); grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); margin-bottom: var(--ut-space-4); }
  .card { background: var(--ut-surface-card); border: 1px solid var(--ut-border); border-radius: var(--ut-radius-md); padding: var(--ut-space-4) var(--ut-space-5); }
  .card p:last-child { margin: 0; }
  .posts { padding-left: 1.1rem; }
  .posts li { margin-bottom: var(--ut-space-2); }
  @media (max-width: 30rem) { .proof li { grid-template-columns: 1fr; gap: 0; } }
</style>
