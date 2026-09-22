<script>
  import p5 from 'p5';
  import { onMount, onDestroy } from 'svelte';
  import { CITAZIONI } from './citazioni.js';
  import { BLUE } from './palette.js';

  const W = 1050, H = 1400;

  let {
    category = 'all',
    text = null,
    textEn = null,
    msPerWord = $bindable(120),
    fontSize = $bindable(56),
    lineHeight = $bindable(1.1),
    backgroundAlpha = 0.0,
    showPill = false,
    canvasEl = $bindable(null),
    citPlaying = $bindable(false),
    onregister = null,
    verticalAlign = 'top',
    align = 'left',
    padding = null,
    color = '#000000',
    colorEn = BLUE,
  } = $props();

  // { text, x, y, w, lang }
  let words = [];
  let revealed = 0;
  let drawnCount = 0; 
  let wordsLayer = null; 
  let framesDrawn = 0;
  let needsRelayout = true;
  let externallyDriven = false;
  let pInst;
  let container;
  let sketch;

  function normalize(s) {
    return String(s).replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
  }

  // Returns an ordered list of { text, lang } blocks to lay out, each
  // separated visually by a blank line. Explicit text/textEn props take
  // priority; otherwise falls back to the it/en pair for the category.
  function getBlocks() {
    if (text && String(text).trim()) {
      const blocks = [{ text: normalize(text), lang: 'it' }];
      if (textEn && String(textEn).trim()) blocks.push({ text: normalize(textEn), lang: 'en' });
      return blocks;
    }
    const entry = CITAZIONI[category] ?? null;
    if (!entry) return [];
    const blocks = [];
    if (entry.it) blocks.push({ text: `“${entry.it}”`, lang: 'it' });
    if (entry.en) blocks.push({ text: `“${entry.en}”`, lang: 'en' });
    return blocks;
  }

  function computeLayout(p) {
    const blocks = getBlocks();
    if (!blocks.length) { words = []; return; }

    p.textFont('Freight');
    p.textSize(fontSize);

    // reliable space: measure difference with middle space
    const spaceW = p.textWidth('x x') - p.textWidth('xx');
    const lineH = fontSize * lineHeight;
    const pad = padding ?? Math.max(40, fontSize * 0.45);
    const contentW = W - pad * 2;

    words = [];
    const rows = [];
    let currentRow = [];
    let x = 0, y = p.textAscent();

    const endRow = () => {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [];
    };

    blocks.forEach((block, bi) => {
      if (bi > 0) y += lineH;
      for (const row of block.text.split('\n')) {
        const trimmed = row.trim();
        if (!trimmed) { endRow(); y += lineH; continue; }
        for (const word of trimmed.split(/\s+/).filter(Boolean)) {
          const w = p.textWidth(word);
          if (x + w > contentW && x > 0) { endRow(); x = 0; y += lineH; }
          const item = { text: word, x, y, w, lang: block.lang };
          currentRow.push(item);
          words.push(item);
          x += w + spaceW;
        }
        endRow();
        x = 0;
        y += lineH;
      }
    });

    if (align === 'center') {
      for (const r of rows) {
        if (!r.length) continue;
        const rowW = r[r.length - 1].x + r[r.length - 1].w - r[0].x;
        const offset = pad + (contentW - rowW) / 2 - r[0].x;
        for (const w of r) w.x += offset;
      }
    } else {
      for (const w of words) w.x += pad;
    }

    if (words.length) {
      const blockH = words[words.length - 1].y + lineH * 0.3;
      const offsetY =
        verticalAlign === 'bottom' ? H - pad - blockH :
        verticalAlign === 'center' ? (H - blockH) / 2 :
        pad;
      for (const word of words) word.y += offsetY;
    }
  }

  function clear(p) {
    p.drawingContext.clearRect(0, 0, p.width, p.height);
    if (backgroundAlpha > 0) p.background(255, 255, 255, backgroundAlpha * 255);
  }

  function drawNewWords(from, to) {
    if (to <= from) return;
    const g = wordsLayer;
    g.textFont('Freight');
    g.textSize(fontSize);
    g.textAlign(g.LEFT, g.BASELINE);

    if (showPill) {
      g.push();
      g.strokeCap(g.ROUND);
      g.stroke(255, 255, 255);
      g.strokeWeight(fontSize * 1.1);
      g.noFill();
      for (let i = from; i < to; i++) {
        const { x, y, w } = words[i];
        g.line(x, y - fontSize * 0.35, x + w, y - fontSize * 0.35);
      }
      g.pop();
    }

    g.noStroke();
    let currentFill = null;
    for (let i = from; i < to; i++) {
      const fill = words[i].lang === 'en' && colorEn ? colorEn : color;
      if (fill !== currentFill) { g.fill(fill); currentFill = fill; }
      g.text(words[i].text, words[i].x, words[i].y);
    }
  }

  function drawFrame(p) {
    clear(p);
    if (!words.length) return;

    const count = Math.min(revealed, words.length);
    if (count > drawnCount) {
      drawNewWords(drawnCount, count);
      drawnCount = count;
    }
    p.image(wordsLayer, 0, 0);
  }

  $effect(() => {
    void category; void text; void textEn; void fontSize; void lineHeight; void verticalAlign; void align; void padding;
    needsRelayout = true;
    if (!externallyDriven) pInst?.loop();
  });

  onMount(() => {
    sketch = new p5((p) => {
      pInst = p;

      p.setup = () => {
        p.pixelDensity(window.devicePixelRatio || 1);
        const c = p.createCanvas(W, H);
        c.elt.style.cssText = `display:block;width:${W}px;height:${H}px;pointer-events:none`;
        p.frameRate(30);
        wordsLayer = p.createGraphics(W, H);
        canvasEl = c.elt;
      };

      p.draw = () => {
        if (needsRelayout) {
          computeLayout(p);
          revealed = 0;
          drawnCount = 0;
          wordsLayer.clear();
          framesDrawn = 0;
          citPlaying = true;
          needsRelayout = false;
        }

        if (citPlaying) {
          revealed = Math.min(
            Math.floor((framesDrawn * (1000 / 30)) / msPerWord),
            words.length,
          );
          framesDrawn++;
          if (revealed >= words.length) {
            citPlaying = false;
            drawFrame(p);
            p.noLoop();
            return;
          }
        }

        drawFrame(p);
      };
    }, container);

    onregister?.({
      replay: () => { needsRelayout = true; if (!externallyDriven) pInst?.loop(); },
      stop: () => {
        citPlaying = false;
        revealed = words.length;
        if (pInst) { drawFrame(pInst); pInst.noLoop(); }
      },
      pause: () => {
        externallyDriven = true;
        pInst?.noLoop();
      },
      resume: () => {
        externallyDriven = false;
        pInst?.loop();
      },
      advance: () => pInst?.redraw(),
    });
  });

  onDestroy(() => sketch?.remove());
</script>

<div bind:this={container} style="display:block;width:{W}px;height:{H}px;pointer-events:none"></div>
