<script>
  import { onMount } from "svelte";
  import { config } from "$lib/config.js";
  import { debugStats } from "$lib/debugStats.js";
  import { idleFor } from "$lib/activity.js";

  const PERIOD_MS = 500;
  let rows = $state([]);

  onMount(() => {
    let prev = { ...debugStats };
    let prevT = performance.now();
    let sw = "—";
    const readSw = () =>
      (sw = !("serviceWorker" in navigator)
        ? "non supportato"
        : navigator.serviceWorker.controller
          ? "attivo"
          : "assente");
    readSw();

    const id = setInterval(() => {
      const now = performance.now();
      const k = 1000 / (now - prevT);
      const cur = { ...debugStats };
      const rate = (key) => Math.round((cur[key] - prev[key]) * k);
      const mem = performance.memory;
      readSw();
      rows = [
        ["stato", cur.state + (config.kiosk ? " · kiosk" : "")],
        ["fps loop", rate("frames")],
        ["fps corda", rate("idleFrames")],
        ["ridisegni/s", rate("draws")],
        ["passi fisica/s", rate("steps")],
        ["corpi", cur.bodies],
        ["corpi svegli", cur.awake],
        ["pioggia", cur.raining ? "sì" : "no"],
        ["macchina", cur.machine],
        ["dpr canvas", `${cur.dpr} (max ${config.maxDpr})`],
        ["ultimo input", `${Math.round(idleFor() / 1000)} s fa`],
        [
          "heap",
          mem
            ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} / ${(mem.totalJSHeapSize / 1048576).toFixed(1)} MB`
            : "n/d",
        ],
        ["rete", navigator.onLine ? "online" : "offline"],
        ["service worker", sw],
      ];
      prev = cur;
      prevT = now;
    }, PERIOD_MS);
    return () => clearInterval(id);
  });
</script>

<div class="debug">
  {#each rows as [k, v]}
    <span>{k}</span><b>{v}</b>
  {/each}
</div>

<style>
  .debug {
    position: fixed;
    left: 8px;
    bottom: 8px;
    z-index: 9999;
    display: grid;
    grid-template-columns: auto auto;
    gap: 1px 10px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.8);
    color: #9f9;
    font: 12px/1.3 ui-monospace, Menlo, monospace;
    pointer-events: none;
  }
  b {
    font-weight: normal;
    color: #fff;
    text-align: right;
  }
</style>
