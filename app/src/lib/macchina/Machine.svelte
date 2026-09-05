<script>
  import { onMount } from 'svelte';
  import {
    NS, COLOR, LETTERS, WHEELS, N_LET, PVT, K0, CRANK_R, CRANK_ANG,
    COLS_X, ROW0_Y, ROW_STP, BOX_W, BOX_H, D, CYL, CYL_PATH,
  } from './constants.js';

  let { svgContent = '', onCordPull, onCordRelease, elevated = false } = $props();

  let host;
  let svg, knobGrp;
  let wLetEls  = [[], [], []];
  let animLines = [];
  let readSlots = [];
  let drawerOvl;
  let boxCircles = [];
  let animDrawers  = [];
  let drawerRaf    = 0;
  let prevDrawerTs = 0;
  let prevGen = -1;
  let ready   = false;

  let cordPolyline, handleGrp;
  const CORD_REST_END = { x: 1161.36, y: 485.7 };
  const CORD_MAX_PULL = 360;
  const CORD_GUIDE = { x: CORD_REST_END.x, y: PVT.y };
  const CORD_REST_LEN = CORD_REST_END.y - CORD_GUIDE.y;
  const CORD_REST_ANGLE = Math.PI / 2; // straight down from the guide
  const CORD_MAX_SWING = Math.PI / 3; // ±60° either side of straight down
  const CORD_BOUNDS = { xMin: 30, xMax: 1250, yMin: 60, yMax: 1010 };
  const CORD_HANDLE_MARGIN = 40;

  function maxPullForAngle(angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    let maxR = Infinity;
    if (cosA > 1e-6) maxR = Math.min(maxR, (CORD_BOUNDS.xMax - CORD_HANDLE_MARGIN - CORD_GUIDE.x) / cosA);
    else if (cosA < -1e-6) maxR = Math.min(maxR, (CORD_BOUNDS.xMin + CORD_HANDLE_MARGIN - CORD_GUIDE.x) / cosA);
    if (sinA > 1e-6) maxR = Math.min(maxR, (CORD_BOUNDS.yMax - CORD_HANDLE_MARGIN - CORD_GUIDE.y) / sinA);
    else if (sinA < -1e-6) maxR = Math.min(maxR, (CORD_BOUNDS.yMin + CORD_HANDLE_MARGIN - CORD_GUIDE.y) / sinA);
    return Math.max(0, maxR - CORD_REST_LEN);
  }

  const CORD_ANGLE_MIN = Math.max(
    CORD_REST_ANGLE - CORD_MAX_SWING,
    Math.acos(Math.min(1, Math.max(-1, (CORD_BOUNDS.xMax - CORD_HANDLE_MARGIN - CORD_GUIDE.x) / CORD_REST_LEN))),
  );
  const CORD_ANGLE_MAX = Math.min(
    CORD_REST_ANGLE + CORD_MAX_SWING,
    Math.acos(Math.min(1, Math.max(-1, (CORD_BOUNDS.xMin + CORD_HANDLE_MARGIN - CORD_GUIDE.x) / CORD_REST_LEN))),
  );
  let cordAngle      = CORD_REST_ANGLE; 
  let cordPullOff    = 0;               
  let cordSpringRaf  = 0;
  let cordDragging   = false;
  let cordLastSvgX   = 0;
  let cordLastSvgY   = 0;
  let cordLastTs     = 0;
  let cordVelSvg     = 0;
  let springAngleFrom = CORD_REST_ANGLE;
  let springPullFrom  = 0;
  let springStartTs  = 0;

  const cordHandlePos = () => ({
    x: CORD_GUIDE.x + (CORD_REST_LEN + cordPullOff) * Math.cos(cordAngle),
    y: CORD_GUIDE.y + (CORD_REST_LEN + cordPullOff) * Math.sin(cordAngle),
  });

  const mk = (tag, attrs = {}, txt) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (txt !== undefined) n.textContent = txt;
    return n;
  };

  const svgPt = (cx, cy) => {
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };

  const svgVelToPx = v => v * (svg?.getBoundingClientRect().width ?? 800) / 1220;

  // ── Cord visual & interaction ────────────────────────────────────
  function updateCord(shakeX = 0) {
    const { x: hx, y: hy } = cordHandlePos();
    cordPolyline?.setAttribute('points',
      `${hx + shakeX} ${hy} ${CORD_GUIDE.x} ${CORD_GUIDE.y} ${PVT.x} ${PVT.y}`);
    handleGrp?.setAttribute('transform',
      `translate(${hx - CORD_REST_END.x + shakeX},${hy - CORD_REST_END.y})`);
  }

  function idleShakeX(ts) {
    const t = ts / 1000;
    return Math.sin(t * 1.4) * 8 + Math.sin(t * 3.3 + 2) * 3;
  }

  function cordSpringBack(ts) {
    if (!springStartTs) springStartTs = ts;
    const t = Math.min((ts - springStartTs) / 260, 1);
    const e = 1 - Math.pow(1 - t, 3);
    // slight overshoot past rest for a natural pendulum settle
    const overshoot = Math.sin(t * Math.PI) * 0.08 * (springAngleFrom - CORD_REST_ANGLE);
    cordAngle   = springAngleFrom + (CORD_REST_ANGLE - springAngleFrom) * e - overshoot;
    cordPullOff = springPullFrom * (1 - e);
    updateCord();
    if (t < 1) {
      cordSpringRaf = requestAnimationFrame(cordSpringBack);
    } else {
      cordAngle = CORD_REST_ANGLE; cordPullOff = 0; updateCord();
    }
  }

  function onCordDown(e) {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    cancelAnimationFrame(cordSpringRaf);
    springStartTs = 0;
    cordDragging  = true;
    const p = svgPt(e.clientX, e.clientY);
    cordLastSvgX = p.x;
    cordLastSvgY = p.y;
    cordLastTs   = e.timeStamp;
    cordVelSvg   = 0;
    svg.style.cursor = 'grabbing';
    onCordPull?.({ velocity: 0, deltaSvg: 0, pullOff: cordPullOff });
  }

  function onCordMove(e) {
    if (!cordDragging) return;
    const p  = svgPt(e.clientX, e.clientY);
    const dt = Math.max((e.timeStamp - cordLastTs) / 1000, 0.001);
    const moveSvg = Math.hypot(p.x - cordLastSvgX, p.y - cordLastSvgY);
    cordVelSvg   = moveSvg / dt;
    cordLastSvgX = p.x;
    cordLastSvgY = p.y;
    cordLastTs   = e.timeStamp;

    const dx = p.x - CORD_GUIDE.x;
    const dy = p.y - CORD_GUIDE.y;
    const angle = Math.max(CORD_ANGLE_MIN, Math.min(CORD_ANGLE_MAX, Math.atan2(dy, dx)));
    const dist = Math.hypot(dx, dy);
    const maxPull = Math.min(CORD_MAX_PULL, maxPullForAngle(angle));
    const pull = Math.max(0, Math.min(maxPull, dist - CORD_REST_LEN));

    const prevPull = cordPullOff;
    cordAngle   = angle;
    cordPullOff = pull;
    const deltaSvg = cordPullOff - prevPull;
    updateCord();
    onCordPull?.({ deltaSvg, velocity: Math.max(0, svgVelToPx(cordVelSvg)), pullOff: cordPullOff, angle: cordAngle });
  }

  function onCordUp() {
    if (!cordDragging) return;
    cordDragging = false;
    svg.style.cursor = '';
    if (handleGrp) handleGrp.style.cursor = 'grab';
    onCordRelease?.({ velocity: Math.max(0, svgVelToPx(cordVelSvg)) });
    cancelAnimationFrame(cordSpringRaf);
    springStartTs   = 0;
    springAngleFrom = cordAngle;
    springPullFrom  = cordPullOff;
    cordSpringRaf   = requestAnimationFrame(cordSpringBack);
  }

  // ── Called every rAF frame from the parent ──────────────────────
  export function update({ knobAng, wheelAng, scrollOff, machineState, activeSnap }) {
    if (!ready) return;

    if (!cordDragging) updateCord(idleShakeX(performance.now()));

    knobGrp?.setAttribute('transform',
      `rotate(${(knobAng * 180 / Math.PI) % 360},${PVT.x},${PVT.y})`);

    for (let wi = 0; wi < 3; wi++) {
      const w = WHEELS[wi];
      for (let j = 0; j < N_LET; j++) {
        const ang = -Math.PI / 2 + (j / N_LET) * 2 * Math.PI + wheelAng[wi];
        const cosA = Math.cos(ang);
        const el = wLetEls[wi][j];
        if (!el) continue;
        el.setAttribute('x', w.cx + w.rx * 0.8 * cosA);
        el.setAttribute('y', w.cy + w.ry * 0.8 * Math.sin(ang));
        el.style.display = wi < 2 && cosA < 0 ? 'none' : '';
      }
      // Re-sort letters by y descending so higher-on-screen letters render on top
      const g = wLetEls[wi][0]?.parentNode;
      if (g) {
        [...g.children]
          .sort((a, b) => parseFloat(b.getAttribute('y')) - parseFloat(a.getAttribute('y')))
          .forEach(el => g.appendChild(el));
      }
    }

    const CYL_H = CYL.b - CYL.t, N = animLines.length;
    animLines.forEach((ln, i) => {
      const raw = CYL.t + (i / N) * CYL_H + scrollOff % CYL_H;
      const y   = ((raw % CYL_H) + CYL_H) % CYL_H + CYL.t;
      ln.setAttribute('y1', y); ln.setAttribute('y2', y);
    });

    readSlots.forEach((slot, i) => {
      const snap = wheelAng[i];
      const li = machineState === 'idle' ? -1
               : machineState === 'open' ? activeSnap[i]
               : (((Math.round(N_LET / 4 - snap * N_LET / (2 * Math.PI)) % N_LET) + N_LET) % N_LET);
      slot.textContent = li < 0 ? '·' : LETTERS[li];
    });
  }

  // ── Drawer triad ─────────────────────────────────────────────────
  function highlightBoxes(pairs) {
    boxCircles.forEach(c => (c.style.fill = ''));
    for (const [row, col] of pairs) {
      const idx = row * N_LET + col;
      if (boxCircles[idx]) boxCircles[idx].style.fill = COLOR;
    }
  }

  export function setDrawers(gen, pairs, animate, texts = [], showCards = false) {
    if (!ready || !drawerOvl) return;
    if (gen === prevGen) return;
    prevGen = gen;

    drawerOvl.innerHTML = '';
    animDrawers = [];
    if (drawerRaf) { cancelAnimationFrame(drawerRaf); drawerRaf = 0; }
    svg.appendChild(drawerOvl); // keep drawerOvl as the last SVG child

    // During scroll: just color the existing SVG circles, no overlay
    if (!showCards) {
      highlightBoxes(pairs);
      return;
    }

    // Finalized: color circles for open drawers too
    highlightBoxes(pairs);
    if (!pairs.length) return;

    // Higher on screen (lower row+col) rendered last = on top
    const ordered = [...pairs]
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (b.p[0] + b.p[1]) - (a.p[0] + a.p[1]));

    // Instant path: no stagger, no tween
    if (!animate) {
      ordered.forEach(({ p: [row, col], i }) => {
        buildDrawer(COLS_X[col], ROW0_Y + row * ROW_STP, col, row, texts[i] ?? '', false);
      });
      return;
    }

    ordered.forEach(({ p: [row, col], i }) => {
      buildDrawer(COLS_X[col], ROW0_Y + row * ROW_STP, col, row, texts[i] ?? '', true);
    });
  }

  // Card stack: 7 cards offset upper-left → lower-right, matching macchina-02.svg
  const N_CARDS = 28, CARD_W = BOX_W - 4, CARD_H = 22, CARD_CD = 5;

  function addCards(fx, fy, _combo, phraseText, animate = true) {
    const baseCX = fx + (BOX_W - CARD_W) / 2;
    const baseCY = fy - CARD_H;
    // Cards rise from inside the drawer (offset by BOX_H down) to final position
    const riseFrom = BOX_H + CARD_H;
    for (let i = 0; i < N_CARDS; i++) {
      const ox = (N_CARDS - 1 - i) * CARD_CD;
      const oy = (N_CARDS - 1 - i) * CARD_CD;
      const cx = baseCX - ox, cy = baseCY - oy;
      const g = mk('g');
      const card = mk('rect', {
        x: cx, y: cy, width: CARD_W, height: CARD_H,
        fill: 'white', stroke: COLOR, 'stroke-width': '1.5',
      });
      g.appendChild(card);
      if (i === N_CARDS - 1 && phraseText) {
        const phr = mk('text', {
          x: cx + CARD_W / 2, y: cy + CARD_H / 2 + 1,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: COLOR, 'font-family': 'Freight, serif', 'font-size': '9', 'font-weight': 'bold',
        }, phraseText.substring(0, 14));
        g.appendChild(phr);
      }
      if (animate) {
        const delay = (i * 0.04).toFixed(3);
        const anim = mk('animateTransform', {
          attributeName: 'transform', type: 'translate',
          values: `0 ${riseFrom}; 0 0`,
          keyTimes: '0; 1',
          dur: '0.28s', calcMode: 'spline',
          keySplines: '0.25 0.46 0.45 0.94',
          fill: 'freeze', begin: `${delay}s`,
        });
        g.appendChild(anim);
      }
      drawerOvl.appendChild(g);
    }
  }

  function buildDrawer(x, y, ci, ri, phraseText, animate = true) {
    const combo   = LETTERS[ri] + '·' + LETTERS[ci];
    const poly    = mk('polygon', { fill: 'white', stroke: COLOR, 'stroke-width': '1.5' });
    const depthLn = mk('line',    { stroke: COLOR, 'stroke-width': '1.5' });
    const frontRct = mk('rect',   { x, y, width: BOX_W, height: BOX_H, fill: 'white', stroke: COLOR, 'stroke-width': '1.5', style: 'fill: white !important' });
    const frontDot = mk('circle', { r: '5.8', class: 'st3 cls-3' });
    drawerOvl.appendChild(poly);
    drawerOvl.appendChild(depthLn);
    drawerOvl.appendChild(frontRct);
    drawerOvl.appendChild(frontDot);

    if (!animate) {
      applyOffset(x, y, D, poly, depthLn, frontRct, frontDot);
      addCards(x + D, y + D, combo, phraseText, false);
      return;
    }

    animDrawers.push({ x, y, combo, phraseText, poly, depthLn, frontRct, frontDot, t: 0, cardsAdded: false });
    if (!drawerRaf) { prevDrawerTs = 0; drawerRaf = requestAnimationFrame(tickDrawers); }
  }

  function applyOffset(x, y, o, poly, depthLn, frontRct, frontDot) {
    poly.setAttribute('points', [
      `${x},${y+BOX_H}`, `${x+o},${y+BOX_H+o}`, `${x+BOX_W+o},${y+BOX_H+o}`,
      `${x+BOX_W+o},${y+o}`, `${x+BOX_W},${y}`, `${x},${y}`,
    ].join(' '));
    depthLn.setAttribute('x1', x+o); depthLn.setAttribute('y1', y+o);
    depthLn.setAttribute('x2', x);   depthLn.setAttribute('y2', y);
    frontRct.setAttribute('x', x+o); frontRct.setAttribute('y', y+o);
    frontDot.setAttribute('cx', x + o + BOX_W / 2);
    frontDot.setAttribute('cy', y + o + BOX_H / 2);
  }

  function tickDrawers(ts) {
    const dt = prevDrawerTs ? Math.min((ts - prevDrawerTs) / 1000, 0.1) : 0;
    prevDrawerTs = ts;
    animDrawers = animDrawers.filter(d => {
      d.t = Math.min(d.t + dt / 0.38, 1);
      const e = 1 - Math.pow(1 - d.t, 3);
      applyOffset(d.x, d.y, e * D, d.poly, d.depthLn, d.frontRct, d.frontDot);
      if (d.t >= 1 && !d.cardsAdded) {
        d.cardsAdded = true;
        addCards(d.x + D, d.y + D, d.combo, d.phraseText);
      }
      return d.t < 1;
    });
    if (animDrawers.length) drawerRaf = requestAnimationFrame(tickDrawers);
    else { drawerRaf = 0; prevDrawerTs = 0; }
  }

  function buildOverlays() {
    const defs  = svg.querySelector('defs');
    const mechG = svg.querySelector('#mechanism');
    if (!defs || !mechG) return;

    const cpCyl = mk('clipPath', { id: 'clipCyl' });
    cpCyl.appendChild(mk('path', { d: CYL_PATH }));
    defs.appendChild(cpCyl);

    // Wider clip for letter groups: tube body + full outer-wheel face ellipse
    const cpLetters = mk('clipPath', { id: 'clipLetters' });
    cpLetters.appendChild(mk('path', { d: CYL_PATH }));
    cpLetters.appendChild(mk('ellipse', { cx: '577', cy: `${CYL.cy}`, rx: '48', ry: '86' }));
    defs.appendChild(cpLetters);

    const barrelGrp = mechG.querySelector(':scope > g');
    barrelGrp?.querySelectorAll('line').forEach(l => (l.style.opacity = '0'));

    // Scroll lines behind wheel bodies (inserted right after barrel group)
    const scrollGrp = mk('g', { 'clip-path': 'url(#clipCyl)' });
    const CYL_H = CYL.b - CYL.t;
    for (let i = 0; i < 12; i++) {
      const y  = CYL.t + (i / 12) * CYL_H;
      const ln = mk('line', { x1: CYL.l - 100, y1: y, x2: CYL.r, y2: y,
        stroke: COLOR, 'stroke-width': '2', 'stroke-miterlimit': '10' });
      scrollGrp.appendChild(ln);
      animLines.push(ln);
    }
    mechG.insertBefore(scrollGrp, barrelGrp?.nextSibling ?? null);

    knobGrp = Array.from(mechG.querySelectorAll(':scope > g'))
      .find(g => g.querySelector('polyline'));

    for (let wi = 0; wi < 3; wi++) {
      const g  = mk('g', { id: `wr${wi}`, 'clip-path': 'url(#clipLetters)' });
      const fs = [11, 9, 7][wi];
      for (let j = 0; j < N_LET; j++) {
        const tx = mk('text', {
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: COLOR, 'font-family': 'Freight, serif', 'font-size': fs, 'font-weight': 'bold',
        }, LETTERS[j]);
        g.appendChild(tx);
        wLetEls[wi].push(tx);
      }
      svg.appendChild(g); // svg root so letters are always above mechG content
    }

    if (knobGrp) mechG.appendChild(knobGrp);

    const gLbl = mk('g', { id: 'grid-labels' });
    LETTERS.forEach((letter, i) => {
      gLbl.appendChild(mk('text', {
        x: COLS_X[i] + BOX_W / 2, y: ROW0_Y - 10,
        'text-anchor': 'middle', fill: COLOR,
        'font-family': 'Freight, serif', 'font-size': '15', 'font-weight': 'normal',
      }, letter));
      gLbl.appendChild(mk('text', {
        x: COLS_X[0] - 20, y: ROW0_Y + i * ROW_STP + BOX_H / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: COLOR,
        'font-family': 'Freight, serif', 'font-size': '15', 'font-weight': 'normal',
      }, letter));
    });
    svg.querySelector('#boxes')?.insertAdjacentElement('afterend', gLbl);

    boxCircles = Array.from(svg.querySelectorAll('#boxes circle'));

    drawerOvl = mk('g', { id: 'dovl' });
    svg.appendChild(drawerOvl);

    // ── Cord interaction (new SVG has polyline + handle path in mechG) ──
    cordPolyline = mechG.querySelector(':scope > polyline');
    const directPaths = Array.from(mechG.querySelectorAll(':scope > path'));
    const handlePath = directPaths.find((p) => {
      const d = p.getAttribute('d') || '';
      // Keep this tolerant: users tweak SVG numbers often.
      return /v-\s*37(\.\d+)?/i.test(d) || /h-\s*9(\.\d+)?/i.test(d) || /1162(\.\d+)?[, ]/i.test(d);
    }) || directPaths[0] || null;

    if (cordPolyline) {
      cordPolyline.setAttribute('pointer-events', 'stroke');
      if (!cordPolyline.getAttribute('stroke-width')) {
        cordPolyline.setAttribute('stroke-width', '18');
      }
      if (!cordPolyline.getAttribute('stroke')) {
        cordPolyline.setAttribute('stroke', 'transparent');
      }
      cordPolyline.style.cursor = 'grab';
      cordPolyline.addEventListener('pointerdown', onCordDown);
    }

    if (cordPolyline && handlePath) {
      handleGrp = mk('g', { style: 'cursor:grab' });
      handlePath.parentNode.insertBefore(handleGrp, handlePath);
      handleGrp.appendChild(handlePath);
      handlePath.setAttribute('pointer-events', 'all');
      handleGrp.addEventListener('pointerdown', onCordDown);
    }

    // Pointer tracking is attached once regardless of handle detection.
    svg.style.touchAction = 'none';
    svg.addEventListener('pointermove',   onCordMove);
    svg.addEventListener('pointerup',     onCordUp);
    svg.addEventListener('pointercancel', onCordUp);
  }

  export function getSvg() { return svg; }


  const VIEWBOX_TOP = 60;
  const VIEWBOX_BOTTOM_PAD = -100;
  const VIEWBOX_H = ROW0_Y + (N_LET - 1) * ROW_STP + BOX_H + D + VIEWBOX_BOTTOM_PAD - VIEWBOX_TOP;

  onMount(() => {
    svg = host.querySelector('svg');
    if (!svg) return;
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('viewBox', `30 ${VIEWBOX_TOP} 1220 ${VIEWBOX_H}`);
    buildOverlays();
    ready = true;
    return () => {
      if (drawerRaf)     cancelAnimationFrame(drawerRaf);
      if (cordSpringRaf) cancelAnimationFrame(cordSpringRaf);
    };
  });
</script>

<div bind:this={host} class="w-full h-full relative" class:z-[3]={elevated}>
  {@html svgContent}
</div>

<style>
  :global(svg) { width: 100%; height: 100%; display: block; }
</style>
