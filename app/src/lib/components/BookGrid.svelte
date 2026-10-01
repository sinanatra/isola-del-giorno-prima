<script>
  let { books = [], selectedId = null, onselect } = $props();

  // Tronca il testo a `lines` righe con "…". Serve al posto di line-clamp,
  // che ignora i float usati per la piramide rovesciata.
  function clamp(node, { text, lines }) {
    const fits = (max) => node.offsetHeight <= max;
    const fit = () => {
      node.textContent = text;
      const max = parseFloat(getComputedStyle(node).lineHeight) * lines + 1;
      if (fits(max)) return;
      const words = text.split(" ");
      let lo = 0;
      let hi = words.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        node.textContent = words.slice(0, mid).join(" ") + "…";
        if (fits(max)) lo = mid;
        else hi = mid - 1;
      }
      node.textContent =
        words.slice(0, lo).join(" ").replace(/[\s,.;:…]+$/, "") + "…";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(node.parentElement);
    document.fonts?.ready.then(fit);
    return {
      update(params) {
        ({ text, lines } = params);
        fit();
      },
      destroy: () => observer.disconnect(),
    };
  }
</script>

<nav
  class="grid h-full auto-rows-fr grid-cols-4 gap-x-[1.5vh] gap-y-[1vh] md:grid-cols-6"
>
  {#each books as book (book.id)}
    {@const isSelected = book.id === selectedId}
    <button
      class="group flex min-h-0 min-w-0 cursor-pointer flex-col items-center text-center"
      onclick={() => onselect?.(book)}
      title="{book.author}, {book.title}, {book.year}"
      aria-label={book.title}
      aria-current={isSelected}
    >
      <span
        class="flex min-h-0 w-full flex-1 items-end justify-center @container-size"
      >
        <span
          class="flex aspect-[1.36] w-[min(100cqw,100cqh*1.36)] transition-[filter] duration-300 {isSelected
            ? ''
            : 'grayscale group-hover:grayscale-0'}"
        >
          {#each book.thumbs.slice(0, 2) as src}
            <img
              {src}
              alt=""
              loading="lazy"
              class="block h-full w-1/2 object-fill"
            />
          {/each}
        </span>
      </span>
      <span
        class="mt-[0.6vh] h-lh w-full shrink-0 overflow-hidden text-[max(8px,0.6vh)] md:h-[6lh] leading-tight text-[#2a2a2a]"
      >
        <span
          aria-hidden="true"
          class="float-left hidden h-full w-1/2 [shape-outside:polygon(0_0,70%_100%,0_100%)] md:block"
        ></span>
        <span
          aria-hidden="true"
          class="float-right hidden h-full w-1/2 [shape-outside:polygon(100%_0,100%_100%,30%_100%)] md:block"
        ></span>
        <span
          class="block font-semibold md:overflow-visible md:whitespace-normal"
          >{book.author}</span
        >
        <span
          class="hidden italic hyphens-auto md:block"
          use:clamp={{ text: book.title, lines: 3 }}
        ></span>
        <span class="hidden tabular-nums md:block">{book.year}</span>
      </span>
    </button>
  {/each}
</nav>
