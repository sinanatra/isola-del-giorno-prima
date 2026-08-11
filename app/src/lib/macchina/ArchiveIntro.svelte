<script>
  import { onMount, onDestroy } from "svelte";

  const IMAGES = [
    "/macchine/1889186_orig.jpg",
    "/macchine/30861738736_bf4f1a7209_b.jpg",
    "/macchine/891eeec3e397843ab699d3c3770fd6a7.jpg",
    "/macchine/H20843-L378089995.jpg",
    "/macchine/Kircher-Arca_musarithmica.jpg",
    "/macchine/Passages_from_the_Life_of_a_Philosopher_1864_page_ii.png",
    "/macchine/babbage-analytical-engine-diagram-difference-engine-9000-of-babbage-analytical-engine-diagram.jpg",
    "/macchine/e1304e49-5307-401b-8efa-8f4cc8643532.png",
    "/macchine/e647bdfb1391845efc7db3ece00a7f12.png",
    "/macchine/reference.png",
  ];

  const COLS = 7;
  const ROWS = 6;
  const TOTAL = COLS * ROWS;

  const letters = Array.from({ length: TOTAL }, (_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return String.fromCharCode(65 + ((row + col) % 26));
  });

  // Non-overlapping mosaic blocks covering the 7×6 grid
  const BLOCK_DEFS = [
    { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
    { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    { col: 4, row: 1, colSpan: 4, rowSpan: 2 },
    { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    { col: 1, row: 3, colSpan: 3, rowSpan: 2 },
    { col: 4, row: 3, colSpan: 2, rowSpan: 2 },
    { col: 6, row: 3, colSpan: 2, rowSpan: 2 },
    { col: 1, row: 5, colSpan: 2, rowSpan: 2 },
    { col: 3, row: 5, colSpan: 1, rowSpan: 2 },
    { col: 4, row: 5, colSpan: 4, rowSpan: 2 },
  ];

  let imageBlocks = $state(
    BLOCK_DEFS.map((b) => ({ ...b, img: null, visible: false })),
  );

  function rndImg() {
    return IMAGES[Math.floor(Math.random() * IMAGES.length)];
  }

  function tick() {
    const order = [...Array(imageBlocks.length).keys()].sort(
      () => Math.random() - 0.5,
    );
    const show = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < show; i++) {
      imageBlocks[order[i]].img = rndImg();
      imageBlocks[order[i]].visible = true;
    }
    for (let i = show; i < show + 1 && i < order.length; i++) {
      imageBlocks[order[i]].visible = false;
    }
  }

  const PACES = [
    [60, 140],
    [250, 450],
    [100, 800],
  ];

  let paceRange = PACES[0];
  let ticksUntilPaceChange = 0;

  // Every so often, switch to a different rhythm so the mosaic never settles
  // into one predictable cadence.
  function nextDelay() {
    if (ticksUntilPaceChange <= 0) {
      paceRange = PACES[Math.floor(Math.random() * PACES.length)];
      ticksUntilPaceChange = 4 + Math.floor(Math.random() * 10);
    }
    ticksUntilPaceChange -= 1;
    const [lo, hi] = paceRange;
    return lo + Math.random() * (hi - lo);
  }

  let timerId;

  function loop() {
    tick();
    timerId = setTimeout(loop, nextDelay());
  }

  onMount(() => {
    timerId = setTimeout(loop, nextDelay());
  });

  onDestroy(() => {
    clearTimeout(timerId);
  });
</script>

<section>
  <!-- Letter grid -->
  <div class="letters-grid" style="--cols:{COLS}">
    {#each letters as letter}
      <div class="cell">
        <span class="letter">{letter}</span>
      </div>
    {/each}
  </div>

  <!-- Image mosaic overlay -->
  <div class="image-overlay" style="--cols:{COLS}; --rows:{ROWS}">
    {#each imageBlocks as block}
      <div
        class="img-block"
        style="grid-column:{block.col}/span {block.colSpan};grid-row:{block.row}/span {block.rowSpan}"
      >
        {#if block.img && block.visible}
          <img src={block.img} alt="" draggable="false" />
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    position: relative;
    width: 100%;
    height: 100%;
    background: rgb(240, 239, 239);
    overflow: hidden;
  }

  .letters-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(6, 1fr);
    width: 100%;
    height: 100%;
    position: relative;
    z-index: 100;
  }
  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .letter {
    font-family: "Freight", serif;
    font-size: min(calc(100vw / var(--cols) * 0.8), calc(80vh / 8 * 0.8));
    color: black;
    user-select: none;
    line-height: 1;
  }

  .image-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    gap: 4px;
    z-index: 2;
    pointer-events: none;
  }
  .img-block {
    overflow: hidden;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* background: gainsboro; */
    padding: 10px;
    filter: grayscale(100%) contrast(1.1);
  }
</style>
