import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaderboards } from "../api.js";
import Avatar from "../components/Avatar.jsx";

const int = (n) => Math.round(n).toLocaleString();

// One entry per leaderboard, in the order shown. "line" is the small text under
// each value.
const BOARDS = [
  {
    key: "damagePerLife",
    title: "Damage per life",
    about: "Damage done for every fall (life lost)",
    format: (v) => int(v),
    line: (e) => `${int(e.damageDone)} damage over ${e.deaths} lives lost`,
  },
  {
    key: "koDeathRatio",
    title: "KOs to falls",
    about: "KOs divided by falls",
    format: (v) => v.toFixed(2),
    line: (e) => `${e.kos} KOs, ${e.deaths} falls`,
  },
  {
    key: "maxDamage",
    title: "Most damage in one match",
    about: "Best single match",
    format: (v) => int(v),
    line: (e) => `${e.matches} matches played`,
  },
  {
    key: "minDamage",
    title: "Least damage in one match",
    about: "Lowest single match where all 3 lives were lost (3 falls), so lowest is first",
    format: (v) => int(v),
    line: (e) => `${e.matches} matches played`,
    tone: "ember",
  },
  {
    key: "dominantRate",
    title: "Most dominant player",
    about: "Share of matches where they had the highest damage per life (fall) of anyone in the match",
    format: (v) => `${Math.round(v * 100)}%`,
    line: (e) => `highest damage per life in ${e.dominantMatches} of ${e.matches} matches`,
  },
  {
    key: "dominatedRate",
    title: "Most dominated player",
    about: "Share of matches where they had the highest damage taken per life minus damage done per life of anyone in the match",
    format: (v) => `${Math.round(v * 100)}%`,
    line: (e) => `most dominated in ${e.dominatedMatches} of ${e.matches} matches`,
    tone: "ember",
  },
  {
    key: "mostWonTeam",
    title: "Most won team",
    about: "The player combination that has won the most matches together",
    format: (v) => `${v} ${v === 1 ? "win" : "wins"}`,
    line: (e) => `won ${e.wins} of ${e.games} together (${Math.round(e.winRate * 100)}%)`,
    empty: "No team of 2 or more players has won a match yet.",
  },
  {
    key: "winRate",
    title: "Win rate",
    about: "Wins per match played",
    format: (v) => `${Math.round(v * 100)}%`,
    line: (e) => `${e.wins} won of ${e.ratedMatches}`,
  },
];

const placeClass = ["gold", "silver", "bronze"];

function Faces({ entry }) {
  // A team shows its members' faces side by side, overlapping a little.
  return (
    <span className="faces" style={{ display: "inline-flex", flex: "none", gap: 8 }}>
      {entry.faces.map((face, i) => (
        <Avatar
          key={i}
          name={entry.name.split(" + ")[i] || "?"}
          face={face}
          size={36}
          className="ring"
        />
      ))}
    </span>
  );
}

function Rows({ board, entries, startAt }) {
  if (entries.length === 0) {
    return <p className="hint">{board.empty || "No data yet."}</p>;
  }
  return (
    <ol className="rows" start={startAt}>
      {entries.map((e) => (
        <li key={e.playerId} className={`row-entry ${e.rank <= 3 ? placeClass[e.rank - 1] : ""}`}>
          <span className="rank">{e.rank}</span>
          {e.rank <= 3 &&
            (e.faces ? (
              <Faces entry={e} />
            ) : (
              <Avatar name={e.name} face={e.face} size={40} className="ring" />
            ))}
          <span className="who">
            <strong>{e.name}</strong>
            <small>{e.value === null ? "no data yet" : board.line(e)}</small>
          </span>
          <span className="value">{e.value === null ? "—" : board.format(e.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Leaderboards() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getLeaderboards()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="page">
        <h1>Leaderboards</h1>
        <p className="notice error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <h1>Leaderboards</h1>
        <p className="lede">Loading...</p>
      </div>
    );
  }

  return (
    <div className="page wide">
      <header className="hero">
        <h1>Leaderboards</h1>
        <p className="lede">
          {data.totalMatches === 0 ? (
            <>
              No matches yet. <Link to="/add">Add the first match</Link> and the boards fill in.
            </>
          ) : (
            <>
              {data.totalMatches} {data.totalMatches === 1 ? "match" : "matches"} played. Every
              player is ranked on every board.
            </>
          )}
        </p>
      </header>

      <div className="board-grid">
        {BOARDS.map((b) => (
          <section key={b.key} className={`board ${b.tone || ""}`}>
            <div className="board-head">
              <h2>{b.title}</h2>
              <p>{b.about}</p>
            </div>
            <Rows board={b} entries={data.boards[b.key] || []} startAt={1} />
          </section>
        ))}
      </div>

      <p className="footnote">
        A life is lost by a fall only; accidents don't count. A player with no falls yet is counted
        as one life so the ratios stay comparable. Least damage only counts matches where a player
        had all 3 falls. Dominant (highest damage per life) and dominated (highest damage taken per
        life minus damage done per life) are judged against everyone in the match; a tie counts for each tied player, and a match where everyone is
        level counts for nobody.
      </p>
    </div>
  );
}
