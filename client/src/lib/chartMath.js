// Pure helpers for the best-brawler timeline chart (no React, so easy to test).

const DAY = 24 * 60 * 60 * 1000;

export const RANGES = {
  month: { label: "Last month", days: 30 },
  year: { label: "Last year", days: 365 },
  all: { label: "All time", days: null },
};

// points: [{ t, scores: { playerId: score|null } }] oldest first.
// Returns { points: [{ x (ms), scores, real }], domain: [startMs, endMs] }.
// For month / year the last known scores before the window are carried in at the
// left edge, and the last scores are carried out to "now", so lines span the chart.
export function buildSeries(points, range, now = Date.now()) {
  const all = points
    .map((p) => ({ x: new Date(p.t).getTime(), scores: p.scores, real: true }))
    .sort((a, b) => a.x - b.x);

  if (range === "all" || !RANGES[range]?.days) {
    if (!all.length) return { points: [], domain: [now - DAY, now] };
    let a = all[0].x;
    let b = all[all.length - 1].x;
    if (a === b) {
      a -= DAY / 2;
      b += DAY / 2;
    }
    return { points: all, domain: [a, b] };
  }

  const cutoff = now - RANGES[range].days * DAY;
  const before = all.filter((p) => p.x < cutoff);
  const inside = all.filter((p) => p.x >= cutoff);

  const out = [];
  if (before.length) out.push({ x: cutoff, scores: before[before.length - 1].scores, real: false });
  out.push(...inside);
  const tail = out[out.length - 1];
  if (tail && tail.x < now) out.push({ x: now, scores: tail.scores, real: false });
  return { points: out, domain: [cutoff, now] };
}

// Round-number axis ticks that cover [min, max].
export function niceTicks(min, max, count = 5) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

// The line for one player as SVG path pieces. A missing score (null) breaks the line.
export function linePaths(points, playerId, xOf, yOf) {
  const paths = [];
  let current = [];
  for (const p of points) {
    const v = p.scores?.[playerId];
    if (v === null || v === undefined) {
      if (current.length) paths.push(current);
      current = [];
    } else {
      current.push([xOf(p.x), yOf(v)]);
    }
  }
  if (current.length) paths.push(current);
  return paths.map((pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "));
}

// Label for an x-axis date, shaped by how long the chart spans.
export function formatTick(ms, spanMs) {
  const d = new Date(ms);
  if (spanMs < 2 * DAY) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (spanMs < 400 * DAY) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", year: "numeric" });
}
