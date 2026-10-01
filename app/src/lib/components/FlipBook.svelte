<script>
  import { onMount } from "svelte";

  let { book, currentPage = $bindable(0), aspectRatio = 0.71 } = $props();

  let container;
  let pageFlip;
  let bookBottom = $state(null);
  let ready = $state(false);
  let pageCount = $derived(book.pages.length);

  const showCover = false;

  onMount(() => {
    let destroyed = false;
    let observer;
    const root = document.createElement("div");
    root.className =
      "w-full h-full m-auto opacity-0 transition-opacity duration-300";
    container.appendChild(root);

    book.pages.forEach((src, i) => {
      const page = document.createElement("div");
      page.className = "page bg-[#f4efe6] overflow-hidden";
      const img = document.createElement("img");
      // Prima l'anteprima, poi l'originale appena è scaricato
      const preview = book.previews?.[i] ?? src;
      img.src = preview;
      if (preview !== src) {
        const full = new Image();
        full.src = src;
        full
          .decode()
          .then(() => {
            if (!destroyed) img.src = src;
          })
          .catch(() => {});
      }
      img.alt = "";
      img.draggable = false;
      const isLeft = i % 2 === (showCover ? 1 : 0);
      img.className = `block w-full h-full object-contain select-none pointer-events-none ${
        isLeft ? "object-right" : "object-left"
      }`;
      page.appendChild(img);
      root.appendChild(page);
    });

    const firstImages = [...root.querySelectorAll("img")]
      .slice(0, 2)
      .map((img) => img.decode().catch(() => {}));

    Promise.all([import("page-flip"), ...firstImages]).then(
      ([{ PageFlip }]) => {
        if (destroyed) return;

        pageFlip = new PageFlip(root, {
          width: 600,
          height: 600 / aspectRatio,
          size: "stretch",
          minWidth: 100,
          maxWidth: 2000,
          minHeight: 100,
          maxHeight: 3000,
          usePortrait: false,
          showCover,
          autoSize: true,
          drawShadow: true,
          maxShadowOpacity: 0.3,
          flippingTime: 1200,
          mobileScrollSupport: false,
          useMouseEvents: false,
        });

        pageFlip.loadFromHTML(root.querySelectorAll(".page"));
        pageFlip.getUI().getDistElement().style.height = "100%";
        pageFlip.on("flip", (e) => (currentPage = e.data));
        syncBottom();

        observer = new ResizeObserver(() => {
          pageFlip?.update();
          syncBottom();
        });
        observer.observe(container);

        requestAnimationFrame(() => {
          if (destroyed) return;
          root.classList.replace("opacity-0", "opacity-100");
          ready = true;
        });
      },
    );

    return () => {
      destroyed = true;
      observer?.disconnect();
      pageFlip?.destroy();
      pageFlip = null;
      root.remove();
    };
  });

  let lastVisiblePage = $derived(
    showCover && currentPage === 0 ? 0 : currentPage + 1,
  );

  function syncBottom() {
    if (!pageFlip) return;
    const rect = pageFlip.getBoundsRect();
    bookBottom = rect.top + rect.height;
  }

  let pageLabel = $derived.by(() => {
    const first = currentPage + 1;
    const last = Math.min(lastVisiblePage, pageCount - 1) + 1;
    return first === last ? `${first}` : `${first}–${last}`;
  });

  const next = () => pageFlip?.flipNext();
  const prev = () => pageFlip?.flipPrev();

  function onKeydown(e) {
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  }

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 z-20 size-10 text-[2rem] leading-none text-[#3a3a3a] cursor-pointer transition-opacity disabled:opacity-20 disabled:cursor-default";
  const tapZoneClass =
    "absolute inset-y-0 z-[15] w-1/2 cursor-pointer disabled:cursor-default [-webkit-tap-highlight-color:transparent]";
</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative flex-1 min-h-0 w-full overflow-hidden">
  <button
    class="{arrowClass} left-0"
    onclick={prev}
    disabled={currentPage === 0}
    aria-label="Pagina precedente">‹</button
  >

  <div
    bind:this={container}
    class="relative z-10 w-full h-full m-auto px-10 pb-[2vh]"
  ></div>

  <button
    class="{tapZoneClass} left-0"
    onclick={prev}
    disabled={currentPage === 0}
    tabindex="-1"
    aria-hidden="true"
  ></button>
  <button
    class="{tapZoneClass} right-0"
    onclick={next}
    disabled={lastVisiblePage >= pageCount - 1}
    tabindex="-1"
    aria-hidden="true"
  ></button>

  <button
    class="{arrowClass} right-0"
    onclick={next}
    disabled={lastVisiblePage >= pageCount - 1}
    aria-label="Pagina successiva">›</button
  >

  {#if ready && bookBottom !== null}
    <p
      class="absolute inset-x-0 z-0 m-0 mt-[0.5vh] text-center text-[max(8px,1.2vh)] leading-tight tabular-nums text-gray-500"
      style="top: {bookBottom}px"
    >
      {pageLabel} / {pageCount}
    </p>
  {/if}
</div>
