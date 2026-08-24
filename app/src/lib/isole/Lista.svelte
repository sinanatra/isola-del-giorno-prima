<script>
  import p5 from 'p5';
  import { onMount, onDestroy } from 'svelte';
  import { LISTE } from './citazioni.js';

  const W = 1050, H = 1400;

  let {
    open = $bindable(false),
    category = 'all',
    words = '',
    fontSize = $bindable(182),
    speed = $bindable(1),
    backgroundAlpha = 0,
    showPill = false,
    loop = true,
    canvasEl = $bindable(null),
    color = 'blue',
    colorEn = null,
  } = $props();

  let offset = 0;
  let container;
  let sketch;

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
    const spacing = fontSize * 1.15;
    const tight = fontSize * 0.7;
    p.textSize(fontSize);
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
        const total = H + fontSize + totalHeight + H;
        offset = loop
          ? (offset + speed) % total
          : Math.min(offset + speed, total);

        p.clear();
        if (backgroundAlpha > 0) p.background(255, 255, 255, backgroundAlpha * 255);

        p.textSize(fontSize);
        p.noStroke();

        for (const { text, lang, y: lineY } of lines) {
          const y = H + fontSize + lineY - offset;
          if (y < -fontSize * 2 || y > H + fontSize * 2) continue;

          if (showPill) {
            const tw = p.textWidth(text);
            p.push();
            p.strokeCap(p.ROUND);
            p.stroke(255);
            p.strokeWeight(fontSize * 1.1);
            p.line(W / 2 - tw / 2, y - fontSize * 0.35, W / 2 + tw / 2, y - fontSize * 0.35);
            p.pop();
          }

          p.fill(lang === 'en' && colorEn ? colorEn : color);
          if (lang === 'en') {
            p.textStyle(p.ITALIC);
            p.text(text, W / 2, y);
            p.textStyle(p.NORMAL);
          } else {
            p.text(text, W / 2, y);
          }
        }
      };
    }, container);
  });

  onDestroy(() => sketch?.remove());
</script>

<div bind:this={container} style="display:block;width:{W}px;height:{H}px;pointer-events:none"></div>
