<script lang="ts">
  import Seo from '$lib/Seo.svelte';
  import { site } from '$lib/site';
</script>

<Seo title="About" description="From industrial operations to AI evaluation infrastructure." />

<section class="wrap">
  <h1>About</h1>
  <p>I'm {site.author}. My background is industrial and operational technology: weighing systems across a national network, dealer-facing applications at John Deere, and compliance-controlled computing for field technicians running SCADA and Rockwell automation software at Chevron.</p>
  <p>That work taught me what a dependable system looks like from the plant floor: it says when it can't do the job, and it never reports a quiet failure as success. I now apply that to AI. I build cost-aware model routing that fails over when a provider degrades, golden-set evaluation that refuses a release when quality regresses, and multi-agent tooling with merge queues and gates, so automated work stays reviewable.</p>
  <p><em>Unlicensed Thought</em> is where I write that work up: what I built, what broke, and the numbers. It's personal writing, not an offer of engineering services.</p>
  <h2>Elsewhere</h2>
  <p><a href={site.links.github} rel="me">GitHub</a> · <a href={site.links.linkedin} rel="me">LinkedIn</a></p>
</section>
