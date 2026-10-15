import { NUMBERS, blankPlayer } from "../lib/matchForm.js";

// The table of one match. Editable for admins, plain text for everyone else.
// rows: form rows (see lib/matchForm.js). members: the Player list.
export default function MatchEditor({ members, rows, onChange, readOnly = false }) {
  const nameOf = (id) => members.find((m) => m._id === id)?.name || "";
  const update = (index, patch) =>
    onChange(rows.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  const winners = rows
    .filter((p) => p.won === "won")
    .map((p) => nameOf(p.playerId) || p.gamertag || "?");

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gamertag</th>
              <th>Member</th>
              <th>Result</th>
              {NUMBERS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {!readOnly && (
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((player, i) =>
              readOnly ? (
                <tr key={i}>
                  <td>{player.gamertag}</td>
                  <td>
                    {player.playerId && player.matchedBy !== "close" ? (
                      nameOf(player.playerId)
                    ) : (
                      <span className="muted">Not a member</span>
                    )}
                    {player.matchedBy === "close" && (
                      <small className="warn block">Close spelling. An admin has to confirm it.</small>
                    )}
                  </td>
                  <td>{player.won === "won" ? "Won" : player.won === "lost" ? "Lost" : "—"}</td>
                  {NUMBERS.map((c) => (
                    <td key={c.key}>{player[c.key] === "" ? "—" : player[c.key]}</td>
                  ))}
                </tr>
              ) : (
                <tr key={i}>
                  <td>
                    <input
                      aria-label={`Gamertag, row ${i + 1}`}
                      value={player.gamertag}
                      onChange={(e) => update(i, { gamertag: e.target.value, matchedBy: null })}
                    />
                  </td>
                  <td className="member-cell">
                    <select
                      aria-label={`Member, row ${i + 1}`}
                      value={player.playerId}
                      onChange={(e) => update(i, { playerId: e.target.value, matchedBy: null })}
                    >
                      <option value="">Not a member</option>
                      {members.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {player.matchedBy === "close" && (
                      <small className="warn">Matched by close spelling. Check it.</small>
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={`Result, row ${i + 1}`}
                      value={player.won}
                      onChange={(e) => update(i, { won: e.target.value })}
                    >
                      <option value="">Choose</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </td>
                  {NUMBERS.map((c) => (
                    <td key={c.key}>
                      <input
                        type="number"
                        min="0"
                        aria-label={`${c.label}, row ${i + 1}`}
                        value={player[c.key]}
                        onChange={(e) => update(i, { [c.key]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="btn small"
                      onClick={() => remove(i)}
                      aria-label={`Remove row ${i + 1}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <p className="winners">
        {winners.length ? (
          <>
            Winning team: <strong>{winners.join(" + ")}</strong>
          </>
        ) : (
          "Winning team: not chosen yet"
        )}
      </p>

      {!readOnly && (
        <div className="actions">
          <button className="btn" onClick={() => onChange([...rows, blankPlayer()])}>
            Add row
          </button>
        </div>
      )}
    </>
  );
}
