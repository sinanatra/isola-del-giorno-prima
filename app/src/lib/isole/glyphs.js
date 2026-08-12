export const LABEL_COLOR = 'blue';
const SPEED_VARIATION = 0.22;

export function chapterSpeedMultiplier(chapter) {
  const x = Math.sin((Number(chapter) || 0) * 12.9898 + 78.233) * 43758.5453;
  const t = x - Math.floor(x);
  return 1 + (t * 2 - 1) * SPEED_VARIATION;
}


export function kernedCharWidths(p, fontSize, text) {
  p.textFont("Freight");
  p.textSize(fontSize);
  const dc = p.drawingContext;
  const chars = [...text];
  const widths = [];
  let prev = 0, built = "";
  for (const ch of chars) {
    built += ch;
    const curr = dc.measureText(built).width;
    widths.push(curr - prev);
    prev = curr;
  }
  return { chars, widths, total: prev };
}

const _glyphAtlas = new Map();
const _GLYPH_PAD = 2.4;
const _GLYPH_ATLAS_MAX = 500;

export function getGlyph(char, fontSize, pd, color = LABEL_COLOR, withShadow = false) {
  const key = `${color}_${fontSize}_${pd}_${char}_${withShadow ? 's' : ''}`;
  let e = _glyphAtlas.get(key);
  if (!e) {
    if (_glyphAtlas.size >= _GLYPH_ATLAS_MAX) _glyphAtlas.clear();
    const s = Math.ceil(fontSize * pd * _GLYPH_PAD) || 4;
    const oc = new OffscreenCanvas(s, s);
    const dc = oc.getContext("2d");
    dc.font = `${Math.round(fontSize * pd)}px Freight`;
    dc.textAlign = "center";
    dc.textBaseline = "middle";
    if (withShadow) {
      dc.shadowColor = 'rgba(0,0,0,0.30)';
      dc.shadowBlur = fontSize * pd * 0.15;
      dc.shadowOffsetX = 0;
      dc.shadowOffsetY = fontSize * pd * 0.12;
    }
    dc.fillStyle = color;
    dc.fillText(char, s / 2, s / 2);
    e = { oc, dw: fontSize * _GLYPH_PAD, dh: fontSize * _GLYPH_PAD };
    _glyphAtlas.set(key, e);
  }
  return e;
}

export function renderCharsIntoGfx(gfx, chars, fontSize, pd) {
  gfx.textFont("Freight");
  gfx.textSize(fontSize);
  gfx.textAlign(gfx.CENTER, gfx.CENTER);
  const dc = gfx.drawingContext;
  dc.textAlign = "center";
  dc.textBaseline = "middle";
  dc.fillStyle = LABEL_COLOR;
  for (const { char, x, y, cos, sin, alpha = 1 } of chars) {
    dc.globalAlpha = alpha;
    dc.setTransform(pd * cos, pd * sin, -pd * sin, pd * cos, pd * x, pd * y);
    dc.fillText(char, 0, 0);
  }
  dc.globalAlpha = 1;
  dc.setTransform(pd, 0, 0, pd, 0, 0);
}
