<script>
  import { onMount } from 'svelte';
  import Matter from 'matter-js';
  import { COLOR } from '$lib/macchina/constants.js';

  let canvas, ctx;
  let engine, world;
  let wallL, wallR;
  let funnelWalls  = [];
  let funnelFloor  = null;
  let drainOpen    = false;
  let svgEl        = null;
  let phrasePool = [];
  let pendingPhrases = null;
  let spawnTimer   = 0;

  const TARGET_BODIES = 40;
  const VB = { x: 30, y: 60, w: 1220, h: 790 };
  const FONT_SVG_SIZE = 10; 

  
  const WORD_W_MIN = 45, WORD_W_RANGE = 20;
  const WORD_H_MIN = 15, WORD_H_RANGE = 7;

  function vbScale() {
    return canvas && canvas.width ? canvas.width / VB.w : 1;
  }

  function centeredX(left, right, w, margin) {
    const avail = Math.max(0, (right - left) - w - 2 * margin);
    return left + margin + w / 2 + Math.random() * avail;
  }

  const FUNNEL = [
    { x: 78.54,  y: 65.49  },
    { x: 178.54, y: 366.59 },
    { x: 390.69, y: 366.59 },
    { x: 490.69, y: 65.49  },
  ];

  // ── coordinate mapping ──────────────────────────────────────────
  // Canvas fills the scene exactly (inset:0), SVG fills scene too (100%×100%).
  // Viewbox maps directly to canvas buffer dimensions — no DOM layout lookup needed.
  function svgToCanvas(sx, sy) {
    if (!canvas || !canvas.width) return null;
    return {
      x: (sx - VB.x) / VB.w * canvas.width,
      y: (sy - VB.y) / VB.h * canvas.height,
    };
  }

  function funnelNeckY() {
    const p = svgToCanvas((FUNNEL[1].x + FUNNEL[2].x) / 2, FUNNEL[1].y);
    return p ? p.y : (canvas ? canvas.height : 9999);
  }

  // Top-left/top-right canvas points of the funnel mouth, where new words spawn.
  function funnelTopEdge() {
    const tl = svgToCanvas(FUNNEL[0].x, FUNNEL[0].y);
    const tr = svgToCanvas(FUNNEL[3].x, FUNNEL[3].y);
    return tl && tr ? { tl, tr } : null;
  }

  // ── wall helpers ────────────────────────────────────────────────
  function makeWallSeg(x1, y1, x2, y2) {
    const cx  = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    return Matter.Bodies.rectangle(cx, cy, len, 20, {
      isStatic: true, angle: ang, restitution: 0.05, friction: 0.8,
    });
  }

  function rebuildFunnel() {
    [...funnelWalls, funnelFloor].forEach(w => w && Matter.Composite.remove(world, w));
    funnelWalls = []; funnelFloor = null; drainOpen = false;
    if (!svgEl || !engine) return;
    for (const [i, j] of [[0, 1], [3, 2]]) {
      const p1 = svgToCanvas(FUNNEL[i].x, FUNNEL[i].y);
      const p2 = svgToCanvas(FUNNEL[j].x, FUNNEL[j].y);
      if (!p1 || !p2) continue;
      funnelWalls.push(makeWallSeg(p1.x, p1.y, p2.x, p2.y));
    }
    Matter.Composite.add(world, funnelWalls);
    _buildFloor();
  }

  function _buildFloor() {
    const p1 = svgToCanvas(FUNNEL[1].x, FUNNEL[1].y);
    const p2 = svgToCanvas(FUNNEL[2].x, FUNNEL[2].y);
    if (!p1 || !p2) return;
    funnelFloor = makeWallSeg(p1.x, p1.y, p2.x, p2.y);
    Matter.Composite.add(world, funnelFloor);
  }

  // ── public API ───────────────────────────────────────────────────
  export function setSvg(el) {
    svgEl = el;
    rebuildFunnel();
    if (pendingPhrases) { _fill(pendingPhrases, TARGET_BODIES); pendingPhrases = null; }
  }

  export function prepopulate(phrases) {
    phrasePool = phrases;
    if (!engine || !canvas || canvas.width === 0) { pendingPhrases = phrases; return; }
    _fill(phrases, TARGET_BODIES);
  }

  function _fill(phrases, count) {
    if (!phrases.length) return;
    for (let i = 0; i < count; i++) {
      const txt = phrases[Math.floor(Math.random() * phrases.length)]?.oggetto || '·';
      const t   = i / count;
      const lx  = FUNNEL[0].x + t * (FUNNEL[1].x - FUNNEL[0].x);
      const rx  = FUNNEL[3].x + t * (FUNNEL[2].x - FUNNEL[3].x);
      const sy  = FUNNEL[0].y + t * (FUNNEL[1].y - FUNNEL[0].y);
      const pl  = svgToCanvas(lx, sy);
      const pr  = svgToCanvas(rx, sy);
      if (!pl || !pr) continue;
      const s  = vbScale();
      const w  = (WORD_W_MIN + Math.random() * WORD_W_RANGE) * s;
      const h  = (WORD_H_MIN + Math.random() * WORD_H_RANGE) * s;
      const cx = centeredX(pl.x, pr.x, w, 5 * s);
      _addBody(cx, pl.y, w, h, txt, (Math.random() - 0.5) * 0.4, 0);
    }
  }

  function _spawnOne() {
    if (!engine || !canvas || !phrasePool.length) return;
    const txt = phrasePool[Math.floor(Math.random() * phrasePool.length)]?.oggetto || '·';
    const edge = funnelTopEdge();
    if (!edge) return;
    const { tl, tr } = edge;
    const s = vbScale();
    const w = (WORD_W_MIN + Math.random() * WORD_W_RANGE) * s;
    const h = (WORD_H_MIN + Math.random() * WORD_H_RANGE) * s;
    const cx = tl.x + 8 + Math.random() * (tr.x - tl.x - 16);
    const cy = tl.y - h - Math.random() * 20;
    _addBody(cx, cy, w, h, txt, (Math.random() - 0.5) * 1.2, 0.5);
  }

  // called from page loop while spinning
  export function spawn(txt) {
    if (!engine || !canvas) return;
    const edge = funnelTopEdge();
    if (!edge) return;
    const { tl, tr } = edge;
    const s = vbScale();
    const w = (WORD_W_MIN + 8 + Math.random() * (WORD_W_RANGE + 6)) * s;
    const h = (WORD_H_MIN + Math.random() * (WORD_H_RANGE + 1)) * s;
    _addBody(
      tl.x + 8 + Math.random() * (tr.x - tl.x - 16),
      tl.y - h - Math.random() * h,
      w, h, txt, (Math.random() - 0.5) * 1.2, 0.5
    );
  }

  function _addBody(cx, cy, w, h, txt, vx, vy) {
    const body = Matter.Bodies.rectangle(cx, cy, w, h, {
      restitution: 0.05, friction: 0.85, frictionAir: 0.04,
      density: 0.002, sleepThreshold: 20,
    });
    body._w = w; body._h = h; body._txt = txt;
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);
    Matter.Composite.add(world, body);
  }

  // omega is the valve: open when spinning, closed when stopped
  export function tick(dt, omega) {
    if (!engine || !ctx) return;

    engine.gravity.y = 1.6;

    const spinning = Math.abs(omega) > 0.06;

    if (spinning && !drainOpen) {
      if (funnelFloor) { Matter.Composite.remove(world, funnelFloor); funnelFloor = null; }
      // Wake all sleeping bodies so they respond to the floor removal
      for (const b of Matter.Composite.allBodies(world)) {
        if (!b.isStatic) Matter.Sleeping.set(b, false);
      }
      drainOpen = true;
    } else if (!spinning && drainOpen) {
      _buildFloor();
      drainOpen = false;
    }

    const neckY = funnelNeckY();

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const count = Matter.Composite.allBodies(world).filter(b => !b.isStatic && b._w != null).length;
      if (count < TARGET_BODIES) {
        const need = Math.min(TARGET_BODIES - count, 3);
        for (let i = 0; i < need; i++) _spawnOne();
      }
      spawnTimer = 0.18 + Math.random() * 0.12;
    }

    Matter.Engine.update(engine, Math.min(dt * 1000, 32));
    if (drainOpen) {
      for (const b of Matter.Composite.allBodies(world)) {
        if (!b.isStatic && b._w != null && b.position.y + b._h / 2 > neckY) {
          Matter.Composite.remove(world, b);
        }
      }
    }

    draw();
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    const c = [
      svgToCanvas(FUNNEL[0].x, FUNNEL[0].y),
      svgToCanvas(FUNNEL[3].x, FUNNEL[3].y),
      svgToCanvas(FUNNEL[2].x, FUNNEL[2].y),
      svgToCanvas(FUNNEL[1].x, FUNNEL[1].y),
    ];
    if (c.every(Boolean)) {
      ctx.beginPath();
      ctx.moveTo(c[0].x, 0);
      ctx.lineTo(c[1].x, 0);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.lineTo(c[3].x, c[3].y);
      ctx.lineTo(c[0].x, c[0].y);
      ctx.closePath();
      ctx.clip();
    }
    for (const b of Matter.Composite.allBodies(world)) {
      if (b.isStatic || b._w == null) continue;
      const { _w: w, _h: h, _txt: txt } = b;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      ctx.fillStyle   = '#ffffff';
      ctx.strokeStyle = COLOR;
      ctx.lineWidth   = 1;
      ctx.fillRect  (-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      if (txt) {
        ctx.fillStyle    = COLOR;
        ctx.font         = `${FONT_SVG_SIZE * vbScale()}px Rubik, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.beginPath();
        ctx.rect(-w / 2 + 3, -h / 2, w - 6, h);
        ctx.clip();
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function createWorld(W, H) {
    engine = Matter.Engine.create({ enableSleeping: true });
    world  = engine.world;
    engine.gravity.y = 1.6;
    wallL = Matter.Bodies.rectangle(-30,    H / 2, 60, H * 3, { isStatic: true });
    wallR = Matter.Bodies.rectangle(W + 30, H / 2, 60, H * 3, { isStatic: true });
    Matter.Composite.add(world, [wallL, wallR]);
    rebuildFunnel();
    if (pendingPhrases) { _fill(pendingPhrases, TARGET_BODIES); pendingPhrases = null; }
  }

  function repositionWalls(W, H) {
    if (!wallL) return;
    Matter.Body.setPosition(wallL, { x: -30,    y: H / 2 });
    Matter.Body.setPosition(wallR, { x: W + 30, y: H / 2 });
    rebuildFunnel();
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const W = Math.round(width), H = Math.round(height);
      if (!W || !H) return;
      canvas.width  = W;
      canvas.height = H;
      if (!engine) createWorld(W, H);
      else         repositionWalls(W, H);
    });
    ro.observe(canvas);
    return () => { ro.disconnect(); if (engine) Matter.Engine.clear(engine); };
  });
</script>

<canvas bind:this={canvas}></canvas>

<style>
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}
</style>
