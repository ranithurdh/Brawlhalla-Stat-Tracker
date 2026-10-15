import { useEffect, useState } from "react";
import { checkPassword, getAdminPassword, getAuthStatus, setAdminPassword } from "../api.js";

// Shows its children only after the right password has been entered.
// The server checks the password on every request too, so this is not the only lock.
export default function PasswordGate({ title, children }) {
  const [state, setState] = useState("checking"); // checking | locked | open | unconfigured
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    async function start() {
      try {
        const status = await getAuthStatus();
        if (!alive) return;
        if (!status.configured) return setState("unconfigured");
        if (!getAdminPassword()) return setState("locked");
        await checkPassword();
        if (alive) setState("open");
      } catch (err) {
        if (!alive) return;
        setState("locked");
        if (err.status !== 401) setError(err.message);
      }
    }
    start();

    // Locking, or a rejected password anywhere in the app, brings the box back.
    const onChange = () => {
      if (!getAdminPassword()) setState((s) => (s === "open" ? "locked" : s));
    };
    window.addEventListener("auth-change", onChange);
    return () => {
      alive = false;
      window.removeEventListener("auth-change", onChange);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setAdminPassword(input);
    try {
      await checkPassword();
      setInput("");
      setState("open");
    } catch (err) {
      setAdminPassword("");
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "open") {
    return (
      <>
        <div className="lockbar">
          <button className="btn small ghost" onClick={() => setAdminPassword("")}>
            Lock this page
          </button>
        </div>
        {children}
      </>
    );
  }

  if (state === "checking") {
    return (
      <div className="page">
        <p className="lede">Checking...</p>
      </div>
    );
  }

  if (state === "unconfigured") {
    return (
      <div className="page narrow">
        <h1>{title}</h1>
        <p className="notice error">
          The server has no password yet. Add <code>ADMIN_PASSWORD=your-password</code> to{" "}
          <code>server/.env</code> and restart the server.
        </p>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <h1>{title}</h1>
      <p className="lede">Enter the password to continue.</p>
      {error && <p className="notice error">{error}</p>}
      <form className="panel" onSubmit={handleSubmit}>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit" disabled={busy || !input}>
          {busy ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
