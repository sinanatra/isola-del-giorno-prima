<script>
  import { onMount } from 'svelte';
  import Matter from 'matter-js';
  import { COLOR } from '$lib/macchina/constants.js';

  let canvas, ctx;
  let dpr = 1;
  let cssW = 0, cssH = 0;
  let engine, world;
  let wallL, wallR;
  let funnelWalls  = [];
  let funnelFloor  = null;
  let drainOpen    = false;
  let svgEl        = null;
  let phrasePool = [];
  let spawnTimer   = 0;
  let leakTimer    = 0;
  let lastFunnelTopY = null;

  const TARGET_BODIES = 300;
  const LEAK_BATCH = 3;
  const PHYSICS_SUBSTEPS = 2;
  const VB = { x: 30, y: 60, w: 1220, h: 790 };
  const FONT_SVG_SIZE = 10;


  const WORD_W_MIN = 45, WORD_W_RANGE = 20;
  const WORD_H_MIN = 15, WORD_H_RANGE = 7;

  function vbScale() {
    const r = svgRect();
    return r ? r.width / VB.w : 1;
  }

  const FUNNEL = [
    { x: 78.54,  y: 65.49  },
    { x: 178.54, y: 366.59 },
    { x: 390.69, y: 366.59 },
    { x: 490.69, y: 65.49  },
  ];

  function svgRect() {
    return svgEl ? svgEl.getBoundingClientRect() : null;
  }

  function svgToCanvas(sx, sy) {
    const r = svgRect();
    if (!r) return null;
    return {
      x: r.left + (sx - VB.x) / VB.w * r.width,
      y: r.top  + (sy - VB.y) / VB.h * r.height,
    };
  }

  function funnelNeckY() {
    const p = svgToCanvas((FUNNEL[1].x + FUNNEL[2].x) / 2, FUNNEL[1].y);
    return p ? p.y : (canvas ? canvas.height : 9999);
  }

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

  function poseWallSeg(body, x1, y1, x2, y2) {
    Matter.Body.setPosition(body, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
    Matter.Body.setAngle(body, Math.atan2(y2 - y1, x2 - x1));
  }

  const FUNNEL_WALL_PAIRS = [[0, 1], [3, 2]];
  const FUNNEL_FLOOR_PAIR = [1, 2];

  function syncFunnelPose() {
    if (!svgEl) return;
    FUNNEL_WALL_PAIRS.forEach(([i, j], idx) => {
      const body = funnelWalls[idx];
      const p1 = svgToCanvas(FUNNEL[i].x, FUNNEL[i].y);
      const p2 = svgToCanvas(FUNNEL[j].x, FUNNEL[j].y);
      if (body && p1 && p2) poseWallSeg(body, p1.x, p1.y, p2.x, p2.y);
    });
    if (funnelFloor) {
      const [i, j] = FUNNEL_FLOOR_PAIR;
      const p1 = svgToCanvas(FUNNEL[i].x, FUNNEL[i].y);
      const p2 = svgToCanvas(FUNNEL[j].x, FUNNEL[j].y);
      if (p1 && p2) poseWallSeg(funnelFloor, p1.x, p1.y, p2.x, p2.y);
    }
  }

  function scrollAllBodies() {
    const top = svgToCanvas(FUNNEL[0].x, FUNNEL[0].y);
    if (!top) return;
    if (lastFunnelTopY != null) {
      const dy = top.y - lastFunnelTopY;
      if (dy) {
        for (const b of Matter.Composite.allBodies(world)) {
          if (!b.isStatic) Matter.Body.translate(b, { x: 0, y: dy });
        }
      }
    }
    lastFunnelTopY = top.y;
  }

  function rebuildFunnel() {
    [...funnelWalls, funnelFloor].forEach(w => w && Matter.Composite.remove(world, w));
    funnelWalls = []; funnelFloor = null; drainOpen = false;
    lastFunnelTopY = null; // don't scroll-shift bodies off a resize-caused jump
    if (!svgEl || !engine) return;
    for (const [i, j] of FUNNEL_WALL_PAIRS) {
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

  export function setSvg(el) {
    svgEl = el;
    rebuildFunnel();
  }

  export function prepopulate(phrases) {
    phrasePool = phrases;
  }

  function spawnIsClear(cx, cy, w, h) {
    const bounds = {
      min: { x: cx - w / 2, y: cy - h / 2 },
      max: { x: cx + w / 2, y: cy + h / 2 },
    };
    return Matter.Query.region(Matter.Composite.allBodies(world), bounds).length === 0;
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
    const cy = 0;
    if (!spawnIsClear(cx, cy, w, h)) return;
    _addBody(cx, cy, w, h, txt, (Math.random() - 0.5) * 1.2, 0.5);
  }

  export function spawn(txt) {
    if (!engine || !canvas) return;
    const edge = funnelTopEdge();
    if (!edge) return;
    const { tl, tr } = edge;
    const s = vbScale();
    const w = (WORD_W_MIN + 8 + Math.random() * (WORD_W_RANGE + 6)) * s;
    const h = (WORD_H_MIN + Math.random() * (WORD_H_RANGE + 1)) * s;
    const cx = tl.x + 8 + Math.random() * (tr.x - tl.x - 16);
    const cy = 0;
    if (!spawnIsClear(cx, cy, w, h)) return;
    _addBody(cx, cy, w, h, txt, (Math.random() - 0.5) * 1.2, 0.5);
  }

  function _addBody(cx, cy, w, h, txt, vx, vy) {
    const body = Matter.Bodies.rectangle(cx, cy, w, h, {
      restitution: 0, friction: 0.85, frictionStatic: 2.9, frictionAir: 0.04,
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

    scrollAllBodies();
    syncFunnelPose();
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

    leakTimer -= dt;
    if (!drainOpen && leakTimer <= 0) {
      const resting = Matter.Composite.allBodies(world).filter(b => !b.isStatic && b._w != null);
      if (resting.length >= TARGET_BODIES) {
        for (let i = 0; i < LEAK_BATCH && resting.length; i++) {
          const idx = Math.floor(Math.random() * resting.length);
          Matter.Composite.remove(world, resting[idx]);
          resting.splice(idx, 1);
        }
      }
      leakTimer = 0.35 + Math.random() * 0.2;
    }

    const neckY = funnelNeckY();

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const count = Matter.Composite.allBodies(world).filter(b => !b.isStatic && b._w != null).length;
      if (count < TARGET_BODIES) {
        const need = Math.min(TARGET_BODIES - count, 2);
        for (let i = 0; i < need; i++) _spawnOne();
      }
      spawnTimer = 0.22 + Math.random() * 0.15;
    }

    const stepMs = Math.min(dt * 1000, 32) / PHYSICS_SUBSTEPS;
    for (let i = 0; i < PHYSICS_SUBSTEPS; i++) Matter.Engine.update(engine, stepMs);
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
    ctx.clearRect(0, 0, cssW, cssH);
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
  }

  function createWorld(W, H) {
    engine = Matter.Engine.create({ enableSleeping: true });
    // More solver iterations = stiffer stacks: default (6/4) lets resting
    // words visibly jitter/sink into each other while settling.
    engine.positionIterations = 30;
    engine.velocityIterations = 10;
    world  = engine.world;
    engine.gravity.y = 1.6;
    wallL = Matter.Bodies.rectangle(-30,    H / 2, 60, H * 3, { isStatic: true });
    wallR = Matter.Bodies.rectangle(W + 30, H / 2, 60, H * 3, { isStatic: true });
    Matter.Composite.add(world, [wallL, wallR]);
    rebuildFunnel();
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
      dpr = window.devicePixelRatio || 1;
      cssW = W; cssH = H;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 5;
}
</style>
