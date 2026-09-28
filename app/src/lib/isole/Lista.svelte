<script>
  import p5 from 'p5';
  import { onMount, onDestroy } from 'svelte';
  import { LISTE } from './citazioni.js';
  import { BLUE } from './palette.js';

  let {
    W = 1050,
    H = 1400,
    category = 'all',
    words = '',
    fontSize = $bindable(182),
    speed = $bindable(1),
    backgroundAlpha = 0,
    showPill = false,
    loop = true,
    canvasEl = $bindable(null),
    color = '#000000',
    colorEn = BLUE,
    onregister = null,
  } = $props();

  // fontSize is set for the 3:4 canvas (1050 wide); narrower formats scale
  // it down so words fit the same way.
  let fs = $derived(fontSize * Math.min(1, W / 1050));

  let offset = 0;
  let container;
  let sketch;
  let pInst;

  function getWords() {
    if (words && words.trim()) {
      return words.split(',').map(w => w.trim()).filter(Boolean)
        .map(text => ({ text, lang: 'it' }));
    }
    const entries = category === 'all'
      ? Object.values(LISTE)
      : [LISTE[category]].filter(Boolean);
    const result = [];
    for (const entry of entries) {
      const it = (entry.it ?? '').split(',').map(w => w.trim()).filter(Boolean);
      const en = (entry.en ?? '').split(',').map(w => w.trim()).filter(Boolean);
      for (const w of it) result.push({ text: w, lang: 'it' });
      for (const w of en) result.push({ text: w, lang: 'en' });
    }
    return result;
  }

  function computeLines(p) {
    const maxW = W - 80;
    const spacing = fs * 1.15;
    const tight = fs * 0.7;
    p.textSize(fs);
    const lines = [];
    let y = 0;
    for (const { text, lang } of getWords()) {
      if (p.textWidth(text) <= maxW) {
        lines.push({ text, lang, y });
        y += spacing;
        continue;
      }
      const wrapped = [];
      let line = '';
      for (const part of text.split(' ')) {
        const test = line ? `${line} ${part}` : part;
        if (p.textWidth(test) > maxW && line) {
          wrapped.push(line);
          line = part;
        } else {
          line = test;
        }
      }
      if (line) wrapped.push(line);
      for (let li = 0; li < wrapped.length; li++) {
        lines.push({ text: wrapped[li], lang, y });
        y += li < wrapped.length - 1 ? tight : spacing;
      }
    }
    return { lines, totalHeight: y };
  }

  onMount(() => {
    sketch = new p5((p) => {
      pInst = p;

      p.setup = () => {
        p.pixelDensity(window.devicePixelRatio || 1);
        const c = p.createCanvas(W, H);
        c.elt.style.cssText = `display:block;width:${W}px;height:${H}px;pointer-events:none`;
        p.textFont('Freight');
        p.textAlign(p.CENTER, p.BASELINE);
        p.frameRate(30);
        canvasEl = c.elt;
      };

      p.draw = () => {
        const { lines, totalHeight } = computeLines(p);
        const total = H + fs + totalHeight + H;
        offset = loop
          ? (offset + speed) % total
          : Math.min(offset + speed, total);

        p.clear();
        if (backgroundAlpha > 0) p.background(255, 255, 255, backgroundAlpha * 255);

        p.textSize(fs);
        p.noStroke();

        for (const { text, lang, y: lineY } of lines) {
          const y = H + fs + lineY - offset;
          if (y < -fs * 2 || y > H + fs * 2) continue;

          if (showPill) {
            const tw = p.textWidth(text);
            p.push();
            p.strokeCap(p.ROUND);
            p.stroke(255, 255, 255);
            p.strokeWeight(fs * 1.1);
            p.line(W / 2 - tw / 2, y - fs * 0.35, W / 2 + tw / 2, y - fs * 0.35);
            p.pop();
          }

          p.fill(lang === 'en' && colorEn ? colorEn : color);
          p.text(text, W / 2, y);
        }
      };
    }, container);

    onregister?.({
      // Recording-only controls: pause the sketch's own real-time loop and
      // drive it one frame at a time from the parent instead. offset already
      // advances by a fixed amount per draw() call, so this alone keeps the
      // scroll in lockstep with captured video frames.
      pause: () => pInst?.noLoop(),
      resume: () => pInst?.loop(),
      advance: () => pInst?.redraw(),
    });
  });

  onDestroy(() => sketch?.remove());
</script>

<div bind:this={container} style="display:block;width:{W}px;height:{H}px;pointer-events:none"></div>
