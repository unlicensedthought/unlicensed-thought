<script lang="ts">
  // Shown once the reader has scrolled past 10% of the page's full height.
  const THRESHOLD = 0.1;
  let visible = $state(false);

  function update() {
    visible = window.scrollY > document.documentElement.scrollHeight * THRESHOLD;
  }

  $effect(() => {
    update();
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  });

  function toTop() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const main = document.getElementById('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
      main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
    }
  }
</script>

<button
  type="button"
  class="to-top"
  class:visible
  aria-label="Back to top"
  title="Back to top"
  tabindex={visible ? 0 : -1}
  aria-hidden={!visible}
  onclick={toTop}
>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</button>

<style>
  .to-top {
    position: fixed;
    right: max(var(--ut-space-4), env(safe-area-inset-right));
    bottom: max(var(--ut-space-4), env(safe-area-inset-bottom));
    z-index: 6;
    width: var(--ut-target);
    height: var(--ut-target);
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--ut-border);
    border-radius: var(--ut-radius-pill);
    background: var(--ut-surface-raised);
    color: var(--ut-accent);
    box-shadow: var(--ut-shadow);
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transform: translateY(0.5rem);
    transition: opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms;
  }
  .to-top.visible {
    opacity: 1;
    visibility: visible;
    transform: none;
    transition: opacity 160ms ease, transform 160ms ease, visibility 0s;
  }
  .to-top:hover { color: var(--ut-accent-bright); background: var(--ut-accent-soft); }
  .to-top:focus-visible { outline: var(--ut-focus-w) solid var(--ut-focus); outline-offset: var(--ut-focus-offset); }
  @media (prefers-reduced-motion: reduce) {
    .to-top, .to-top.visible { transition: none; transform: none; }
  }
  @media print { .to-top { display: none; } }
</style>
