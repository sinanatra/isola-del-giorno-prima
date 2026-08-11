export function lineLength(pts) {
  let t = 0;
  for (let i = 0; i < pts.length - 1; i++)
    t += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return t;
}

export function chaikin(pts, iterations = 3) {
  if (pts.length < 3) return pts;
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const [ax, ay] = cur[i], [bx, by] = cur[i + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

export function createPathLUT(segments, totalLength) {
  if (!segments.length || totalLength <= 0)
    return { point: () => ({ x: 0, y: 0, cos: 1, sin: 0 }) };

  const lutLen = Math.ceil(totalLength) + 2;
  const data = new Float32Array(lutLen * 4);
  let si = 0, ptIdx = 0, gone = 0;

  for (let i = 0; i < lutLen; i++) {
    const d = Math.min(i, totalLength);
    while (si < segments.length - 1 && segments[si].start + segments[si].length < d) {
      si++; ptIdx = 0; gone = 0;
    }
    const { pts } = segments[si];
    const localD = d - segments[si].start;
    while (ptIdx < pts.length - 2) {
      const [ax, ay] = pts[ptIdx], [bx, by] = pts[ptIdx + 1];
      const sl = Math.hypot(bx - ax, by - ay);
      if (gone + sl >= localD) break;
      gone += sl; ptIdx++;
    }
    const [ax, ay] = pts[ptIdx];
    const [bx, by] = pts[Math.min(ptIdx + 1, pts.length - 1)];
    const sl = Math.hypot(bx - ax, by - ay);
    const t = sl === 0 ? 0 : (localD - gone) / sl;
    const angle = Math.atan2(by - ay, bx - ax);
    data[i * 4]     = ax + (bx - ax) * t;
    data[i * 4 + 1] = ay + (by - ay) * t;
    data[i * 4 + 2] = Math.cos(angle);
    data[i * 4 + 3] = Math.sin(angle);
  }

  return {
    point(d) {
      const i = Math.min(Math.floor(Math.max(0, Math.min(d, totalLength))), lutLen - 1) * 4;
      return { x: data[i], y: data[i + 1], cos: data[i + 2], sin: data[i + 3] };
    },
  };
}
