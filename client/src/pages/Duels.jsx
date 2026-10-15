import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteDuel, getDuels } from "../api.js";
import AdminUnlock from "../components/AdminUnlock.jsx";
import Avatar from "../components/Avatar.jsx";
import useAdmin from "../components/useAdmin.js";
import { pct, signed } from "../lib/duelFormat.js";

const placeClass = ["gold", "silver", "bronze"];

// One player's box: face, big ELO, overall record and the record against everyone else.
function EloCard({ p }) {
  const medal = p.rank <= 3 ? placeClass[p.rank - 1] : "";
  return (
    <article className={`duel-card ${medal}`}>
      <header className="duel-card-head">
        <span className="duel-rank">#{p.rank}</span>
        <Avatar name={p.name} face={p.face} size={64} className="ring" />
        <h2>{p.name}</h2>
      </header>

      <div className="elo">
        <strong>{p.elo.toLocaleString()}</strong>
        <small>ELO</small>
      </div>

      <p className="duel-total">
        {p.matches === 0 ? (
          <span className="muted">No 1v1s yet</span>
        ) : (
          <>
            <b>{p.wins}</b>W – <b>{p.losses}</b>L <span className="muted">·</span> {pct(p.winRate)} win rate
          </>
        )}
        {p.streak >= 2 && <span className="streak-chip">{p.streak} win streak</span>}
      </p>

      <div className="h2h">
        <h3>Head to head</h3>
        {p.h2h.length === 0 && <p className="hint">No other players yet.</p>}
        <ul>
          {p.h2h.map((o) => {
            const games = o.wins + o.losses;
            return (
              <li key={o.playerId} className={games === 0 ? "none" : ""}>
                <Avatar name={o.name} face={o.face} size={24} />
                <span className="h2h-name">{o.name}</span>
                <span className="h2h-record">
                  {games === 0 ? "—" : `${o.wins} – ${o.losses}`}
                </span>
                <span className="h2h-bar" aria-hidden="true">
                  {games > 0 && <i style={{ width: `${(o.wins / games) * 100}%` }} />}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

function Empty({ min, children }) {
  return <p className="hint">{children || `Needs at least ${min} matches to be counted.`}</p>;
}

// A ranked list. renderRow gives { lead, title, line, value } for each entry.
function Board({ title, about, tone, entries, render, min, empty }) {
  return (
    <section className={`board ${tone || ""}`}>
      <div className="board-head">
        <h2>{title}</h2>
        <p>{about}</p>
      </div>
      {entries.length === 0 ? (
        <Empty min={min}>{empty}</Empty>
      ) : (
        <ol className="rows">
          {entries.map((e) => {
            const r = render(e);
            return (
              <li key={r.key} className={`row-entry ${e.rank <= 3 ? placeClass[e.rank - 1] : ""}`}>
                <span className="rank">{e.rank}</span>
                {r.lead}
                <span className="who">
                  <strong>{r.title}</strong>
                  <small>{r.line}</small>
                </span>
                <span className="value">{r.value}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const Pair = ({ a, b }) => (
  <span className="faces" style={{ display: "inline-flex", flex: "none", gap: 4 }}>
    <Avatar name={a.name} face={a.face} size={34} />
    <Avatar name={b.name} face={b.face} size={34} />
  </span>
);

export default function Duels() {
  const isAdmin = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () =>
    getDuels()
      .then(setData)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this 1v1? ELO and records are recalculated without it.")) return;
    setError("");
    try {
      await deleteDuel(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) {
    return (
      <div className="page">
        <h1>1v1</h1>
        {error ? <p className="notice error">{error}</p> : <p className="lede">Loading...</p>}
      </div>
    );
  }

  const min = data.minMatches;
  const b = data.boards;

  return (
    <>
      <AdminUnlock isAdmin={isAdmin} />
      <div className="page wide">
        <header className="hero">
          <h1>1v1</h1>
          <p className="lede">
            {data.totalMatches === 0 ? (
              <>
                No 1v1s yet. <Link to="/add">Add a 1v1 screenshot</Link>: it has to be between two
                registered members. Everyone starts on {data.startElo} ELO.
              </>
            ) : (
              <>
                {data.totalMatches} {data.totalMatches === 1 ? "match" : "matches"} between
                registered members. These stats are separate from the usual leaderboards.
              </>
            )}
          </p>
        </header>

        {error && <p className="notice error">{error}</p>}

        <div className="duel-grid">
          {data.players.map((p) => (
            <EloCard key={p.playerId} p={p} />
          ))}
        </div>

        <div className="board-grid duel-boards">
          <Board
            title="Highest win percentage"
            about={`Wins per 1v1 played (at least ${min} played)`}
            entries={b.winRate}
            min={min}
            render={(e) => ({
              key: e.playerId,
              lead: e.rank <= 3 && <Avatar name={e.name} face={e.face} size={40} className="ring" />,
              title: e.name,
              line: `${e.wins} won, ${e.losses} lost`,
              value: pct(e.winRate),
            })}
          />
          <Board
            title="Highest win streak"
            about={`Most 1v1 wins in a row (at least ${min} played)`}
            entries={b.streaks}
            min={min}
            render={(e) => ({
              key: e.playerId,
              lead: e.rank <= 3 && <Avatar name={e.name} face={e.face} size={40} className="ring" />,
              title: e.name,
              line: e.streak > 0 ? `on a ${e.streak} win streak right now` : "no active streak",
              value: e.bestStreak,
            })}
          />
          <Board
            title="Biggest rivalries"
            about={`Closest head-to-head records (at least ${min} matches between the two)`}
            entries={b.rivalries}
            min={min}
            render={(e) => ({
              key: `${e.a.playerId}-${e.b.playerId}`,
              lead: <Pair a={e.a} b={e.b} />,
              title: `${e.a.name} vs ${e.b.name}`,
              line: e.diff === 0 ? `dead level over ${e.games} matches` : `${e.games} matches, ${e.diff} win${e.diff === 1 ? "" : "s"} apart`,
              value: `${e.a.wins} – ${e.b.wins}`,
            })}
          />
          <Board
            title="Biggest dominations"
            about={`Biggest win gap over one opponent (at least ${min} matches between the two)`}
            tone="ember"
            entries={b.dominations}
            min={min}
            empty={`Needs a pair with at least ${min} matches and one clearly ahead.`}
            render={(e) => ({
              key: `${e.winner.playerId}-${e.loser.playerId}`,
              lead: <Pair a={e.winner} b={e.loser} />,
              title: `${e.winner.name} over ${e.loser.name}`,
              line: `${e.winner.wins} – ${e.loser.wins} (${pct(e.winRate)} of ${e.games} matches)`,
              value: `+${e.diff}`,
            })}
          />
        </div>

        <section className="panel">
          <h2>Recent 1v1s</h2>
          {data.recent.length === 0 ? (
            <p className="hint">Nothing here yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="duel-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Winner</th>
                    <th>Loser</th>
                    {isAdmin && (
                      <th>
                        <span className="sr-only">Delete</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.at).toLocaleString()}</td>
                      <td>
                        <span className="who-cell">
                          <Avatar name={m.winner.name} face={m.winner.face} size={26} />
                          {m.winner.name}
                        </span>{" "}
                        <small className="up">
                          {signed(m.delta)} → {m.winner.eloAfter}
                        </small>
                      </td>
                      <td>
                        <span className="who-cell">
                          <Avatar name={m.loser.name} face={m.loser.face} size={26} />
                          {m.loser.name}
                        </span>{" "}
                        <small className="down">
                          {signed(-m.delta)} → {m.loser.eloAfter}
                        </small>
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="btn small" onClick={() => handleDelete(m.id)}>
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="footnote">
          ELO works like chess: everyone starts on {data.startElo}, and every 1v1 moves both
          ratings (K = {data.kFactor}). Beating a higher-rated player earns more than beating a
          lower-rated one, and the winner gains exactly what the loser loses. Win percentage, win
          streaks, rivalries and dominations only count players (or pairs) with at least {min}{" "}
          matches. 1v1s with someone who isn't a registered member are not counted.
        </p>
      </div>
    </>
  );
}
