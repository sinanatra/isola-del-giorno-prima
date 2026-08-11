<script>
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  let { quotes = null, hidden = false } = $props();

  // Phrases from the source text carry a leading "12. Word " citation marker; strip it for display.
  const stripCitation = (text) => text.replace(/^\d+\.\s+\S+\s+/, "");

  // Splits text into plain/highlighted segments wherever `word` occurs, so the
  // found word can be marked in yellow without resorting to raw HTML.
  function highlightSegments(text, word) {
    if (!text || !word) return [{ text, hl: false }];
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text
      .split(new RegExp(`(${escaped})`, "gi"))
      .filter((part) => part !== "")
      .map((part) => ({ text: part, hl: part.toLowerCase() === word.toLowerCase() }));
  }
</script>

{#if quotes && !hidden}
<div transition:fly={{ y: 220, duration: 450, easing: cubicOut, opacity: 1 }}>
  <div class="flex px-4 py-4 gap-4">
    {#each quotes as q}
      <div class="flex-1 px-4 py-4 bg-white shadow">
        {#if q.oggetto}
          <div class="font-bold text-2xl text-black mb-1.5" >
            {q.oggetto}
          </div>
          <div class="text-base text-black" >
            {#if q.phrase}
              {#each highlightSegments(stripCitation(q.phrase.testo), q.oggetto) as seg}
                {#if seg.hl}<mark class="bg-yellow-100">{seg.text}</mark>{:else}{seg.text}{/if}
              {/each}
            {:else}
              —
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
{/if}
