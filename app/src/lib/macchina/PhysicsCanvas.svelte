<script>
  import { onMount } from "svelte";
  import Matter from "matter-js";
  import { COLOR } from "$lib/macchina/constants.js";

  let canvas, ctx;
  let dpr = 1;
  let cssW = 0,
    cssH = 0;
  let engine, world;
  let wallL, wallR;
  let funnelWalls = [];
  let funnelFloor = null;
  let drainOpen = false;
  let svgEl = null;
  let phrasePool = [];
  let spawnTimer = 0;
  let overflowDrain = false;
  let lastFunnelTopY = null;
  let frameRect = null;
  let stepAcc = 0;

  const TARGET_BODIES = 100;
  const OVERFLOW_RESUME = 70;
  const FIXED_STEP = 1 / 120;
  const MAX_STEPS_PER_FRAME = 8;
  const MAX_DPR = 2;
  const GRAVITY = 0.8;
  const STUCK_SECONDS = 0.6;
  const STUCK_SPEED = 0.05;
  const VB = { x: 30, y: 60, w: 1220, h: 790 };
  const FONT_SVG_SIZE = 18;
  const WORD_PAD_X = 10;

  const WORD_W_MIN = 25;
  const WORD_H_MIN = 22;
  // On small screens the machine shrinks far below a legible text size
  const WORD_SCALE_MIN = 0.5;

  function vbScale() {
    const r = svgRect();
    return r ? r.width / VB.w : 1;
  }

  function wordScale() {
    return Math.max(vbScale(), WORD_SCALE_MIN);
  }

  function bodyBudget() {
    const k = (vbScale() / wordScale()) ** 2;
    return {
      target: Math.max(8, Math.round(TARGET_BODIES * k)),
      resume: Math.max(5, Math.round(OVERFLOW_RESUME * k)),
    };
  }

  const FUNNEL = [
    { x: 78.54, y: 65.49 },
    { x: 178.54, y: 366.59 },
    { x: 390.69, y: 366.59 },
    { x: 490.69, y: 65.49 },
  ];

  // During a tick the rect is read once and reused: calling
  // getBoundingClientRect per body per frame was a major source of jank.
  function svgRect() {
    if (frameRect) return frameRect;
    return svgEl ? svgEl.getBoundingClientRect() : null;
  }

  function svgToCanvas(sx, sy) {
    const r = svgRect();
    if (!r) return null;
    return {
      x: r.left + ((sx - VB.x) / VB.w) * r.width,
      y: r.top + ((sy - VB.y) / VB.h) * r.height,
    };
  }

  function funnelNeckY() {
    const p = svgToCanvas((FUNNEL[1].x + FUNNEL[2].x) / 2, FUNNEL[1].y);
    return p ? p.y : canvas ? canvas.height : 9999;
  }

  function funnelTopEdge() {
    const tl = svgToCanvas(FUNNEL[0].x, FUNNEL[0].y);
    const tr = svgToCanvas(FUNNEL[3].x, FUNNEL[3].y);
    return tl && tr ? { tl, tr } : null;
  }

  // ── wall helpers ────────────────────────────────────────────────
  function makeWallSeg(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2,
      cy = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    return Matter.Bodies.rectangle(cx, cy, len, 20, {
      isStatic: true,
      angle: ang,
      restitution: 0.05,
      friction: 0.8,
    });
  }

  function poseWallSeg(body, x1, y1, x2, y2) {
    Matter.Body.setPosition(body, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
    Matter.Body.setAngle(body, Math.atan2(y2 - y1, x2 - x1));
  }

  const FUNNEL_WALL_PAIRS = [
    [0, 1],
    [3, 2],
  ];
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
    [...funnelWalls, funnelFloor].forEach(
      (w) => w && Matter.Composite.remove(world, w),
    );
    funnelWalls = [];
    funnelFloor = null;
    drainOpen = false;
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

  let clipTop = 0;
  export function setClipTop(y) {
    clipTop = Math.max(0, y || 0);
  }

  export function prepopulate(phrases) {
    phrasePool = phrases;
  }

  let lang = "it";
  const oggettoFor = (p) =>
    (lang === "en" && p?.oggetto_en) || p?.oggetto || "·";

  // Relabels tiles already on screen: each tile keeps its phrase and word
  // index, so it takes the same word of the new label (resizing its box);
  // tiles with no counterpart (new label has fewer words) are dropped.
  export function setLang(l) {
    if (l === lang) return;
    lang = l;
    if (!world) return;
    const s = wordScale();
    for (const b of Matter.Composite.allBodies(world)) {
      if (b.isStatic || !b._phrase) continue;
      const txt = splitWords(oggettoFor(b._phrase))[b._idx];
      if (!txt) {
        Matter.Composite.remove(world, b);
        continue;
      }
      const w = wordWidth(txt, s);
      Matter.Body.scale(b, w / b._w, 1);
      b._w = w;
      b._txt = txt;
      if (b.isSleeping) Matter.Sleeping.set(b, false);
    }
  }

  // Box width follows the actual rendered text width (same font the word is
  // drawn with) instead of a random size unrelated to how long the word is —
  // short words get a short box, long words get a wide one.
  function wordWidth(txt, s) {
    if (!ctx) return WORD_W_MIN * s;
    ctx.font = `${FONT_SVG_SIZE * s}px Rubik, sans-serif`;
    const textW = ctx.measureText(txt).width;
    return Math.max(WORD_W_MIN * s, textW + WORD_PAD_X * s);
  }

  function spawnIsClear(cx, cy, w, h) {
    const bounds = {
      min: { x: cx - w / 2, y: cy - h / 2 },
      max: { x: cx + w / 2, y: cy + h / 2 },
    };
    return (
      Matter.Query.region(Matter.Composite.allBodies(world), bounds).length ===
      0
    );
  }

  // Multi-word phrases become one physical tile per word — falling side by
  // side, possibly separating — rather than a single wide box or a box with
  // wrapped lines. Keeps every tile in the same size range and reuses the
  // same spawn/clearance logic regardless of how many words came in.
  function splitWords(txt) {
    return String(txt).trim().split(/\s+/).filter(Boolean);
  }

  function spawnWordAt(txt, tl, tr, phrase, idx) {
    const s = wordScale();
    const w = wordWidth(txt, s);
    const h = WORD_H_MIN * s;
    const cx = tl.x + 8 + Math.random() * (tr.x - tl.x - 16);
    const cy = 0;
    if (!spawnIsClear(cx, cy, w, h)) return;
    const body = _addBody(cx, cy, w, h, txt, (Math.random() - 0.5) * 1.2, 0.5);
    body._phrase = phrase;
    body._idx = idx;
  }

  function _spawnOne() {
    if (!engine || !canvas || !phrasePool.length) return;
    spawn(phrasePool[Math.floor(Math.random() * phrasePool.length)]);
  }

  export function spawn(phrase) {
    if (!engine || !canvas) return;
    const edge = funnelTopEdge();
    if (!edge) return;
    const { tl, tr } = edge;
    splitWords(oggettoFor(phrase)).forEach((word, i) =>
      spawnWordAt(word, tl, tr, phrase, i),
    );
  }

  function _addBody(cx, cy, w, h, txt, vx, vy) {
    const body = Matter.Bodies.rectangle(cx, cy, w, h, {
      restitution: 0,
      friction: 0.85,
      frictionStatic: 0.6,
      frictionAir: 0.04,
      density: 0.002,
      sleepThreshold: 20,
      // Rounded corners keep tiles from interlocking into a stable arch
      // across the narrowing funnel throat.
      chamfer: { radius: Math.min(w, h) * 0.25, qualityMax: 2 },
    });
    body._w = w;
    body._h = h;
    body._txt = txt;
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);
    Matter.Composite.add(world, body);
    return body;
  }

  function antiJam(dt, neckY) {
    for (const b of Matter.Composite.allBodies(world)) {
      if (b.isStatic || b._w == null) continue;
      if (b.position.y + b._h / 2 > neckY) {
        b._stuckTime = 0;
        continue;
      }
      const speed =
        Matter.Vector.magnitude(b.velocity) + Math.abs(b.angularVelocity) * 10;
      if (speed < STUCK_SPEED) {
        b._stuckTime = (b._stuckTime || 0) + dt;
        if (b._stuckTime > STUCK_SECONDS) {
          if (b.isSleeping) Matter.Sleeping.set(b, false);
          Matter.Body.setVelocity(b, {
            x: (Math.random() - 0.5) * 2,
            y: 0.6,
          });
          Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.2);
          b._stuckTime = 0;
        }
      } else {
        b._stuckTime = 0;
      }
    }
  }

  // omega is the valve: open when spinning, closed when stopped
  function wordCount() {
    let n = 0;
    for (const b of Matter.Composite.allBodies(world)) {
      if (!b.isStatic && b._w != null) n++;
    }
    return n;
  }

  export function tick(dt, omega) {
    if (!engine || !ctx) return;
    frameRect = svgEl ? svgEl.getBoundingClientRect() : null;

    scrollAllBodies();
    syncFunnelPose();
    engine.gravity.y = GRAVITY;

    const spinning = Math.abs(omega) > 0.06;

    const count = wordCount();
    const { target, resume } = bodyBudget();
    if (!overflowDrain && count >= target) overflowDrain = true;
    else if (overflowDrain && count <= resume) overflowDrain = false;
    const wantOpen = spinning || overflowDrain;

    if (wantOpen && !drainOpen) {
      if (funnelFloor) {
        Matter.Composite.remove(world, funnelFloor);
        funnelFloor = null;
      }
      // Wake all sleeping bodies so they respond to the floor removal
      for (const b of Matter.Composite.allBodies(world)) {
        if (!b.isStatic) Matter.Sleeping.set(b, false);
      }
      drainOpen = true;
    } else if (!wantOpen && drainOpen) {
      _buildFloor();
      drainOpen = false;
    }

    const neckY = funnelNeckY();
    if (drainOpen) antiJam(dt, neckY);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      if (!overflowDrain && count < target) {
        const need = Math.min(target - count, 2);
        for (let i = 0; i < need; i++) _spawnOne();
      }
      spawnTimer = 0.22 + Math.random() * 0.15;
    }

    stepAcc += dt;
    let steps = 0;
    while (stepAcc >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      Matter.Engine.update(engine, FIXED_STEP * 1000);
      stepAcc -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) stepAcc = 0;
    if (drainOpen) {
      for (const b of Matter.Composite.allBodies(world)) {
        if (!b.isStatic && b._w != null && b.position.y + b._h / 2 > neckY) {
          Matter.Composite.remove(world, b);
        }
      }
    }

    draw();
    frameRect = null;
  }

  // Tile width already fits the text (wordWidth), so no per-tile clip is
  // needed; state is set once and each tile only swaps the transform.
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (clipTop >= cssH) return;
    ctx.save();
    if (clipTop > 0) {
      ctx.beginPath();
      ctx.rect(0, clipTop, cssW, cssH - clipTop);
      ctx.clip();
    }
    const s = wordScale();
    ctx.font = `${FONT_SVG_SIZE * s}px Rubik, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = Math.min(1, s);
    for (const b of Matter.Composite.allBodies(world)) {
      if (b.isStatic || b._w == null) continue;
      const { _w: w, _h: h, _txt: txt } = b;
      const cos = Math.cos(b.angle) * dpr;
      const sin = Math.sin(b.angle) * dpr;
      ctx.setTransform(cos, sin, -sin, cos, b.position.x * dpr, b.position.y * dpr);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      if (txt) {
        ctx.fillStyle = COLOR;
        ctx.fillText(txt, 0, 0);
      }
    }
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createWorld(W, H) {
    engine = Matter.Engine.create({ enableSleeping: true });
    // More solver iterations = stiffer stacks: default (6/4) lets resting
    // words visibly jitter/sink into each other while settling. Kept moderate
    engine.positionIterations = 12;
    engine.velocityIterations = 8;
    world = engine.world;
    engine.gravity.y = GRAVITY;
    wallL = Matter.Bodies.rectangle(-30, H / 2, 60, H * 3, { isStatic: true });
    wallR = Matter.Bodies.rectangle(W + 30, H / 2, 60, H * 3, {
      isStatic: true,
    });
    Matter.Composite.add(world, [wallL, wallR]);
    rebuildFunnel();
  }

  function repositionWalls(W, H) {
    if (!wallL) return;
    Matter.Body.setPosition(wallL, { x: -30, y: H / 2 });
    Matter.Body.setPosition(wallR, { x: W + 30, y: H / 2 });
    rebuildFunnel();
  }

  onMount(() => {
    ctx = canvas.getContext("2d");
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const W = Math.round(width),
        H = Math.round(height);
      if (!W || !H) return;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      cssW = W;
      cssH = H;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!engine) createWorld(W, H);
      else repositionWalls(W, H);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      if (engine) Matter.Engine.clear(engine);
    };
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
