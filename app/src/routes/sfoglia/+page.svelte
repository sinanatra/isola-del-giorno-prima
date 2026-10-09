<script>
  import { onMount } from "svelte";
  import FlipBook from "$lib/components/FlipBook.svelte";
  import BookGrid from "$lib/components/BookGrid.svelte";

  let books = $state([]);
  let selectedBook = $state(null);
  let currentPage = $state(0);

  onMount(async () => {
    const [data, arena] = await Promise.all([
      fetch("/books.json").then((r) => r.json()),
      fetch("/arena.json").then((r) => r.json()),
    ]);
    // fetch are.na
    books = data.books
      .map((book) => {
        const images = book.pages
          .map((p) => arena.images[p.split("/").pop().replace(/\.\w+$/, "")])
          .filter(Boolean);
        return {
          ...book,
          pages: images.map((i) => i.src),
          thumbs: images.map((i) => i.thumb),
        };
      })
      .filter((book) => book.pages.length > 0);
    if (books.length > 0) {
      selectedBook = books[Math.floor(Math.random() * books.length)];
    }
  });

  function selectBook(book) {
    selectedBook = book;
    currentPage = 0;
  }
</script>

<svelte:head>
  <title>Sfoglia libri</title>
</svelte:head>

<div class="w-full h-dvh overflow-hidden flex flex-col gap-4 p-4 bg-[#f5f5f5]">
  <p
    class="m-0 border-b py-10 shrink-0 text-center text-[max(9px,2vh)] leading-tight"
  >
    Tocca lo schermo per sfogliare i libri<br />
    <span class="italic">Tap the screen to browse books</span>
  </p>
  {#if selectedBook}
    {#key selectedBook.id}
      <FlipBook book={selectedBook} bind:currentPage />
    {/key}
  {:else}
    <div class="flex-1"></div>
  {/if}

  <div
    class="relative border-t py-10 z-20 h-[30%] shrink-0 w-full max-w-[95vw] mx-auto"
  >
    <BookGrid {books} selectedId={selectedBook?.id} onselect={selectBook} />
  </div>
</div>
