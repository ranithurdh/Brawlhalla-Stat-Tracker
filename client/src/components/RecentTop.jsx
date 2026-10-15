import Avatar from "./Avatar.jsx";

const MEDALS = ["gold", "silver", "bronze"];

function Group({ title, subtitle, players }) {
  return (
    <div className="rt-group">
      <h3>{title}</h3>
      <p className="hint">{subtitle}</p>
      {players.length ? (
        <div className="rt-row">
          {players.map((p, i) => (
            <div className={`rt-item rt-${MEDALS[i]}`} key={p.playerId} style={{ "--i": i }}>
              <div className="rt-avatar">
                <Avatar name={p.name} face={p.face} size={76} className="rt-face" />
                <span className="rt-rank">{i + 1}</span>
              </div>
              <strong>{p.name}</strong>
              <small>{Math.round(p.score).toLocaleString()} pts</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">No matches in this period yet.</p>
      )}
    </div>
  );
}

// The best three brawlers over the latest 15 matches and over the last month,
// scored with the usual formula using only the matches in each period.
export default function RecentTop({ recent }) {
  if (!recent) return null;
  const n = recent.last15.matches;
  return (
    <section className="panel rt-panel">
      <Group
        title="Last 15 matches"
        subtitle={n < 15 ? `Best 3 brawlers (only ${n} ${n === 1 ? "match" : "matches"} so far)` : "Best 3 brawlers"}
        players={recent.last15.top}
      />
      <Group
        title="Last month"
        subtitle={`Best 3 brawlers over the last 30 days (${recent.lastMonth.matches} ${
          recent.lastMonth.matches === 1 ? "match" : "matches"
        })`}
        players={recent.lastMonth.top}
      />
    </section>
  );
}