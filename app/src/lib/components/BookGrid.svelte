<script>
  let { books = [], selectedId = null, onselect } = $props();
</script>

<nav
  class="grid h-full auto-rows-fr grid-cols-4 gap-x-[1.5vh] gap-y-[1vh] md:grid-cols-6"
>
  {#each books as book (book.id)}
    {@const isSelected = book.id === selectedId}
    <button
      class="flex min-h-0 min-w-0 cursor-pointer flex-col items-center text-center transition-opacity duration-300 {isSelected
        ? 'opacity-100'
        : 'opacity-50 hover:opacity-100'}"
      onclick={() => onselect?.(book)}
      title="{book.author}, {book.title}, {book.year}"
      aria-label={book.title}
      aria-current={isSelected}
    >
      <span class="flex min-h-0 w-full flex-1 items-end justify-center">
        {#each book.pages.slice(0, 2) as src}
          <img
            {src}
            alt=""
            loading="lazy"
            class="block h-full max-w-1/2 w-auto object-contain {src ===
            book.pages[0]
              ? 'object-right'
              : 'object-left'}"
          />
        {/each}
      </span>
      <span
        class="mt-[0.6vh] w-full shrink-0 text-[max(8px,0.6vh)] leading-tight text-[#2a2a2a]"
      >
        <span class="block truncate font-semibold">{book.author}</span>
        <span class="hidden truncate italic md:block">{book.title}</span>
        <span class="hidden tabular-nums md:block">{book.year}</span>
      </span>
    </button>
  {/each}
</nav>
