import { useEffect, useState } from "react";
import { deleteMatch, getMatches, getPlayers, updateMatch } from "../api.js";
import AdminUnlock from "../components/AdminUnlock.jsx";
import MatchEditor from "../components/MatchEditor.jsx";
import useAdmin from "../components/useAdmin.js";
import { rowFromServer, rowToPayload } from "../lib/matchForm.js";

export default function Matches() {
  const isAdmin = useAdmin();
  const [matches, setMatches] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // The match being edited: { id, rows }. Admin only.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getMatches()
      .then(setMatches)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    getPlayers()
      .then(setMembers)
      .catch((err) => setError(err.message));
  }, []);

  // Locking the page closes any edit in progress.
  useEffect(() => {
    if (!isAdmin) setEditing(null);
  }, [isAdmin]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this match? The leaderboards will be recalculated.")) return;
    setError("");
    setMessage("");
    try {
      await deleteMatch(id);
      setMatches((list) => list.filter((m) => m._id !== id));
      if (editing?.id === id) setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveEdit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateMatch(editing.id, { players: editing.rows.map(rowToPayload) });
      setEditing(null);
      await load();
      setMessage("Match updated and the leaderboards are recalculated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminUnlock isAdmin={isAdmin} />
      <div className="page wide">
        <h1>Matches</h1>
        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}
        {!matches && !error && <p className="lede">Loading matches...</p>}
        {matches && matches.length === 0 && (
          <p className="lede">No matches yet. Add a screenshot to save the first one.</p>
        )}

        {matches &&
          matches.map((m) => {
            const isEditing = editing?.id === m._id;
            return (
              <section className="panel" key={m._id}>
                <div className="match-head">
                  <div>
                    <h2>{m.winners.length ? `${m.winners.join(" + ")} won` : "Winner unknown"}</h2>
                    <p className="hint">{new Date(m.createdAt).toLocaleString()}</p>
                  </div>
                  {isAdmin && !isEditing && (
                    <div className="actions tight">
                      <button
                        className="btn small"
                        onClick={() => setEditing({ id: m._id, rows: m.players.map(rowFromServer) })}
                        disabled={Boolean(editing)}
                      >
                        Edit
                      </button>
                      <button className="btn small" onClick={() => handleDelete(m._id)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <MatchEditor
                      members={members}
                      rows={editing.rows}
                      onChange={(rows) => setEditing((e) => ({ ...e, rows }))}
                    />
                    <div className="actions">
                      <button className="btn primary" onClick={handleSaveEdit} disabled={busy}>
                        {busy ? "Saving..." : "Save changes"}
                      </button>
                      <button className="btn" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Result</th>
                          <th>KOs</th>
                          <th>Falls</th>
                          <th>Accidents</th>
                          <th>Damage done</th>
                          <th>Damage taken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.players.map((p, i) => (
                          <tr key={i}>
                            <td>
                              {p.displayName ? (
                                p.displayName
                              ) : (
                                <span className="muted">{p.gamertag} (not a member)</span>
                              )}
                            </td>
                            <td>{p.won === true ? "Won" : p.won === false ? "Lost" : ""}</td>
                            <td>{p.kos ?? ""}</td>
                            <td>{p.falls ?? ""}</td>
                            <td>{p.accidents ?? ""}</td>
                            <td>{p.damageDone ?? ""}</td>
                            <td>{p.damageTaken ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </>
  );
}
