import { lineLength, chaikin, createPathLUT } from "./path.js";
import {
  LABEL_COLOR,
  chapterSpeedMultiplier,
  kernedCharWidths,
  getGlyph,
  renderCharsIntoGfx,
} from "./glyphs.js";

const TARGET_LONG = 1400;

export function createSketch(ctx) {
  return (p) => {
    let W = Math.round((TARGET_LONG * 3) / 4),
      H = TARGET_LONG;
    let contentOffX = 0,
      contentOffY = 0,
      contentW = W,
      contentH = H;

    let segments = [],
      chapterRanges = new Map(),
      chapterPts = new Map(),
      totalLength = 0;
    let lut = null;
    let islandCx = 0,
      islandCy = 0;
    let bgImage = null,
      contoursGfx = null,
      labelsGfx = null,
      titlesGfx = null;
    let chapterData = new Map(),
      chapterTitlePills = [];

    let prev = {
      category: null,
      chapter: null,
      minValue: -1,
      fontSize: -1,
      titleFontSize: -1,
      titlePerp: -1,
      showContext: null,
      showImage: null,
      animate: null,
      displayMode: null,
      geoVersion: -1,
      oneLinePerChapter: null,
      imgA: 1,
      ctrA: 1,
      revealUpTo: null,
      labA: 1,
      legend: "",
      resetAnim: -1,
      contrast: 4,
      brightness: 2.0,
    };
    let layoutDirty = true,
      visibilityDirty = true,
      needsRedraw = true,
      animOffset = 0;

    // ── lifecycle ─────────────────────────────────────────────────────────

    p.preload = () => {
      bgImage = p.loadImage(
        "/data/image.jpg",
        () => {},
        () => {
          bgImage = null;
        },
      );
    };

    p.setup = () => {
      const TL = ctx.targetLong ?? TARGET_LONG;
      W = Math.round((TL * 3) / 4);
      H = TL;
      p.createCanvas(W, H);
      p.frameRate(60);
      buildSuperPath();
      buildChapterTitleData();
      buildContoursGfx();
    };

    // ── path construction ─────────────────────────────────────────────────

    function buildSuperPath() {
      const d = ctx.contoursData;
      const TL = ctx.targetLong ?? TARGET_LONG;

      const newW = Math.round((TL * 3) / 4);
      const newH = TL;
      if (newW !== W || newH !== H) {
        W = newW;
        H = newH;
        p.resizeCanvas(W, H);
      }

      const dw = Number(d?.width || TL),
        dh = Number(d?.height || newH);
      const scale = Math.min(W / dw, H / dh);
      contentW = Math.round(dw * scale);
      contentH = Math.round(dh * scale);
      contentOffX = Math.round((W - contentW) / 2);
      contentOffY = Math.round((H - contentH) / 2);

      segments = [];
      chapterRanges = new Map();
      chapterPts = new Map();
      totalLength = 0;

      const hasPathOrder = (d?.lines ?? []).some((l) => l.pathOrder != null);
      const allLines = [...(d?.lines ?? [])].sort((a, b) => {
        if (hasPathOrder) return (a.pathOrder ?? 0) - (b.pathOrder ?? 0);
        if (b.targetLevelIndex !== a.targetLevelIndex)
          return b.targetLevelIndex - a.targetLevelIndex;
        if (a.touchesBorder !== b.touchesBorder)
          return a.touchesBorder ? 1 : -1;
        return b.length - a.length;
      });

      const chCount = Number(d?.chapterCount || 40);

      if (ctx.ui.oneLinePerChapter) {
        const bestByChapter = new Map();
        for (const line of allLines)
          if (line.chapter != null && !bestByChapter.has(line.chapter))
            bestByChapter.set(line.chapter, line);

        for (const ch of [...bestByChapter.keys()].sort((a, b) => a - b)) {
          let pts = chaikin(
            bestByChapter
              .get(ch)
              .points.map(([x, y]) => [
                Number(x) * scale + contentOffX,
                Number(y) * scale + contentOffY,
              ]),
          );
          if (pts.length < 2) continue;
          const [fx, fy] = pts[0],
            [lx, ly] = pts[pts.length - 1];
          if (Math.hypot(lx - fx, ly - fy) > 0.5) pts = [...pts, pts[0]];
          const len = lineLength(pts);
          chapterRanges.set(ch, {
            start: totalLength,
            end: totalLength + len,
            length: len,
          });
          chapterPts.set(ch, pts);
          segments.push({ pts, start: totalLength, length: len });
          totalLength += len;
        }
      } else {
        for (const line of allLines) {
          const pts = chaikin(
            line.points.map(([x, y]) => [
              Number(x) * scale + contentOffX,
              Number(y) * scale + contentOffY,
            ]),
          );
          if (pts.length < 2) continue;
          const len = lineLength(pts);
          segments.push({ pts, start: totalLength, length: len });
          totalLength += len;
        }
        const chunkSize = chCount > 0 ? totalLength / chCount : 0;
        for (let i = 0; i < chCount; i++)
          chapterRanges.set(i + 1, {
            start: i * chunkSize,
            end: (i + 1) * chunkSize,
            length: chunkSize,
          });
      }

      lut = createPathLUT(segments, totalLength);

      let sx = 0,
        sy = 0,
        n = 0;
      for (const { pts } of segments)
        for (const [x, y] of pts) {
          sx += x;
          sy += y;
          n++;
        }
      islandCx = n > 0 ? sx / n : W / 2;
      islandCy = n > 0 ? sy / n : H / 2;
    }

    // ── chapter title anchors ─────────────────────────────────────────────

    function buildChapterTitleData() {
      chapterTitlePills = [];
      const titleMap = new Map();
      for (const m of ctx.data?.menzioni ?? [])
        if (!titleMap.has(m.capitolo) && m.titolo_capitolo)
          titleMap.set(m.capitolo, m.titolo_capitolo.toUpperCase());

      const FS = ctx.ui.titleFontSize ?? 6;
      const TITLE_PERP = ctx.ui.titlePerp ?? 14;

      for (const [chapter, range] of chapterRanges) {
        const title = titleMap.get(chapter);
        if (!title || range.length <= 0) continue;

        const layout = kernedCharWidths(p, FS, title);
        const halfW = layout.total / 2;
        const scanStart = range.start + halfW;
        const scanEnd = range.end - halfW;
        let anchorD = range.start + range.length * 0.5,
          skipTitle = false;

        if (scanEnd > scanStart) {
          let bestScore = -Infinity,
            bestAngle = Infinity;
          for (let s = 0; s <= 80; s++) {
            const d = scanStart + (s / 80) * (scanEnd - scanStart);
            let straddles = false;
            for (const seg of segments) {
              const b = seg.start + seg.length;
              if (b > d - halfW && b < d + halfW) {
                straddles = true;
                break;
              }
            }
            if (straddles) continue;
            const posA = lut.point(d - halfW),
              posB = lut.point(d + halfW);
            let dAngle = Math.abs(
              Math.atan2(posB.sin, posB.cos) - Math.atan2(posA.sin, posA.cos),
            );
            if (dAngle > Math.PI) dAngle = 2 * Math.PI - dAngle;
            const score = lut.point(d).y - dAngle * 400;
            if (score > bestScore) {
              bestScore = score;
              anchorD = d;
              bestAngle = dAngle;
            }
          }
          if (bestScore === -Infinity || bestAngle > 0.8) skipTitle = true;
        }
        if (skipTitle) continue;

        const pillStart = anchorD - halfW;
        const pillEnd = anchorD + halfW;

        // Pre-reverse chars when path goes left so they read correctly L→R on screen.
        // drawWord will then flip cos/sin per-char to keep glyphs upright.
        const goesLeft = lut.point(anchorD).cos < 0;
        const adjustedLayout = goesLeft
          ? {
              chars: [...layout.chars].reverse(),
              widths: [...layout.widths].reverse(),
              total: layout.total,
            }
          : layout;

        chapterTitlePills.push({
          chapter,
          pillStart,
          pillEnd,
          tp: TITLE_PERP,
          FS,
          layout: adjustedLayout,
        });
      }
    }

    // ── graphics buffers ──────────────────────────────────────────────────

    function buildContoursGfx() {
      try {
        contoursGfx?.remove();
      } catch (_) {}
      contoursGfx = p.createGraphics(W, H);
      contoursGfx.clear();
      contoursGfx.noFill();
      contoursGfx.stroke("#cacaca");
      contoursGfx.strokeWeight(0.5);
      contoursGfx.strokeCap(p.SQUARE);
      contoursGfx.strokeJoin(p.MITER);
      for (const { pts } of segments) {
        contoursGfx.beginShape();
        for (const [x, y] of pts) contoursGfx.vertex(x, y);
        contoursGfx.endShape();
      }
    }

    function buildLabelsGfx() {
      const next = p.createGraphics(W, H);
      next.clear();
      const chFilter = ctx.ui.chapter;
      const revUp = ctx.revealUpTo ?? null;
      const all = [];
      for (const [chapter, { chars }] of chapterData) {
        const show =
          revUp !== null
            ? chapter <= revUp
            : chFilter === "all" || chapter === Number(chFilter);
        if (!show) continue;
        for (const c of chars) all.push(c);
      }
      renderCharsIntoGfx(next, all, ctx.ui.fontSize, p.pixelDensity());
      const old = labelsGfx;
      labelsGfx = next;
      try {
        old?.remove();
      } catch (_) {}
    }

    function buildTitlesGfx() {
      const next = p.createGraphics(W, H);
      next.clear();
      const chFilter = ctx.ui.chapter;
      const pd = p.pixelDensity();
      const dc = next.drawingContext;

      for (const {
        chapter: ch,
        pillStart,
        pillEnd,
        tp,
        FS,
        layout,
      } of chapterTitlePills) {
        const revUp = ctx.revealUpTo ?? null;
        const active =
          revUp !== null ? true : chFilter === "all" || ch === Number(chFilter);
        const labA = active ? 1 : 0.2;
        const color = active ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.6)";
        const fakeRange = { start: pillStart, length: pillEnd - pillStart };
        drawWord(dc, pd, labA, layout, 0, fakeRange, pillEnd - pillStart, {
          perpOffset: tp,
          fontSize: FS,
          color,
          flipLeft: true,
          forceShowPill: true,
          pillShadow: false,
        });
      }

      dc.setTransform(pd, 0, 0, pd, 0, 0);
      const old = titlesGfx;
      titlesGfx = next;
      try {
        old?.remove();
      } catch (_) {}
    }

    function reloadImage() {
      const suffix = ctx.ui.dataset === "default" ? "" : ctx.ui.dataset;
      bgImage = null;
      p.loadImage(
        `/data/image${suffix}.jpg`,
        (img) => {
          bgImage = img;
          needsRedraw = true;
        },
        () => {
          bgImage = null;
        },
      );
    }

    // ── label layout ──────────────────────────────────────────────────────

    function computeChapterLayout() {
      chapterData.clear();
      const {
        category: cat,
        minValue: threshold,
        fontSize,
        showContext,
      } = ctx.ui;
      const byChapter = {};

      for (const item of ctx.data?.menzioni ?? []) {
        const label = String(item.oggetto || item.testo || "").trim();
        if (!label) continue;
        const chapter = Number(item.capitolo);
        if (!Number.isFinite(chapter)) continue;
        const cats = item.categorie || {};
        const val =
          cat === "all"
            ? Math.max(0, ...Object.values(cats).map(Number))
            : Number(cats[cat] || 0);
        if (val < threshold) continue;
        (byChapter[chapter] ??= []).push({ label, contesto: item.testo || "" });
      }

      p.textFont("Freight");
      p.textSize(fontSize);
      const sidePad = 0.5;
      const MIN_GAP = fontSize * 1.2;

      for (const [chStr, items] of Object.entries(byChapter)) {
        const chapter = Number(chStr);
        const range = chapterRanges.get(chapter);
        if (!range || range.length <= 0) continue;

        const usable = Math.max(0, range.length - sidePad * 2);
        const texts = items.map(({ label, contesto }) =>
          showContext && contesto ? contesto : label,
        );
        const allLayouts = texts.map((text) =>
          kernedCharWidths(p, fontSize, text),
        );

        const fitting = [];
        let usedW = 0;
        for (let i = 0; i < allLayouts.length; i++) {
          const w = allLayouts[i].total;
          const need = fitting.length === 0 ? w : MIN_GAP + w;
          if (usedW + need <= usable) {
            fitting.push({ layout: allLayouts[i], w });
            usedW += need;
          }
        }
        if (!fitting.length && allLayouts.length)
          fitting.push({ layout: allLayouts[0], w: allLayouts[0].total });

        const totalFitting = fitting.reduce((s, f) => s + f.w, 0);
        const gap =
          fitting.length > 1
            ? Math.max(MIN_GAP, (usable - totalFitting) / (fitting.length - 1))
            : 0;

        let cursor = range.start + sidePad;
        const chars = [];
        const words = [];
        for (const { layout } of fitting) {
          if (cursor >= range.end - sidePad) break;
          const { chars: chs, widths: cws } = layout;
          words.push({
            relStart: cursor - range.start,
            total: layout.total,
            layout,
          });
          let charCursor = cursor;
          for (let ci = 0; ci < chs.length; ci++) {
            const mid = charCursor + cws[ci] / 2;
            if (mid >= range.end - sidePad) break;
            const pos = lut.point(mid);
            chars.push({
              char: chs[ci],
              x: pos.x,
              y: pos.y,
              cos: pos.cos,
              sin: pos.sin,
              pathPos: mid,
            });
            charCursor += cws[ci];
          }
          cursor += layout.total + gap;
        }

        chapterData.set(chapter, { chars, layouts: allLayouts, words });
      }
    }

    // ── word rendering ────────────────────────────────────────────────────

    function drawWord(
      dc,
      pd,
      labA,
      layout,
      posOnPath,
      range,
      L,
      {
        perpOffset = 0,
        fontSize = ctx.ui.fontSize,
        color = LABEL_COLOR,
        flipLeft = false,
        forceShowPill = false,
        pillShadow = null,
        wrap = false,
      } = {},
    ) {
      if (posOnPath < 0 || (!wrap && posOnPath + layout.total > L)) return;
      if (wrap && posOnPath >= L) return;
      const { showPill, shadowTarget } = ctx.ui;
      const effectiveShowPill = forceShowPill || (showPill ?? true);
      const glyphShadow = shadowTarget === "letters";
      const effectivePillShadow = pillShadow ?? shadowTarget === "pill";

      // visibleChunk: how many pixels (from leading edge) of the word are shown
      const fadeZone = layout.total * 0.5;
      let visibleChunk = layout.total;
      if (wrap) {
        const entryT = posOnPath < fadeZone ? posOnPath / fadeZone : 1;
        const exitDist = L - (posOnPath + layout.total);
        const exitT = exitDist < fadeZone ? Math.max(0, exitDist / fadeZone) : 1;
        visibleChunk = Math.min(entryT, exitT) * layout.total;
      }

      dc.globalAlpha = labA;
      dc.setTransform(pd, 0, 0, pd, 0, 0);

      if (effectiveShowPill) {
        const pillEnd = Math.min(posOnPath + visibleChunk, L);
        const pillLen = pillEnd - posOnPath;
        if (pillLen > 0) {
          const pillSteps = Math.max(2, Math.ceil(pillLen / 6));
          dc.lineCap = "round";
          dc.lineJoin = "round";
          dc.beginPath();
          let _p = null;
          for (let s = 0; s <= pillSteps; s++) {
            const pathPos = posOnPath + (s / pillSteps) * pillLen;
            const pt = lut.point(range.start + pathPos);
            const px = pt.x - pt.sin * perpOffset;
            const py = pt.y + pt.cos * perpOffset;
            const jump = _p && Math.hypot(px - _p.x, py - _p.y) > 80;
            s === 0 || jump ? dc.moveTo(px, py) : dc.lineTo(px, py);
            _p = { x: px, y: py };
          }
          if (effectivePillShadow) {
            dc.strokeStyle = "#ccc";
            dc.lineWidth = fontSize * 0.9 + 2;
            dc.stroke();
          }
          dc.strokeStyle = "white";
          dc.lineWidth = fontSize * 0.9;
          dc.stroke();
        }
      }

      let off = 0;
      for (let ci = 0; ci < layout.chars.length; ci++) {
        const localPos = posOnPath + off + layout.widths[ci] / 2;
        if (off + layout.widths[ci] / 2 >= visibleChunk) break;
        if (localPos >= L) break;
        const pt = lut.point(range.start + localPos);
        const x = pt.x - pt.sin * perpOffset;
        const y = pt.y + pt.cos * perpOffset;
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) {
          off += layout.widths[ci];
          continue;
        }
        const flip = flipLeft && pt.cos < 0;
        const cos = flip ? -pt.cos : pt.cos;
        const sin = flip ? -pt.sin : pt.sin;
        const g = getGlyph(layout.chars[ci], fontSize, pd, color, glyphShadow);
        dc.globalAlpha = labA;
        dc.setTransform(
          pd * cos,
          pd * sin,
          -pd * sin,
          pd * cos,
          pd * x,
          pd * y,
        );
        dc.drawImage(g.oc, -g.dw / 2, -g.dh / 2, g.dw, g.dh);
        off += layout.widths[ci];
      }
    }

    // ── draw loop ─────────────────────────────────────────────────────────

    p.draw = () => {
      const geo = ctx.geoVersion;
      if (geo !== prev.geoVersion) {
        prev.geoVersion = geo;
        buildSuperPath();
        buildChapterTitleData();
        buildContoursGfx();
        reloadImage();
        layoutDirty = true;
        visibilityDirty = true;
        needsRedraw = true;
      }

      const {
        category,
        chapter,
        minValue,
        fontSize,
        titleFontSize,
        titlePerp,
        showContext,
        animate,
        showImage,
        showContours,
        showTitles,
        oneLinePerChapter,
        displayMode,
      } = ctx.ui;

      if (oneLinePerChapter !== prev.oneLinePerChapter) {
        buildSuperPath();
        buildChapterTitleData();
        buildContoursGfx();
        layoutDirty = true;
        visibilityDirty = true;
        needsRedraw = true;
      }
      if (
        titleFontSize !== prev.titleFontSize ||
        titlePerp !== prev.titlePerp
      ) {
        buildChapterTitleData();
        visibilityDirty = true;
        needsRedraw = true;
      }
      if (
        category !== prev.category ||
        minValue !== prev.minValue ||
        fontSize !== prev.fontSize ||
        showContext !== prev.showContext
      )
        layoutDirty = true;
      if (
        chapter !== prev.chapter ||
        animate !== prev.animate ||
        displayMode !== prev.displayMode
      )
        visibilityDirty = true;

      const revealUpTo = ctx.revealUpTo ?? null;
      if (revealUpTo !== prev.revealUpTo) {
        const modeChanged =
          (revealUpTo === null) !== (prev.revealUpTo === null);
        prev.revealUpTo = revealUpTo;
        if (modeChanged) visibilityDirty = true;
        else needsRedraw = true;
      }
      if (showImage !== prev.showImage) needsRedraw = true;
      if ((ctx.ui.contrast ?? 1.5) !== prev.contrast) {
        prev.contrast = ctx.ui.contrast ?? 1.5;
        needsRedraw = true;
      }
      if ((ctx.ui.brightness ?? 1.0) !== prev.brightness) {
        prev.brightness = ctx.ui.brightness ?? 1.0;
        needsRedraw = true;
      }

      const imgA = ctx.imageAlpha ?? 1;
      const ctrA = ctx.contoursAlpha ?? 1;
      const labA = ctx.labelsAlpha ?? 1;
      const legend = ctx.legend ?? "";
      if (imgA !== prev.imgA || ctrA !== prev.ctrA) {
        prev.imgA = imgA;
        prev.ctrA = ctrA;
        needsRedraw = true;
      }
      if (labA !== prev.labA) {
        prev.labA = labA;
        needsRedraw = true;
      }
      if (legend !== prev.legend) {
        prev.legend = legend;
        needsRedraw = true;
      }

      Object.assign(prev, {
        category,
        chapter,
        minValue,
        fontSize,
        titleFontSize,
        titlePerp,
        showContext,
        animate,
        showImage,
        oneLinePerChapter,
        displayMode,
      });

      if (layoutDirty) {
        computeChapterLayout();
        layoutDirty = false;
        if (!animate) buildLabelsGfx();
        needsRedraw = true;
      }
      if (visibilityDirty) {
        buildTitlesGfx();
        if (!animate) buildLabelsGfx();
        visibilityDirty = false;
        needsRedraw = true;
      }
      const resetAnim = ctx.resetAnim ?? 0;
      if (resetAnim !== prev.resetAnim) {
        prev.resetAnim = resetAnim;
        animOffset = 0;
      }
      if (animate) {
        animOffset = (animOffset + ctx.ui.speed) % 1e9; //faster speed
        needsRedraw = true;
        p.frameRate(30);
      } else {
        p.frameRate(10);
      }

      if (!needsRedraw) return;
      needsRedraw = false;

      p.background(255);

      if (showImage && bgImage) {
        const dc = p.drawingContext;
        dc.save();
        dc.globalAlpha = imgA;
        dc.filter = `grayscale(1) contrast(${ctx.ui.contrast ?? 1.5}) brightness(${ctx.ui.brightness ?? 1.0})`;
        dc.drawImage(
          bgImage.elt ?? bgImage.canvas,
          contentOffX,
          contentOffY,
          contentW,
          contentH,
        );
        dc.restore();
        dc.filter = "none";
      }

      if (showContours) {
        if (revealUpTo === null && chapter === "all" && contoursGfx) {
          if (ctrA < 1) p.tint(255, Math.round(255 * ctrA));
          p.image(contoursGfx, 0, 0);
          if (ctrA < 1) p.noTint();
        } else {
          const maxCh =
            revealUpTo !== null
              ? revealUpTo
              : chapter !== "all"
                ? Number(chapter)
                : null;
          if (maxCh !== null) {
            const dc = p.drawingContext;
            const pd = p.pixelDensity();
            dc.save();
            dc.setTransform(pd, 0, 0, pd, 0, 0);
            dc.globalAlpha = ctrA;
            dc.strokeStyle = "#cacaca";
            dc.lineWidth = 0.5;
            dc.lineCap = "square";
            dc.lineJoin = "miter";
            for (let c = 1; c <= maxCh; c++) {
              const pts = chapterPts.get(c);
              if (!pts) continue;
              dc.beginPath();
              for (let i = 0; i < pts.length; i++)
                i === 0
                  ? dc.moveTo(pts[i][0], pts[i][1])
                  : dc.lineTo(pts[i][0], pts[i][1]);
              dc.stroke();
            }
            dc.restore();
          }
        }
      }

      const pd = p.pixelDensity();
      const dc = p.drawingContext;

      if (showTitles && titlesGfx) {
        if (ctrA < 1) p.tint(255, Math.round(255 * ctrA));
        p.image(titlesGfx, 0, 0);
        if (ctrA < 1) p.noTint();
      }

      if (animate) {
        if (displayMode === "flow") {
          const SLOTS = Math.max(1, ctx.ui.flowDensity ?? 1);
          for (const [ch, { layouts }] of chapterData) {
            const show =
              revealUpTo !== null
                ? ch <= revealUpTo
                : chapter === "all" || ch === Number(chapter);
            if (!show || !layouts.length) continue;
            const range = chapterRanges.get(ch);
            if (!range || range.length <= 0) continue;
            const L = range.length;
            const N = layouts.length;
            const chapterOffset = animOffset * chapterSpeedMultiplier(ch);
            const CYCLE = L;
            for (let slot = 0; slot < SLOTS; slot++) {
              const phaseOffset = ch * 271.119 + slot * (CYCLE / SLOTS);
              const posRaw = (chapterOffset + phaseOffset) % CYCLE;
              const traversal = Math.floor(
                (chapterOffset + phaseOffset) / CYCLE,
              );
              const wordIdx =
                (((traversal * 7 + ch * 3 + slot * 3) % N) + N) % N;
              drawWord(dc, pd, labA, layouts[wordIdx], posRaw, range, L, {
                wrap: true,
              });
            }
          }
        } else {
          for (const [ch, { words }] of chapterData) {
            const show =
              revealUpTo !== null
                ? ch <= revealUpTo
                : chapter === "all" || ch === Number(chapter);
            if (!show) continue;
            const range = chapterRanges.get(ch);
            if (!range || range.length <= 0) continue;
            const L = range.length;
            const ao = (animOffset * chapterSpeedMultiplier(ch)) % L;
            for (const { relStart, layout } of words) {
              drawWord(dc, pd, labA, layout, (relStart + ao) % L, range, L, {
                wrap: true,
              });
            }
          }
        }
        dc.globalAlpha = 1;
        dc.setTransform(pd, 0, 0, pd, 0, 0);
      } else if (displayMode === "collage") {
        for (const [ch, { words }] of chapterData) {
          const show =
            revealUpTo !== null
              ? ch <= revealUpTo
              : chapter === "all" || ch === Number(chapter);
          if (!show) continue;
          const range = chapterRanges.get(ch);
          if (!range || range.length <= 0) continue;
          const L = range.length;
          for (const { relStart, layout } of words) {
            drawWord(dc, pd, labA, layout, relStart, range, L);
          }
        }
        dc.globalAlpha = 1;
        dc.setTransform(pd, 0, 0, pd, 0, 0);
      } else {
        if (labelsGfx) {
          const labelsA = Math.max(0, Math.min(1, ctx.labelsAlpha ?? 1));
          if (labelsA < 1) p.tint(255, Math.round(255 * labelsA));
          p.image(labelsGfx, 0, 0);
          if (labelsA < 1) p.noTint();
        }
      }

      if (legend) {
        p.push();
        const config = typeof legend === "string" ? { text: legend } : legend;
        const lines = String(config.text ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (!lines.length) {
          p.pop();
          return;
        }

        const position = config.position ?? "top-center";
        const alpha = Math.max(0, Math.min(1, config.alpha ?? 1));
        const pad = config.padding ?? 14;
        const inset = config.inset ?? 28;
        const titleSize = config.titleSize ?? 17;
        const bodySize = config.bodySize ?? 11;
        const lineGap = config.lineGap ?? 4;
        const box = config.box ?? true;

        p.textFont("Freight");
        const centerX = position.includes("center");
        const topEdge = position.startsWith("top");
        p.textAlign(centerX ? p.CENTER : p.LEFT, p.TOP);

        const widths = lines.map((line, index) => {
          p.textSize(index === 0 ? titleSize : bodySize);
          return p.textWidth(line);
        });
        const boxW = Math.max(...widths) + pad * 2;
        const boxH =
          pad * 2 +
          titleSize +
          (lines.length > 1
            ? (lines.length - 1) * bodySize + (lines.length - 1) * lineGap
            : 0);
        const bx = centerX ? (W - boxW) / 2 : inset;
        const by = topEdge ? inset : H - boxH - inset;

        p.noStroke();
        if (box) {
          p.fill(255, 255, 255, Math.round(230 * alpha));
          p.rect(bx - pad, by - pad, boxW, boxH);
        }

        let cursorY = by;
        for (let i = 0; i < lines.length; i++) {
          const textSize = i === 0 ? titleSize : bodySize;
          const color = i === 0 ? 0 : 80;
          p.fill(color, Math.round(255 * alpha));
          p.textSize(textSize);
          p.text(lines[i], centerX ? W / 2 : bx, cursorY);
          cursorY += textSize + lineGap;
        }
        p.pop();
      }
    };
  };
}
