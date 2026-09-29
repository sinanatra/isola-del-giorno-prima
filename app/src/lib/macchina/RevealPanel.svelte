<script>
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  let { quotes = null, hidden = false, lang = "it" } = $props();

  const stripCitation = (text) => text.replace(/^\d+\.\s+\S+\s+/, "");

  function highlightSegments(text, word) {
    if (!text || !word) return [{ text, hl: false }];
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text
      .split(new RegExp(`(${escaped})`, "gi"))
      .filter((part) => part !== "")
      .map((part) => ({ text: part, hl: part.toLowerCase() === word.toLowerCase() }));
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
      .map((t) => `\\b${escapeRe(t.toLowerCase().replace(/(ies|es|s|e|y)$/, ""))}\\w{0,4}\\b`);
    for (const pattern of [...exact, ...loose]) {
      if (new RegExp(pattern, "i").test(text)) return segmentsFor(text, pattern);
    }
    return [{ text, hl: false }];
  }

  const termsCache = new Map();
  async function englishTerms(word) {
    if (!word) return [];
    if (termsCache.has(word)) return termsCache.get(word);
    let terms = [word];
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=en&dt=t&dt=bd&q=${encodeURIComponent(word)}`;
      const data = await (await fetch(url)).json();
      const main = (data[0] ?? []).map((seg) => seg[0]).join("");
      const alts = (data[1] ?? []).flatMap((entry) => entry[1] ?? []);
      terms = [main, ...alts, word];
    } catch {}
    termsCache.set(word, terms);
    return terms;
  }

  const translationCache = new Map();
  async function translate(text) {
    if (!text || lang === "it") return text;
    const key = `en::${text}`;
    if (translationCache.has(key)) return translationCache.get(key);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      const translated = data[0].map((seg) => seg[0]).join("");
      translationCache.set(key, translated);
      return translated;
    } catch {
      return text;
    }
  }
</script>

{#if quotes && !hidden}
<div transition:fly={{ y: 220, duration: 450, easing: cubicOut, opacity: 1 }}>
  <div class="flex px-4 py-4 gap-4">
    {#each quotes as q}
      <div class="flex-1 px-4 py-4 bg-white shadow">
        {#if q.oggetto}
          <div class="font-bold text-2xl text-black mb-1.5">
            {#if lang === "en"}
              {#await translate(q.oggetto)}
                {q.oggetto}
              {:then translated}
                {translated}
              {/await}
            {:else}
              {q.oggetto}
            {/if}
          </div>
          <div class="text-base text-black">
            {#if q.phrase}
              {#if lang === "en"}
                {#await englishTerms(q.oggetto)}
                  {q.phrase.testo_en ?? stripCitation(q.phrase.testo)}
                {:then terms}
                  {#if q.phrase.testo_en}
                    {#each highlightAny(q.phrase.testo_en, terms) as seg}
                      {#if seg.hl}<mark class="bg-yellow-100">{seg.text}</mark>{:else}{seg.text}{/if}
                    {/each}
                  {:else}
                    {#await translate(stripCitation(q.phrase.testo))}
                      {stripCitation(q.phrase.testo)}
                    {:then translated}
                      {#each highlightAny(translated, terms) as seg}
                        {#if seg.hl}<mark class="bg-yellow-100">{seg.text}</mark>{:else}{seg.text}{/if}
                      {/each}
                    {/await}
                  {/if}
                {/await}
              {:else}
                {#each highlightSegments(stripCitation(q.phrase.testo), q.oggetto) as seg}
                  {#if seg.hl}<mark class="bg-yellow-100">{seg.text}</mark>{:else}{seg.text}{/if}
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
