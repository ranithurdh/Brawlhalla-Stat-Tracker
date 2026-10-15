import { useMemo, useRef, useState } from "react";
import { RANGES, buildSeries, formatTick, linePaths, niceTicks } from "../lib/chartMath.js";

// One colour per player, taken from the site palette (then repeats).
const COLORS = ["#6cc4ff", "#ffc233", "#ff6a4a", "#6fe0a4", "#b78cff", "#ff8fc7", "#c9d0e4", "#e0925a"];

const W = 900;
const H = 340;
const M = { left: 58, right: 38, top: 14, bottom: 32 }; // right edge leaves room for the faces
const FACE_R = 15; // radius of the face at the end of each line

// Stops faces from sitting on top of each other when scores are close: sorts them
// by height and nudges them apart. Adds "fy" (the face's y) to each item.
function spreadFaces(items) {
  const gap = FACE_R * 2 + 2;
  const sorted = [...items].sort((a, b) => a.y - b.y);
  let prev = M.top - FACE_R - 2;
  for (const it of sorted) {
    it.fy = Math.max(it.y, prev + gap);
    prev = it.fy;
  }
  const bottom = H - M.bottom - FACE_R;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const limit = i === sorted.length - 1 ? bottom : sorted[i + 1].fy - gap;
    if (sorted[i].fy > limit) sorted[i].fy = limit;
  }
  return sorted;
}

// faces: { [playerId]: image data URL } (players without one get their initial).
export default function ScoreChart({ timeline, range, faces = {} }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [hover, setHover] = useState(null); // index into series.points
  const svgRef = useRef(null);

  const colorOf = useMemo(() => {
    const map = new Map(timeline.players.map((p, i) => [p.id, COLORS[i % COLORS.length]]));
    return (id) => map.get(id);
  }, [timeline.players]);

  const series = useMemo(() => buildSeries(timeline.points, range), [timeline.points, range]);
  const visible = timeline.players.filter((p) => !hidden.has(p.id));

  // y range from the visible players' scores
  const values = [];
  for (const pt of series.points) {
    for (const p of visible) {
      const v = pt.scores?.[p.id];
      if (v !== null && v !== undefined) values.push(v);
    }
  }

  const toggle = (id) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const legend = (
    <div className="chart-legend">
      {timeline.players.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`legend-item ${hidden.has(p.id) ? "off" : ""}`}
          onClick={() => toggle(p.id)}
          aria-pressed={!hidden.has(p.id)}
        >
          <span className="swatch" style={{ background: colorOf(p.id) }} />
          {p.name}
        </button>
      ))}
    </div>
  );

  if (!series.points.length || !values.length) {
    return (
      <>
        {legend}
        <p className="hint chart-empty">
          {series.points.length
            ? "No players selected."
            : "No matches in this period yet. Pick a longer range, or add a match."}
        </p>
      </>
    );
  }

  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const [x0, x1] = series.domain;
  const xOf = (ms) => M.left + ((ms - x0) / (x1 - x0 || 1)) * (W - M.left - M.right);
  const yOf = (v) => H - M.bottom - ((v - yMin) / (yMax - yMin || 1)) * (H - M.top - M.bottom);

  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);

  // Hovering shows the nearest real match point.
  const realIdx = series.points.map((p, i) => (p.real ? i : -1)).filter((i) => i >= 0);
  function handleMove(e) {
    if (!realIdx.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let best = realIdx[0];
    for (const i of realIdx) {
      if (Math.abs(xOf(series.points[i].x) - svgX) < Math.abs(xOf(series.points[best].x) - svgX)) best = i;
    }
    setHover(best);
  }

  // A face at the end of each visible line (the player's latest score).
  const ends = visible
    .map((p) => {
      for (let i = series.points.length - 1; i >= 0; i--) {
        const v = series.points[i].scores?.[p.id];
        if (v !== null && v !== undefined) return { p, x: xOf(series.points[i].x), y: yOf(v) };
      }
      return null;
    })
    .filter(Boolean);
  const endFaces = spreadFaces(ends);

  const hp = hover !== null ? series.points[hover] : null;
  const hoverRows = hp
    ? visible
        .map((p) => ({ p, v: hp.scores?.[p.id] }))
        .filter((r) => r.v !== null && r.v !== undefined)
        .sort((a, b) => b.v - a.v)
    : [];

  return (
    <>
      {legend}
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          className="score-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Best brawler points for each player over time"
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={W - M.right} y1={yOf(t)} y2={yOf(t)} />
              <text className="axis" x={M.left - 8} y={yOf(t) + 4} textAnchor="end">
                {Math.round(t).toLocaleString()}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={i}
              className="axis"
              x={xOf(t)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            >
              {formatTick(t, x1 - x0)}
            </text>
          ))}

          {/* key= restarts the draw-in animation when the range changes */}
          <g key={`${range}-${[...hidden].join(",")}`}>
            {visible.map((p) =>
              linePaths(series.points, p.id, xOf, yOf).map((d, i) => (
                <path
                  key={`${p.id}-${i}`}
                  className="line"
                  d={d}
                  pathLength="1"
                  stroke={colorOf(p.id)}
                  fill="none"
                />
              ))
            )}

            {endFaces.map(({ p, x, y, fy }) => {
              const color = colorOf(p.id);
              const face = faces[p.id];
              const clip = `face-clip-${p.id}`;
              return (
                <g key={`face-${p.id}`} className="end-face">
                  {fy !== y && <line x1={x} x2={x} y1={y} y2={fy} stroke={color} strokeWidth="2" />}
                  <circle cx={x} cy={y} r="3.5" fill={color} />
                  <clipPath id={clip}>
                    <circle cx={x} cy={fy} r={FACE_R} />
                  </clipPath>
                  {face ? (
                    <image
                      href={face}
                      x={x - FACE_R}
                      y={fy - FACE_R}
                      width={FACE_R * 2}
                      height={FACE_R * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${clip})`}
                    />
                  ) : (
                    <>
                      <circle cx={x} cy={fy} r={FACE_R} fill="var(--panel-2)" />
                      <text
                        x={x}
                        y={fy + 5}
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="700"
                        fill={color}
                      >
                        {p.name.slice(0, 1).toUpperCase()}
                      </text>
                    </>
                  )}
                  <circle cx={x} cy={fy} r={FACE_R} fill="none" stroke={color} strokeWidth="2.5" />
                </g>
              );
            })}
          </g>

          {hp && (
            <g>
              <line className="cursor" x1={xOf(hp.x)} x2={xOf(hp.x)} y1={M.top} y2={H - M.bottom} />
              {hoverRows.map(({ p, v }) => (
                <circle key={p.id} cx={xOf(hp.x)} cy={yOf(v)} r="4.5" fill={colorOf(p.id)} stroke="var(--panel)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>

        {hp && (
          <div
            className="chart-tip"
            style={{
              left: `${(xOf(hp.x) / W) * 100}%`,
              transform: xOf(hp.x) / W > 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <strong>{new Date(hp.x).toLocaleString()}</strong>
            {hoverRows.map(({ p, v }) => (
              <span key={p.id}>
                <i className="swatch" style={{ background: colorOf(p.id) }} />
                {p.name}: {Math.round(v).toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="hint chart-note">
        Points are running totals: each point is every player's score after that match, so the
        right-hand end matches the table below. Showing {RANGES[range].label.toLowerCase()}.
      </p>
    </>
  );
}