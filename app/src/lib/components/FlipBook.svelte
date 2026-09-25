<script>
  import { onMount } from "svelte";

  let { book, currentPage = $bindable(0), aspectRatio = 0.71 } = $props();

  let container;
  let pageFlip;
  let pageCount = $derived(book.pages.length);

  const showCover = false;

  onMount(() => {
    let destroyed = false;
    let observer;
    const root = document.createElement("div");
    root.className = "w-full h-full m-auto";
    container.appendChild(root);

    book.pages.forEach((src, i) => {
      const page = document.createElement("div");
      page.className = "page bg-[#f4efe6] overflow-hidden";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.draggable = false;
      const isLeft = i % 2 === (showCover ? 1 : 0);
      img.className = `block w-full h-full object-contain select-none pointer-events-none ${
        isLeft ? "object-right" : "object-left"
      }`;
      page.appendChild(img);
      root.appendChild(page);
    });

    import("page-flip").then(({ PageFlip }) => {
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
        flippingTime: 700,
        mobileScrollSupport: false,
      });

      pageFlip.loadFromHTML(root.querySelectorAll(".page"));
      pageFlip.getUI().getDistElement().style.height = "100%";
      pageFlip.on("flip", (e) => (currentPage = e.data));

      observer = new ResizeObserver(() => pageFlip?.update());
      observer.observe(container);
    });

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
    "absolute top-1/2 -translate-y-1/2 z-10 size-10 text-[2rem] leading-none text-[#3a3a3a] cursor-pointer transition-opacity disabled:opacity-20 disabled:cursor-default";
</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative flex-1 min-h-0 w-full overflow-hidden">
  <button
    class="{arrowClass} left-0"
    onclick={prev}
    disabled={currentPage === 0}
    aria-label="Pagina precedente">‹</button
  >

  <div bind:this={container} class="w-full h-full m-auto px-10"></div>

  <button
    class="{arrowClass} right-0"
    onclick={next}
    disabled={lastVisiblePage >= pageCount - 1}
    aria-label="Pagina successiva">›</button
  >
</div>
