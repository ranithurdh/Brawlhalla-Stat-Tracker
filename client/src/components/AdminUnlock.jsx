import { useState } from "react";
import { checkPassword, setAdminPassword } from "../api.js";

// Small "Admin" control: unlock to edit Gemini's numbers and saved matches.
export default function AdminUnlock({ isAdmin }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setAdminPassword(input);
    try {
      await checkPassword();
      window.dispatchEvent(new Event("admin-verified"));
      setInput("");
      setOpen(false);
    } catch (err) {
      setAdminPassword("");
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="adminbar">
        <span className="admin-on">Admin mode: you can edit stats and matches</span>
        <button className="btn small ghost" onClick={() => setAdminPassword("")}>
          Lock
        </button>
      </div>
    );
  }

  return (
    <div className="adminbar">
      {!open ? (
        <button className="btn small ghost" onClick={() => setOpen(true)}>
          Admin
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            aria-label="Admin password"
            placeholder="Admin password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn small primary" type="submit" disabled={busy || !input}>
            {busy ? "Checking..." : "Unlock"}
          </button>
          <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && <span className="admin-error">{error}</span>}
    </div>
  );
}
