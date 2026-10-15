import { useEffect, useState } from "react";
import {
  downloadBackup,
  extractStats,
  getAuthStatus,
  getPlayers,
  getUploadCode,
  saveMatch,
  setUploadCode,
} from "../api.js";
import AdminUnlock from "../components/AdminUnlock.jsx";
import MatchEditor from "../components/MatchEditor.jsx";
import useAdmin from "../components/useAdmin.js";
import { blankPlayer, rowFromServer, rowToPayload } from "../lib/matchForm.js";
import { addToQueue, listQueue, queueItemToFile, removeFromQueue } from "../lib/queue.js";

const MAX_BYTES = 5 * 1024 * 1024; // same limit as the server
const TYPES = ["image/png", "image/jpeg", "image/webp"];

// Errors that will never fix themselves for that screenshot, so it leaves the queue.
const isFinal = (err) => err.code === "duplicate" || err.code === "not_counted";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Thumb({ blob, name }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img className="queue-thumb" src={url} alt={name} /> : <span className="queue-thumb" />;
}

export default function Upload() {
  const isAdmin = useAdmin();
  const [members, setMembers] = useState([]);
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  // original = exactly what Gemini read (what everyone but an admin submits);
  // rows = the working copy an admin can edit. queueId is set when the screenshot
  // came out of the waiting list.
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Screenshots waiting for Gemini, saved in the browser between visits.
  const [queue, setQueue] = useState([]);
  // The server can ask for an upload code before it reads screenshots.
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [backingUp, setBackingUp] = useState(false);

  const refreshQueue = async () => {
    try {
      const items = await listQueue();
      setQueue(items);
      return items;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    getPlayers()
      .then(setMembers)
      .catch((err) => setError(err.message));
    getAuthStatus()
      .then((s) => {
        if (s.uploadCodeRequired && !getUploadCode()) setNeedsCode(true);
      })
      .catch(() => {});
    refreshQueue();
  }, []);

  function saveCode(e) {
    e.preventDefault();
    setUploadCode(codeInput.trim());
    setCodeInput("");
    setNeedsCode(false);
    setError("");
  }

  async function handleBackup() {
    setBackingUp(true);
    setError("");
    setMessage("");
    try {
      const name = await downloadBackup();
      setMessage(`Backup downloaded (${name}). Keep it somewhere safe: Settings > Import data restores it.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBackingUp(false);
    }
  }

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setFile(null);
    setDraft(null);
    setInputKey((k) => k + 1);
  }

  async function enqueue(files) {
    try {
      await addToQueue(files);
      const items = await refreshQueue();
      return items.length;
    } catch (err) {
      setError(`The screenshot couldn't be saved to the queue: ${err.message}`);
      return null;
    }
  }

  async function handlePick(e) {
    const picked = Array.from(e.target.files || []);
    setDraft(null);
    setError("");
    setMessage("");

    const good = picked.filter((f) => TYPES.includes(f.type) && f.size <= MAX_BYTES);
    const skipped = picked.length - good.length;
    if (skipped) {
      setError(`${plural(skipped, "file was", "files were")} skipped: only PNG, JPG or WebP up to 5 MB.`);
    }

    if (good.length <= 1) {
      setFile(good[0] || null);
      return;
    }
    // Several screenshots at once: they all wait in the queue and are read one by one.
    setFile(null);
    setInputKey((k) => k + 1);
    const total = await enqueue(good);
    if (total !== null) {
      setMessage(`${plural(good.length, "screenshot", "screenshots")} added to the queue (${total} waiting). Press "Process queue" to read them one by one.`);
    }
  }

  const loadDraft = (data, extra = {}) => {
    const rows = data.players.length ? data.players.map(rowFromServer) : [blankPlayer()];
    setDraft({ token: data.draftToken, original: rows, rows, ...extra });
  };

  async function handleExtract() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      loadDraft(await extractStats(file));
    } catch (err) {
      if (err.code === "gemini_limit") {
        // Gemini's limit is over: keep the screenshot for later instead of losing it.
        const total = await enqueue([file]);
        if (total !== null) {
          reset();
          setMessage(
            `Gemini's limit is over, so the screenshot was added to the queue (${total} waiting). It is saved on this device and will still be here next time you open the site.`
          );
        }
      } else {
        if (err.code === "upload_code_required") setNeedsCode(true);
        setError(err.message);
        if (isFinal(err)) reset();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToQueue() {
    const total = await enqueue([file]);
    if (total !== null) {
      reset();
      setMessage(`Added to the queue (${total} waiting). It is saved on this device.`);
    }
  }

  // Reads waiting screenshots one at a time, oldest first, until one needs a
  // review (or Gemini's limit is hit again). Duplicates and screenshots that
  // can't count are taken off the list and mentioned in the message.
  async function processQueue(lead = "") {
    setBusy(true);
    setError("");
    const notes = lead ? [lead] : [];
    try {
      let items = await listQueue();
      for (const item of items) {
        try {
          const data = await extractStats(queueItemToFile(item));
          setFile(queueItemToFile(item));
          loadDraft(data, { queueId: item.id });
          setMessage(notes.join(" "));
          return;
        } catch (err) {
          if (err.code === "gemini_limit") {
            const left = (await refreshQueue()).length;
            setMessage(notes.join(" "));
            setError(
              `Gemini's limit is still over. ${plural(left, "screenshot is", "screenshots are")} waiting in the queue and will be kept for next time.`
            );
            return;
          }
          if (isFinal(err)) {
            await removeFromQueue(item.id);
            notes.push(`${item.name}: ${err.message} (taken off the queue)`);
            continue;
          }
          // Anything else (bad key, network...) may be fixable, so the screenshot stays.
          if (err.code === "upload_code_required") setNeedsCode(true);
          setMessage(notes.join(" "));
          setError(err.message);
          return;
        }
      }
      setMessage([...notes, "The queue is empty."].join(" "));
    } catch (err) {
      setError(err.message);
    } finally {
      await refreshQueue();
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    const fromQueue = draft.queueId;
    try {
      // An admin sends their (possibly edited) rows. Everyone else can only send
      // the signed draft, so what Gemini read is saved exactly as it was.
      const saved = await saveMatch(isAdmin ? { players: draft.rows.map(rowToPayload) } : { draftToken: draft.token });
      const done =
        saved.mode === "1v1"
          ? "1v1 saved. It counts on the 1v1 page (ELO updated), not in the usual stats."
          : "Match saved and the leaderboards are updated.";
      reset();
      if (fromQueue) {
        await removeFromQueue(fromQueue);
        const left = (await refreshQueue()).length;
        if (left) {
          // Carry on with the next waiting screenshot.
          setMessage(done);
          await processQueue(done);
          return;
        }
        setMessage(`${done} The queue is empty.`);
      } else {
        setMessage(`${done} You can add another screenshot.`);
      }
    } catch (err) {
      setError(err.message);
      if (fromQueue && isFinal(err)) {
        // Already added (or can't count): it doesn't need to wait in the queue any more.
        await removeFromQueue(fromQueue);
        await refreshQueue();
        reset();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    if (draft?.queueId) {
      await removeFromQueue(draft.queueId);
      await refreshQueue();
    }
    reset();
  }

  async function handleRemoveQueued(id) {
    await removeFromQueue(id);
    await refreshQueue();
  }

  return (
    <>
      <AdminUnlock isAdmin={isAdmin} />
      <div className="page">
        <h1>Add a match</h1>
        <p className="lede">
          Upload the post-match stats screenshot. Gemini reads it and you submit what it read.
          Only an admin can change the numbers first. Legends are ignored. A match with just two
          players is a 1v1: it goes to the 1v1 page and only counts when both are registered
          members.
        </p>

        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}

        {isAdmin && (
          <section className="panel">
            <h2>Backup</h2>
            <p className="hint">
              Download every match, 1v1, player and setting as one small file (the Gemini key is
              not included). To restore it, use Settings &gt; Import data.
            </p>
            <button className="btn" onClick={handleBackup} disabled={backingUp}>
              {backingUp ? "Preparing..." : "Download backup"}
            </button>
          </section>
        )}

        {needsCode && !isAdmin && (
          <section className="panel">
            <form onSubmit={saveCode}>
              <label className="field">
                <span>Upload code (ask an admin). It is remembered on this device.</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                />
              </label>
              <button className="btn primary" type="submit" disabled={!codeInput.trim()}>
                Save code
              </button>
            </form>
          </section>
        )}

        <section className="panel">
          <label className="field">
            <span>Screenshot (PNG, JPG or WebP, up to 5 MB). Pick several to queue them all.</span>
            <input
              key={inputKey}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePick}
              disabled={Boolean(draft)}
            />
          </label>

          {previewUrl && <img className="preview" src={previewUrl} alt="Selected match screenshot" />}

          {file && !draft && (
            <div className="actions">
              <button className="btn primary" onClick={handleExtract} disabled={busy}>
                {busy ? "Reading screenshot..." : "Extract stats"}
              </button>
              <button className="btn" onClick={handleAddToQueue} disabled={busy}>
                Add to queue instead
              </button>
            </div>
          )}
        </section>

        {queue.length > 0 && (
          <section className="panel">
            <div className="match-head">
              <div>
                <h2>Screenshot queue ({queue.length})</h2>
                <p className="hint">
                  Waiting to be read by Gemini. When the limit runs out, screenshots land here
                  automatically. They are saved on this device, so they are still here next time
                  you open the site.
                </p>
              </div>
              <button className="btn primary" onClick={() => processQueue()} disabled={busy || Boolean(draft)}>
                {busy && !draft ? "Reading..." : "Process queue"}
              </button>
            </div>
            <ul className="queue-list">
              {queue.map((item, i) => (
                <li key={item.id} className="queue-item">
                  <span className="queue-pos">{i + 1}</span>
                  <Thumb blob={item.blob} name={item.name} />
                  <span className="who">
                    <strong>{item.name}</strong>
                    <small>
                      Added {new Date(item.addedAt).toLocaleString()} · {(item.size / 1024).toFixed(0)} KB
                    </small>
                  </span>
                  <button
                    className="btn small"
                    onClick={() => handleRemoveQueued(item.id)}
                    disabled={busy || draft?.queueId === item.id}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {draft && (
          <section className="panel">
            <h2>{isAdmin ? "Check the stats" : "What Gemini read"}</h2>
            {isAdmin ? (
              <p className="hint">
                Gemini can misread a digit or a name. Pick the dorm member for each gamertag, set
                who won, and fix anything that looks wrong. A match needs at least 2 of the
                players listed in Settings. Rows left as "Not a member" are saved but don't count
                towards anyone's stats. With only two rows it is a 1v1, which needs both players
                to be members.
              </p>
            ) : (
              <p className="hint">
                These numbers are saved exactly as read. If something is wrong, ask an admin to
                add this match (they can fix the numbers), or upload a clearer screenshot.
              </p>
            )}

            <MatchEditor
              members={members}
              rows={isAdmin ? draft.rows : draft.original}
              onChange={(rows) => setDraft((d) => ({ ...d, rows }))}
              readOnly={!isAdmin}
            />

            <div className="actions">
              <button className="btn primary" onClick={handleSave} disabled={busy}>
                {busy ? "Saving..." : isAdmin ? "Save match" : "Submit match"}
              </button>
              {draft.queueId ? (
                <>
                  <button className="btn" onClick={reset} disabled={busy}>
                    Keep in queue
                  </button>
                  <button className="btn danger" onClick={handleDiscard} disabled={busy}>
                    Discard screenshot
                  </button>
                </>
              ) : (
                <button className="btn" onClick={reset} disabled={busy}>
                  Start over
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
