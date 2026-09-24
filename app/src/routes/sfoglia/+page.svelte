<script>
  import { onMount } from "svelte";
  import FlipBook from "$lib/components/FlipBook.svelte";
  import BookGrid from "$lib/components/BookGrid.svelte";

  let books = $state([]);
  let selectedBook = $state(null);
  let currentPage = $state(0);

  onMount(async () => {
    const response = await fetch("/books.json");
    const data = await response.json();
    books = data.books;
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

<div class="w-full h-dvh overflow-hidden flex flex-col gap-4 p-4 bg-white">
  {#if selectedBook}
    <header class="text-center shrink-0">
      <h1
        class="m-0 text-xl md:text-2xl font-normal tracking-wide text-[#3a3a3a]"
      >
        {selectedBook.title}
      </h1>
      <p class="m-0 text-sm text-gray-500">
        <span class="italic">{selectedBook.author}</span>
      </p>
    </header>

    {#key selectedBook.id}
      <FlipBook book={selectedBook} bind:currentPage />
    {/key}
  {:else}
    <div class="flex-1"></div>
  {/if}

  <div class="relative z-20 shrink-0 max-w-[80vw] mx-auto">
    <BookGrid {books} selectedId={selectedBook?.id} onselect={selectBook} />
  </div>
</div>
