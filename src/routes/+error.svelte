<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · Unlicensed Thought</title><meta name="robots" content="noindex" /></svelte:head>

<section class="wrap">
  <p class="label">{page.status}</p>
  <h1>{page.status === 404 ? 'Nothing at this address.' : 'Something broke.'}</h1>
  <p>Try the <a href="/">front page</a> or the <a href="/writing/">writing index</a>.</p>
</section>
