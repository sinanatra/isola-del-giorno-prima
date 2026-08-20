<script>
  import { fade } from "svelte/transition";

  let {
    show = false,
    text = "",
    path = "M 1200 190 C 1230 250, 1180 340, 1160 430",
    textPath = "M 1216 193 C 1246 253, 1196 343, 1176 433",
    fontSize = 36,
  } = $props();
</script>

{#if show}
  <svg
    viewBox="0 50 1220 950"
    preserveAspectRatio="xMidYMid meet"
    class="absolute inset-0 w-full h-full z-5 pointer-events-none"
    transition:fade={{ duration: 400 }}
  >
    <defs>
      <marker
        id="cordHintArrow"
        markerWidth="8"
        markerHeight="8"
        refX="5"
        refY="4"
        orient="auto"
      >
        <path d="M0,0 L8,4 L0,8 Z" fill="blue" />
      </marker>
    </defs>
    <path
      id="cordHintPath"
      d={path}
      fill="none"
      stroke="blue"
      stroke-width="4"
      marker-end="url(#cordHintArrow)"
    />
    <path id="cordHintTextPath" d={textPath} fill="none" stroke="none" />
    <text font-family="Freight, serif" font-style="italic" font-size={fontSize} fill="blue">
      <textPath href="#cordHintTextPath" startOffset="10%">{text}</textPath>
    </text>
  </svg>
{/if}
