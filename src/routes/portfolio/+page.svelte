<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { headline, expertise, glance, capabilities, cases, openSource, supporting, bridge } from '$lib/portfolio';
  import { posts } from '$lib/content';
  const titles = new Map(posts().map((p) => [p.slug, p.title]));
  for (const o of openSource) {
    if (!titles.has(o.post)) throw new Error(`open-source list links ${o.repo} to missing post "${o.post}"`);
  }
</script>

<Seo
  title="Portfolio"
  description="LLM evaluation and cost-aware routing tools, and the operations data work behind them: problem, role, results and limits for each."
/>

<section class="wrap hero">
  <p class="label">{headline.label}</p>
  <h1>{headline.title}</h1>
  <p class="lede">{headline.lede}</p>
  <ul class="expertise" aria-label="Areas of expertise">
    {#each expertise as e}<li>{e}</li>{/each}
  </ul>
  <ul class="glance" aria-label="At a glance">
    {#each glance as g}
      <li><strong>{g.figure}</strong> <span>{g.text}</span></li>
    {/each}
  </ul>
  <nav class="toc" aria-label="Case studies">
    {#each cases as c}
      <a href="#{c.id}">{c.name}</a>
    {/each}
    <a href="#open-source">More open source</a>
    <a href="#capabilities">Capabilities</a>
    <a href="#before">Before this</a>
  </nav>
</section>

<section class="wrap" id="capabilities">
  <h2>Capabilities</h2>
  <div class="caps">
    {#each capabilities as k}
      <div class="cap">
        <h3>{k.area}</h3>
        <p class="meta">{k.where}</p>
        <ul>{#each k.items as i}<li>{i}</li>{/each}</ul>
      </div>
    {/each}
  </div>
</section>

{#each cases as c}
  <article class="wrap case" id={c.id}>
    <p class="label">{c.kicker}</p>
    <h2>{c.name}</h2>
    <p class="case-headline">{c.headline}</p>

    <ul class="results" aria-label="Results">
      {#each c.results as r}
        <li><strong>{r.figure}</strong> <span>{r.text}</span></li>
      {/each}
    </ul>

    <dl>
      <dt>Problem</dt>
      <dd>{c.problem}</dd>
      <dt>My role</dt>
      <dd>{c.role}</dd>
      <dt>What I did</dt>
      <dd><ul>{#each c.actions as a}<li>{a}</li>{/each}</ul></dd>
      <dt>Constraints and limits</dt>
      <dd><ul>{#each c.constraints as k}<li>{k}</li>{/each}</ul></dd>
      {#if c.open?.length}
        <dt>Still open</dt>
        <dd><ul>{#each c.open as o}<li>{o}</li>{/each}</ul></dd>
      {/if}
    </dl>
    <p class="meta">
      {c.stack}{#if c.href} · <a href={c.href}>{c.linkLabel}</a>{/if}
    </p>
  </article>
{/each}

<section class="wrap" id="open-source">
  <h2>More open source</h2>
  <p class="meta">Smaller tools, each with a write-up of what it does and where it stops.</p>
  <ul class="oss">
    {#each openSource as o}
      <li>
        <a class="repo" href="https://github.com/unlicensedthought/{o.repo}">{o.repo}</a>
        <p>{o.what}</p>
        <p class="meta"><a href="/writing/{o.post}/">{titles.get(o.post)}</a></p>
      </li>
    {/each}
  </ul>
</section>

<section class="wrap bridge">
  <h2>Why operations, then AI</h2>
  <p>{bridge}</p>
</section>

<section class="wrap" id="before">
  <h2>Before this</h2>
  {#each supporting as s}
    <div class="support">
      <h3>{s.where} <span class="meta">{s.when}</span></h3>
      <ul>{#each s.points as p}<li>{p}</li>{/each}</ul>
    </div>
  {/each}
  <p>Write-ups of the open-source work are on the <a href="/writing/">Writing</a> page.</p>
</section>

<style>
  .hero { padding-top: var(--ut-space-6); }
  .lede { font-size: 1.15rem; color: var(--ut-text-secondary); max-width: 38rem; }
  .glance, .results { list-style: none; padding: 0; display: grid; gap: var(--ut-space-3); }
  .glance { margin: var(--ut-space-6) 0 0; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
  .glance li, .results li { border-top: 1px solid var(--ut-border); padding-top: var(--ut-space-3); }
  .glance strong, .results strong { display: block; font-family: var(--ut-font-display); font-weight: 400; font-size: 1.5rem; color: var(--ut-accent); }
  .glance span, .results span { color: var(--ut-text-secondary); }
  .expertise { list-style: none; padding: 0; margin: var(--ut-space-4) 0 0; display: flex; flex-wrap: wrap; gap: var(--ut-space-2); }
  .expertise li { border: 1px solid var(--ut-border); border-radius: 999px; padding: 0.2rem 0.75rem; font-size: 0.9rem; color: var(--ut-text-secondary); }
  .caps { display: grid; gap: var(--ut-space-4); grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); }
  .cap { background: var(--ut-surface-card); border: 1px solid var(--ut-border); border-radius: var(--ut-radius-md); padding: var(--ut-space-4) var(--ut-space-5); }
  .cap h3 { margin: 0; font-size: 1.05rem; }
  .cap .meta { margin: var(--ut-space-1) 0 var(--ut-space-2); }
  .cap ul { margin: 0; padding-left: 1.1rem; }
  .cap li { margin-bottom: var(--ut-space-1); }
  .toc { display: flex; flex-wrap: wrap; gap: var(--ut-space-2) var(--ut-space-4); margin-top: var(--ut-space-6); }
  .case { border-top: 1px solid var(--ut-border); margin-top: var(--ut-space-7, 3.5rem); padding-top: var(--ut-space-5); scroll-margin-top: var(--ut-space-5); }
  .case h2 { margin-top: var(--ut-space-1); }
  .case-headline { font-size: 1.15rem; max-width: 40rem; }
  .results { margin: var(--ut-space-4) 0; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); }
  dl { margin: 0; }
  dt { color: var(--ut-text-label); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; margin-top: var(--ut-space-4); }
  dd { margin: var(--ut-space-1) 0 0; }
  dd ul, .support ul { margin: 0; padding-left: 1.2rem; }
  dd li, .support li { margin-bottom: var(--ut-space-1); }
  #open-source { scroll-margin-top: var(--ut-space-5); }
  .oss { list-style: none; padding: 0; margin: var(--ut-space-4) 0 0; display: grid; gap: var(--ut-space-3) var(--ut-space-5); grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
  .oss li { border-top: 1px solid var(--ut-border); padding-top: var(--ut-space-3); }
  .oss .repo { font-family: var(--ut-font-display); font-size: 1.1rem; }
  .oss p { margin: var(--ut-space-1) 0 0; }
  .bridge p { max-width: 40rem; color: var(--ut-text-secondary); }
  .support { margin-top: var(--ut-space-4); }
  .support h3 { font-size: 1.05rem; margin-bottom: var(--ut-space-1); }
  .support h3 .meta { font-weight: 400; margin-left: var(--ut-space-2); }
</style>
