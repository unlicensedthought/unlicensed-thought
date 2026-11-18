<script lang="ts">
  let { size = 40, label = 'Logo' }: { size?: number; label?: string } = $props();
</script>

<img src="/logo.svg" width={size} height={size} alt={label} class="logo" />

<style>
  .logo { flex: none; aspect-ratio: 1 / 1; display: block; }
</style>
