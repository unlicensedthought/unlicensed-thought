<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { projects } from '$lib/work';
</script>

<Seo title="Work" description="Open-source routing and evaluation tools: what each does, the failure it addresses, and how it is evaluated." />

<section class="wrap">
  <h1>Work</h1>
  <p class="lede">Each project answers three questions: what it does, which failure it exists to stop, and how you would know it works.</p>
  {#each projects as p}
    <article class="project">
      <h2><a href={p.href}>{p.name}</a></h2>
      <p class="meta">{p.stack}</p>
      <dl>
        <dt>What it does</dt><dd>{p.what}</dd>
        <dt>The failure it stops</dt><dd>{p.failure}</dd>
        <dt>How it is evaluated</dt><dd>{p.evaluated}</dd>
      </dl>
    </article>
  {/each}
</section>

<style>
  .lede { color: var(--ut-text-secondary); }
  .project { border-top: 1px solid var(--ut-border); padding-top: var(--ut-space-2); margin-top: var(--ut-space-6); }
  dl { margin: 0; }
  dt { color: var(--ut-text-label); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; margin-top: var(--ut-space-4); }
  dd { margin: var(--ut-space-1) 0 0; }
</style>
