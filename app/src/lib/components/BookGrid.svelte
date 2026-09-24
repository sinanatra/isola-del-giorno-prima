<script>
  let { books = [], selectedId = null, onselect } = $props();

  const GAP = 6;

  let width = $state(0);

  let ratios = $state({});

  const ratioOf = (src) => ratios[src] ?? 0.71;

  function measure(e) {
    const img = e.currentTarget;
    ratios[img.getAttribute("src")] = img.naturalWidth / img.naturalHeight;
  }

  let items = $derived(
    books.map((book) => {
      const pages = book.pages.slice(0, 2);
      return {
        book,
        pages,
        ratio: pages.reduce((sum, src) => sum + ratioOf(src), 0),
      };
    }),
  );

  let rows = $derived.by(() => {
    if (!width || items.length === 0) return [items];
    const minHeight = width < 768 ? 36 : 48;
    const totalRatio = items.reduce((sum, item) => sum + item.ratio, 0);
    const rowCount = Math.max(
      1,
      Math.ceil((totalRatio * minHeight + GAP * (items.length - 1)) / width),
    );
    const target = totalRatio / rowCount;

    const result = [];
    let row = [];
    let rowRatio = 0;
    for (const item of items) {
      if (
        row.length > 0 &&
        result.length < rowCount - 1 &&
        Math.abs(rowRatio + item.ratio - target) > Math.abs(rowRatio - target)
      ) {
        result.push(row);
        row = [];
        rowRatio = 0;
      }
      row.push(item);
      rowRatio += item.ratio;
    }
    result.push(row);
    return result;
  });
</script>

<nav
  bind:clientWidth={width}
  class="flex flex-col gap-2"
>
  {#each rows as row}
    <div class="flex max-w-640" style="gap: {GAP}px">
      {#each row as { book, pages, ratio } (book.id)}
        {@const isSelected = book.id === selectedId}
        <button
          class="flex min-w-0 cursor-pointer flex-col items-center gap-1 transition-opacity duration-300 {isSelected
            ? 'opacity-100'
            : 'opacity-50 hover:opacity-100'}"
          style="flex: {ratio} 1 0"
          onclick={() => onselect?.(book)}
          title="{book.title} — {book.author}, {book.year}"
          aria-label={book.title}
          aria-current={isSelected}
        >
          <span
            class="flex w-full items-start shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
          >
            {#each pages as src}
              <img
                {src}
                alt=""
                loading="lazy"
                class="block h-auto"
                style="width: {(ratioOf(src) / ratio) * 100}%"
                onload={measure}
              />
            {/each}
          </span>
          <span
            class="text-[10px] leading-none tabular-nums {isSelected
              ? 'text-[#3a3a3a]'
              : 'text-gray-500'}">{book.title},<br /> {book.author}</span
          >
        </button>
      {/each}
    </div>
  {/each}
</nav>
