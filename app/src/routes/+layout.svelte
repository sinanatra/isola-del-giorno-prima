<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { config } from '$lib/config.js';
  import { startKiosk } from '$lib/kiosk.js';
  import DebugOverlay from '$lib/components/DebugOverlay.svelte';
  let { children } = $props();

  onMount(() => {
    startKiosk();
    if (!dev && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  });
</script>

{@render children()}

{#if config.debug}
  <DebugOverlay />
{/if}
