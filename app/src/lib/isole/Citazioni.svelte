<script>
  import p5 from 'p5';
  import { onMount, onDestroy } from 'svelte';
  import { CITAZIONI } from './citazioni.js';

  const W = 1050, H = 1400;

  let {
    open = $bindable(false),
    category = 'all',
    text = null,
    msPerWord = $bindable(120),
    fontSize = $bindable(56),
    lineHeight = $bindable(1.1),
    backgroundAlpha = 0.0,
    showPill = false,
    canvasEl = $bindable(null),
    citPlaying = $bindable(false),
    onregister = null,
    verticalAlign = 'top',
  } = $props();

  // { text, x, y, w }
  let words = [];
  let revealed = 0;
  let animStart = 0;
  let needsRelayout = true;
  let pInst;
  let container;
  let sketch;

  function getText() {
    if (text && String(text).trim()) {
      return String(text).replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
    }
    const entry = CITAZIONI[category] ?? null;
    if (!entry) return null;
    return [entry.it, entry.en].filter(Boolean).join('\n\n');
  }

  function computeLayout(p) {
    const testo = getText();
    if (!testo) { words = []; return; }

    p.textFont('Freight');
    p.textSize(fontSize);

    // reliable space: measure difference with middle space
    const spaceW = p.textWidth('x x') - p.textWidth('xx');
    const lineH = fontSize * lineHeight;

    words = [];
    let x = 0, y = p.textAscent();

    for (const row of testo.split('\n')) {
      const trimmed = row.trim();
      if (!trimmed) { y += lineH; continue; }
      for (const word of trimmed.split(/\s+/).filter(Boolean)) {
        const w = p.textWidth(word);
        if (x + w > W && x > 0) { x = 0; y += lineH; }
        words.push({ text: word, x, y, w });
        x += w + spaceW;
      }
      x = 0;
      y += lineH;
    }

    if (words.length && verticalAlign !== 'top') {
      const blockH = words[words.length - 1].y + lineH * 0.3;
      const offsetY = verticalAlign === 'bottom' ? H - blockH : (H - blockH) / 2;
      for (const word of words) word.y += offsetY;
    }
  }

  function clear(p) {
    // use drawingContext to guarantee a clean frame
    p.drawingContext.clearRect(0, 0, p.width, p.height);
    if (backgroundAlpha > 0) p.background(255, 255, 255, backgroundAlpha * 255);
  }

  function drawFrame(p) {
    clear(p);
    if (!words.length) return;

    p.textFont('Freight');
    p.textSize(fontSize);
    p.textAlign(p.LEFT, p.BASELINE);

    const count = Math.min(revealed, words.length);

    if (showPill && count > 0) {
      p.push();
      p.strokeCap(p.ROUND);
      p.stroke(255);
      p.strokeWeight(fontSize * 1.1);
      p.noFill();
      for (let i = 0; i < count; i++) {
        const { x, y, w } = words[i];
        p.line(x, y - fontSize * 0.35, x + w, y - fontSize * 0.35);
      }
      p.pop();
    }

    p.noStroke();
    p.fill(0);
    for (let i = 0; i < count; i++) {
      p.text(words[i].text, words[i].x, words[i].y);
    }
  }

  $effect(() => {
    void category; void text; void fontSize; void lineHeight; void verticalAlign;
    needsRelayout = true;
    pInst?.loop();
  });

  onMount(() => {
    sketch = new p5((p) => {
      pInst = p;

      p.setup = () => {
        p.pixelDensity(window.devicePixelRatio || 1);
        const c = p.createCanvas(W, H);
        c.elt.style.cssText = `display:block;width:${W}px;height:${H}px;pointer-events:none`;
        canvasEl = c.elt;
      };

      p.draw = () => {
        if (needsRelayout) {
          computeLayout(p);
          revealed = 0;
          animStart = p.millis();
          citPlaying = true;
          needsRelayout = false;
        }

        if (citPlaying) {
          revealed = Math.min(
            Math.floor((p.millis() - animStart) / msPerWord),
            words.length,
          );
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
      replay: () => { needsRelayout = true; pInst?.loop(); },
      stop: () => {
        citPlaying = false;
        revealed = words.length;
        if (pInst) { drawFrame(pInst); pInst.noLoop(); }
      },
    });
  });

  onDestroy(() => sketch?.remove());
</script>

<div bind:this={container} style="display:block;width:{W}px;height:{H}px;pointer-events:none"></div>
