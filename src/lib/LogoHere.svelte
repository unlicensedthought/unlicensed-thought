<script lang="ts">
  // 1:1 stand-in for the mark until the real logo exists. Swap static/logo-here.svg and this component together.
  let { size = 32, label = 'Logo' }: { size?: number; label?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} class="logo-here">
  <rect x="1" y="1" width="62" height="62" rx="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4" />
  <text x="32" y="29" text-anchor="middle" font-size="11" font-family="var(--ut-font-mono)" fill="currentColor">LOGO</text>
  <text x="32" y="43" text-anchor="middle" font-size="11" font-family="var(--ut-font-mono)" fill="currentColor">HERE</text>
</svg>

<style>
  .logo-here { color: var(--ut-accent); flex: none; aspect-ratio: 1 / 1; }
</style>
