<script>
  import { onDestroy } from 'svelte';
  import { COLOR } from '$lib/macchina/constants.js';

  let { onCordPull, onCordRelease } = $props();

  const W        = 56;
  const H        = 360;
  const CX       = W / 2;
  const ANCHOR_Y = 18;
  const REST_Y   = 96;
  const MAX_PULL = 220;

  let handleY = $state(REST_Y);
  let dragging = $state(false);
  let startClientY = 0;
  let startHandleY = REST_Y;
  let lastClientY  = 0;
  let lastTs       = 0;
  let velPx        = 0;
  let springRaf    = 0;
  let svgEl;

  function pxToSvg(px) {
    if (!svgEl) return px;
    return px * H / svgEl.getBoundingClientRect().height;
  }

  function onDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimationFrame(springRaf);
    dragging     = true;
    startClientY = e.clientY;
    startHandleY = handleY;
    lastClientY  = e.clientY;
    lastTs       = e.timeStamp;
    velPx        = 0;
    onCordPull?.({ velocity: 0 });
  }

  function onMove(e) {
    if (!dragging) return;
    const dt = Math.max((e.timeStamp - lastTs) / 1000, 0.001);
    velPx       = (e.clientY - lastClientY) / dt;
    lastClientY = e.clientY;
    lastTs      = e.timeStamp;
    const totalDy = pxToSvg(e.clientY - startClientY);
    handleY = Math.max(REST_Y, Math.min(REST_Y + MAX_PULL, startHandleY + totalDy));
    onCordPull?.({ velocity: Math.max(0, velPx) });
  }

  function springTo(target) {
    if (Math.abs(handleY - target) < 0.5) { handleY = target; return; }
    handleY += (target - handleY) * 0.16;
    springRaf = requestAnimationFrame(() => springTo(target));
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    onCordRelease?.({ velocity: Math.max(0, velPx) });
    springRaf = requestAnimationFrame(() => springTo(REST_Y));
  }

  onDestroy(() => cancelAnimationFrame(springRaf));
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<svg
  bind:this={svgEl}
  viewBox="0 0 {W} {H}"
  style="width:{W}px; height:auto; display:block; overflow:visible;"
>
  <!-- Mounting hook -->
  <path d="M{CX-9},{ANCHOR_Y-2} Q{CX},{ANCHOR_Y-12} {CX+9},{ANCHOR_Y-2}"
    fill="none" stroke={COLOR} stroke-width="2"/>
  <circle cx={CX} cy={ANCHOR_Y} r="3.5" fill="white" stroke={COLOR} stroke-width="1.5"/>

  <!-- Cord -->
  <line x1={CX} y1={ANCHOR_Y+3} x2={CX} y2={handleY-17}
    stroke={COLOR} stroke-width="1.5"/>

  <!-- Draggable handle -->
  <g
    role="button"
    style="cursor:{dragging ? 'grabbing' : 'grab'}"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
  >
    <!-- Tassle neck -->
    <line x1={CX} y1={handleY-17} x2={CX} y2={handleY-10}
      stroke={COLOR} stroke-width="1.5"/>
    <!-- Outer oval -->
    <ellipse cx={CX} cy={handleY+2} rx="10" ry="17"
      fill="white" stroke={COLOR} stroke-width="2"/>
    <!-- Inner ring -->
    <ellipse cx={CX} cy={handleY+2} rx="5" ry="9"
      fill="white" stroke={COLOR} stroke-width="1.5"/>
  </g>
</svg>
