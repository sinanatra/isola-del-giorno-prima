<script>
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import translations from "./translations.json";

  let { quotes = null, hidden = false, lang = "it", compact = false } = $props();

  const stripCitation = (text) => text.replace(/^\d+\.\s+\S+\s+/, "");

  function highlightSegments(text, word) {
    if (!text || !word) return [{ text, hl: false }];
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Solo parole intere: niente lettere prima/dopo (\b non gestisce le accentate)
    return text
      .split(new RegExp(`(?<![\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, "giu"))
      .filter((part) => part !== "")
      .map((part) => ({
        text: part,
        hl: part.toLowerCase() === word.toLowerCase(),
      }));
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function segmentsFor(text, pattern) {
    const whole = new RegExp(`^(?:${pattern})$`, "i");
    return text
      .split(new RegExp(`(${pattern})`, "gi"))
      .filter((part) => part !== "")
      .map((part) => ({ text: part, hl: whole.test(part) }));
  }

  function highlightAny(text, candidates) {
    if (!text) return [{ text, hl: false }];
    const terms = [
      ...new Set(
        candidates
          .filter(Boolean)
          .map((c) => c.replace(/^(the|a|an|to)\s+/i, "").trim())
          .filter((c) => c.length > 1),
      ),
    ];
    const exact = terms.map((t) => `\\b${escapeRe(t)}\\b`);
    const loose = terms
      .filter((t) => !/\s/.test(t) && t.length >= 4)
      .map(
        (t) =>
          `\\b${escapeRe(t.toLowerCase().replace(/(ies|es|s|e|y)$/, ""))}\\w{0,4}\\b`,
      );
    for (const pattern of [...exact, ...loose]) {
      if (new RegExp(pattern, "i").test(text))
        return segmentsFor(text, pattern);
    }
    return [{ text, hl: false }];
  }

  const englishTerms = (word) =>
    word ? (translations.terms[word] ?? [word]) : [];
  const translate = (text) => translations.texts[text] ?? text;
</script>

{#if quotes && !hidden}
  <div transition:fly={{ y: 400, duration: 450, easing: cubicOut, opacity: 1 }}>
    <div
      class={compact
        ? "flex flex-col px-3 pt-3 pb-6 gap-3"
        : "flex px-4 py-4 gap-4 landscape:py-3 landscape:gap-3"}
    >
      {#each quotes as q}
        <div
          class="bg-white shadow {compact
            ? 'px-4 py-4'
            : 'flex-1 min-h-65 px-6 py-8 landscape:min-h-52 landscape:px-5 landscape:py-6'}"
        >
          {#if q.oggetto}
            <div
              class="font-bold text-black tracking-wide {compact
                ? 'text-2xl mb-2'
                : 'text-4xl mb-3 landscape:text-3xl landscape:mb-2'}"
            >
              {#if lang === "en" && q.phrase?.oggetto_en}
                {q.phrase.oggetto_en}
              {:else if lang === "en"}
                {translate(q.oggetto)}
              {:else}
                {q.oggetto}
              {/if}
            </div>
            <div
              class="text-black {compact
                ? 'text-base'
                : 'text-2xl landscape:text-xl'}"
            >
              {#if q.phrase}
                {#if lang === "en" && q.phrase.oggetto_en && q.phrase.testo_en}
                  {#each highlightSegments(q.phrase.testo_en, q.phrase.oggetto_en) as seg}
                    {#if seg.hl}<mark class="hl">{seg.text}</mark
                      >{:else}{seg.text}{/if}
                  {/each}
                {:else if lang === "en"}
                  {#each highlightAny(q.phrase.testo_en ?? translate(stripCitation(q.phrase.testo)), englishTerms(q.oggetto)) as seg}
                    {#if seg.hl}<mark class="hl">{seg.text}</mark
                      >{:else}{seg.text}{/if}
                  {/each}
                {:else}
                  {#each highlightSegments(stripCitation(q.phrase.testo), q.oggetto) as seg}
                    {#if seg.hl}<mark class="hl">{seg.text}</mark
                      >{:else}{seg.text}{/if}
                  {/each}
                {/if}
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

<style>
  mark.hl {
    background: #fde047;
    color: inherit;
    padding: 0 0.1em;
  }
</style>
