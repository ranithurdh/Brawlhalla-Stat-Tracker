import { useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Counts up to the value when it first shows.
function CountUp({ value, delay = 0 }) {
  const [shown, setShown] = useState(reduceMotion() ? value : 0);

  useEffect(() => {
    if (reduceMotion()) {
      setShown(value);
      return;
    }
    let raf;
    let start;
    const timer = setTimeout(() => {
      const tick = (t) => {
        if (start === undefined) start = t;
        const p = Math.min(1, (t - start) / 1300);
        setShown(value * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, delay]);

  return <>{Math.round(shown).toLocaleString()}</>;
}

function Crown() {
  return (
    <svg className="hp-crown" viewBox="0 0 64 44" aria-hidden="true">
      <path
        d="M4 38 L8 12 L22 24 L32 6 L42 24 L56 12 L60 38 Z"
        fill="var(--gold)"
        stroke="#fff3c4"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="10" r="3.5" fill="#fff3c4" />
      <circle cx="32" cy="4.5" r="3.5" fill="#fff3c4" />
      <circle cx="56" cy="10" r="3.5" fill="#fff3c4" />
    </svg>
  );
}

// entries: the top players by best brawler score, best first (up to 3).
export default function Podium({ entries }) {
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  // Classic podium order: 2nd, 1st, 3rd.
  const order = [2, 1, 3].filter((r) => byRank.has(r));
  const delays = { 3: 100, 2: 350, 1: 650 };

  return (
    <div className="hp-podium" aria-label="Top three brawlers">
      {order.map((rank) => {
        const e = byRank.get(rank);
        return (
          <div key={rank} className={`hp-slot place-${rank}`} style={{ "--delay": `${delays[rank]}ms` }}>
            {rank === 1 && (
              <>
                <Crown />
                <i className="spark s1" />
                <i className="spark s2" />
                <i className="spark s3" />
                <i className="spark s4" />
              </>
            )}
            <Avatar name={e.name} face={e.face} size={rank === 1 ? 116 : 88} className="hp-face" />
            <div className="hp-name">{e.name}</div>
            <div className="hp-score">
              <CountUp value={e.score} delay={delays[rank] + 400} />
              <small>points</small>
            </div>
            <div className="hp-pedestal">
              <span>{rank}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
