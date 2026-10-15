import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHome } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import Podium from "../components/Podium.jsx";
import ScoreChart from "../components/ScoreChart.jsx";
import { RANGES } from "../lib/chartMath.js";
import RecentTop from "../components/RecentTop.jsx";

const num = (n, digits = 0) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");

  useEffect(() => {
    getHome()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="page">
        <h1>Sandun Brawlding</h1>
        <p className="notice error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <h1>Sandun Brawlding</h1>
        <p className="lede">Loading...</p>
      </div>
    );
  }

  const ranked = data.board.filter((r) => r.score !== null);
  const podium = ranked.slice(0, 3);

  return (
    <div className="page wide">
      <header className="hero home-hero">
        <h1>Sandun Brawlding</h1>
        <p className="lede">
          {data.totalMatches === 0 ? (
            <>
              No matches yet. <Link to="/add">Add the first match</Link> and the best brawler
              appears here.
            </>
          ) : (
            <>
              The best brawler after {data.totalMatches}{" "}
              {data.totalMatches === 1 ? "match" : "matches"}.
            </>
          )}
        </p>
      </header>

      {podium.length > 0 && (
        <section className="panel podium-panel">
          <Podium entries={podium} />
        </section>
      )}

      <RecentTop recent={data.recent} />

      <section className="panel">
        <div className="chart-head">
          <div>
            <h2>Best brawler over time</h2>
            <p className="hint">Each player's best brawler points, so you can see who led and when.</p>
          </div>
          <div className="segmented" role="group" aria-label="Time range">
            {Object.entries(RANGES).map(([key, r]) => (
              <button
                key={key}
                type="button"
                className={range === key ? "active" : ""}
                aria-pressed={range === key}
                onClick={() => setRange(key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <ScoreChart
          timeline={data.timeline}
          range={range}
          faces={Object.fromEntries(data.board.map((r) => [r.playerId, r.face]))}
        />
      </section>

      <section className="panel">
        <h2>Best brawler leaderboard</h2>
        <p className="hint">
          Total score = DPL + (KTR × 100) + DP − MDP. Every number in the formula is shown.
        </p>
        <div className="table-wrap">
          <table className="score-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th className="num">Total score</th>
                <th className="num" title="Damage per life: damage done / falls">DPL</th>
                <th className="num" title="KOs to falls: KOs / falls, multiplied by 100 in the score">KTR × 100</th>
                <th className="num" title="Share of matches with the highest damage per life">DP</th>
                <th className="num" title="Share of matches with the highest damage taken minus damage done per life, taken off the score">MDP</th>
                <th className="num">Matches</th>
              </tr>
            </thead>
            <tbody>
              {data.board.map((r) => (
                <tr key={r.playerId} className={r.rank <= 3 && r.score !== null ? `top top-${r.rank}` : ""}>
                  <td className="rank-cell">{r.score === null ? "—" : r.rank}</td>
                  <td>
                    <span className="who-cell">
                      <Avatar name={r.name} face={r.face} size={32} />
                      {r.name}
                    </span>
                  </td>
                  <td className="num strong">{num(r.score, 1)}</td>
                  <td className="num">{num(r.dpl, 1)}</td>
                  <td className="num">
                    {num(r.ktr === null ? null : r.ktr * 100, 1)}
                    <small className="muted block">KTR {num(r.ktr, 2)}</small>
                  </td>
                  <td className="num">{r.dp === null ? "—" : `${num(r.dp, 1)}%`}</td>
                  <td className="num">{r.mdp === null ? "—" : `−${num(r.mdp, 1)}%`}</td>
                  <td className="num">{r.matches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          DPL is damage done for every fall, KTR is KOs for every fall, DP is the share of a
          player's matches where they had the highest damage per life of anyone, and MDP is the
          share where they had the highest damage taken minus damage done per life. DP and MDP
          count as percent points (50% adds 50). A life is a fall; accidents don't count.{" "}
          <Link to="/leaderboards">See every other leaderboard.</Link>
        </p>
      </section>
    </div>
  );
}
