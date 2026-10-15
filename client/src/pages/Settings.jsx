import { useEffect, useState } from "react";
import {
  addPlayer,
  deletePlayer,
  getPlayers,
  getSettings,
  importBackup,
  recalculateStats,
  saveSettings,
  saveSite,
  updatePlayer,
} from "../api.js";
import Avatar from "../components/Avatar.jsx";
import PasswordGate from "../components/PasswordGate.jsx";
import { useSite } from "../components/SiteContext.jsx";
import { makeBackground, makeFavicon } from "../lib/images.js";

// Shrinks a picked image to a small centred square so faces stay tiny in the database.
function shrinkToSquare(file, size = 160) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas
        .getContext("2d")
        .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = url;
  });
}

// Tab icon, page background image, and how strongly the colour covers it.
function AppearanceSection({ onError, onMessage }) {
  const { site, setSite, reload } = useSite();
  const [opacity, setOpacity] = useState(site.overlayOpacity);
  const [busy, setBusy] = useState(false);

  // Pick up the saved value once it has loaded.
  useEffect(() => {
    setOpacity(site.overlayOpacity);
  }, [site.overlayOpacity]);

  // Leaving the page drops a slider change that wasn't saved.
  useEffect(() => () => { reload(); }, [reload]);

  async function run(action, done) {
    setBusy(true);
    onError("");
    onMessage("");
    try {
      await action();
      await reload();
      onMessage(done);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(maker, field, done) {
    return (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      run(async () => saveSite({ [field]: await maker(file) }), done);
    };
  }

  const percent = Math.round(opacity * 100);

  return (
    <section className="panel">
      <h2>Site look</h2>
      <p className="hint">
        The icon shown in the browser tab, and a picture behind the whole site that stays still
        while the page scrolls over it.
      </p>

      <div className="look-row">
        <div className="look-preview">
          {site.hasFavicon ? (
            <img src={`/api/site/favicon?v=${site.faviconV}`} width="40" height="40" alt="Tab icon" />
          ) : (
            <span className="look-empty">No icon</span>
          )}
        </div>
        <div className="look-controls">
          <strong>Tab icon</strong>
          <small className="muted">Any image. It is cropped to a small square.</small>
          <div className="actions tight">
            <label className="btn small">
              {site.hasFavicon ? "Change icon" : "Add icon"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={pick(makeFavicon, "favicon", "Tab icon saved.")}
              />
            </label>
            {site.hasFavicon && (
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => run(() => saveSite({ favicon: "" }), "Tab icon removed.")}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="look-row">
        <div className="look-preview wide">
          {site.hasBackground ? (
            <img src={`/api/site/background?v=${site.backgroundV}`} alt="Background" />
          ) : (
            <span className="look-empty">No background</span>
          )}
        </div>
        <div className="look-controls">
          <strong>Background image</strong>
          <small className="muted">
            Large photos are shrunk to fit (longest side 1920px) before saving.
          </small>
          <div className="actions tight">
            <label className="btn small">
              {site.hasBackground ? "Change background" : "Add background"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={pick(makeBackground, "background", "Background saved.")}
              />
            </label>
            {site.hasBackground && (
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => run(() => saveSite({ background: "" }), "Background removed.")}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {site.hasBackground && (
        <div className="field">
          <span>Colour over the image: {percent}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={percent}
            aria-label="Colour opacity over the background image"
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setOpacity(v);
              setSite((s) => ({ ...s, overlayOpacity: v })); // live preview
            }}
          />
          <small>
            The page's dark colour sits on top of the image. Lower shows more of the image, 100%
            hides it. The change shows right away; press Save to keep it.
          </small>
          <div className="actions tight">
            <button
              type="button"
              className="btn small primary"
              disabled={busy}
              onClick={() => run(() => saveSite({ overlayOpacity: opacity }), "Opacity saved.")}
            >
              Save opacity
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function GeminiSection({ onError, onMessage }) {
  const [info, setInfo] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return getSettings()
      .then((s) => {
        setInfo(s);
        setModel(s.model);
        setPrompt(s.prompt);
      })
      .catch((err) => onError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function run(action, done) {
    setBusy(true);
    onError("");
    onMessage("");
    try {
      await action();
      await load();
      onMessage(done);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <section className="panel"><p>Loading Gemini settings...</p></section>;

  const keyStatus = info.apiKeySet
    ? `A key is saved (ends in ${info.apiKeyPreview.replace("...", "")}, from ${
        info.apiKeySource === "env" ? "the server's .env file" : "this page"
      }).`
    : "No key saved yet.";

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await saveSettings({ apiKey, model, prompt });
          setApiKey("");
        }, "Gemini settings saved.");
      }}
    >
      <h2>Gemini</h2>
      <p className="hint">Controls how screenshots are read. Changes apply to the next upload.</p>

      <label className="field">
        <span>API key</span>
        <input
          type="password"
          autoComplete="off"
          placeholder={info.apiKeySet ? "Paste a new key to replace the saved one" : "Paste your key"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <small>
          {keyStatus} Get a free key at aistudio.google.com. The key stays on the server and is
          never shown again here.
        </small>
      </label>

      {info.apiKeySource === "settings" && (
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => run(() => saveSettings({ clearApiKey: true }), "Saved key removed.")}
        >
          Remove saved key
        </button>
      )}

      <label className="field">
        <span>Model</span>
        <input value={model} onChange={(e) => setModel(e.target.value)} />
        <small>
          Default is {info.defaultModel}. Check Google AI Studio for the current free models, and
          leave this empty to use the default.
        </small>
      </label>

      <label className="field">
        <span>Prompt</span>
        <textarea rows={18} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <small>
          Keep the JSON shape: players, each with gamertag, won, kos, falls, accidents, damageDone
          and damageTaken. The review table and the leaderboards rely on those names.
        </small>
      </label>
      <button type="button" className="btn small" onClick={() => setPrompt(info.defaultPrompt)}>
        Reset prompt to default
      </button>

      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save Gemini settings"}
        </button>
      </div>
    </form>
  );
}

function PlayerRow({ player, onChanged, onError, onMessage }) {
  const [name, setName] = useState(player.name);
  const [tags, setTags] = useState(player.gamertags.join(", "));
  const [busy, setBusy] = useState(false);

  const dirty = name !== player.name || tags !== player.gamertags.join(", ");

  async function run(action, done) {
    setBusy(true);
    onError("");
    onMessage("");
    try {
      await action();
      await onChanged();
      if (done) onMessage(done);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFace(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    run(async () => {
      const face = await shrinkToSquare(file);
      await updatePlayer(player._id, { face });
    }, `${player.name}'s face updated.`);
  }

  return (
    <li className="player-row">
      <div className="face-col">
        <Avatar name={player.name} face={player.face} size={64} />
        <label className="link-btn">
          {player.face ? "Change face" : "Add face"}
          <input type="file" accept="image/*" className="sr-only" onChange={handleFace} disabled={busy} />
        </label>
        {player.face && (
          <button
            type="button"
            className="link-btn"
            disabled={busy}
            onClick={() => run(() => updatePlayer(player._id, { face: "" }), "Face removed.")}
          >
            Remove
          </button>
        )}
      </div>

      <div className="player-fields">
        <label className="field">
          <span>Usual name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Gamertags</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
          <small>Separate several with commas.</small>
        </label>
        <div className="actions tight">
          <button
            type="button"
            className="btn small"
            disabled={busy || !dirty}
            onClick={() =>
              run(
                () => updatePlayer(player._id, { name, gamertags: tags }),
                `${name} saved. Old matches were re-linked.`
              )
            }
          >
            Save
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete ${player.name}? Their matches stay, but they leave the leaderboards.`)) {
                run(() => deletePlayer(player._id), `${player.name} deleted.`);
              }
            }}
          >
            Delete player
          </button>
        </div>
      </div>
    </li>
  );
}

function PlayersSection({ onError, onMessage }) {
  const [players, setPlayers] = useState(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    getPlayers()
      .then(setPlayers)
      .catch((err) => onError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    onError("");
    onMessage("");
    try {
      await addPlayer({ name, gamertags: tags });
      setName("");
      setTags("");
      await load();
      onMessage("Player added.");
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Players</h2>
      <p className="hint">
        The site shows the usual name, never the gamertag. Gemini reads gamertags from the
        screenshot and they are matched to a player here. Faces appear on the leaderboards for
        the top 3.
      </p>

      {!players && <p>Loading players...</p>}
      {players && players.length === 0 && <p className="hint">No players yet. Add the first one below.</p>}
      {players && (
        <ul className="player-list">
          {players.map((p) => (
            <PlayerRow
              key={p._id + p.updatedAt}
              player={p}
              onChanged={load}
              onError={onError}
              onMessage={onMessage}
            />
          ))}
        </ul>
      )}

      <form className="add-player" onSubmit={handleAdd}>
        <h3>Add a new player</h3>
        <div className="row">
          <label className="field">
            <span>Usual name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Gamertag</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
            <small>Separate several with commas.</small>
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={busy || !name.trim() || !tags.trim()}>
          Add player
        </button>
      </form>
    </section>
  );
}

function MaintenanceSection({ onError, onMessage }) {
  const [busy, setBusy] = useState(false);

  async function handleRecalculate() {
    setBusy(true);
    onError("");
    onMessage("");
    try {
      const r = await recalculateStats();
      onMessage(`Leaderboard totals rebuilt from ${r.matches} matches.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Leaderboard totals</h2>
      <p className="hint">
        Totals are saved in the database and updated each time a match is saved, so nothing is
        recalculated from the start. They rebuild on their own after a match is deleted or a
        player changes. This button is only for repairs.
      </p>
      <button className="btn" onClick={handleRecalculate} disabled={busy}>
        {busy ? "Rebuilding..." : "Rebuild totals"}
      </button>
    </section>
  );
}

function ImportSection({ onError, onMessage, onImported }) {
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onError("That file is over 4 MB, which is more than the website accepts in one upload. A normal backup is far smaller.");
      return;
    }
    const sure = window.confirm(
      "This REPLACES all current matches, 1v1s and players with the contents of the file. " +
        "If you might want the current data, download a backup first (Add match page). Continue?"
    );
    if (!sure) return;
    setBusy(true);
    onError("");
    onMessage("");
    try {
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't a valid backup (it isn't readable JSON).");
      }
      const r = await importBackup(backup);
      onMessage(
        `Imported ${r.players} players, ${r.matches} matches and ${r.duels} 1v1s. The leaderboards were rebuilt.`
      );
      setFile(null);
      setInputKey((k) => k + 1);
      onImported();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Import data</h2>
      <p className="hint">
        Restore from a backup file made with "Download backup" on the Add match page. This
        replaces everything currently saved (matches, 1v1s, players, Gemini model and prompt).
        The Gemini key, background image and tab icon are not part of a backup and stay as they
        are.
      </p>
      <label className="field">
        <span>Backup file (.json)</span>
        <input
          key={inputKey}
          type="file"
          accept="application/json,.json"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <button className="btn danger" onClick={handleImport} disabled={busy || !file}>
        {busy ? "Importing..." : "Import and replace data"}
      </button>
    </section>
  );
}

function SettingsContent() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Bumped after an import so the other sections load the restored data.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="lede">Site look, Gemini, players and faces.</p>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <AppearanceSection key={`a${reloadKey}`} onError={setError} onMessage={setMessage} />
      <GeminiSection key={`g${reloadKey}`} onError={setError} onMessage={setMessage} />
      <PlayersSection key={`p${reloadKey}`} onError={setError} onMessage={setMessage} />
      <MaintenanceSection onError={setError} onMessage={setMessage} />
      <ImportSection
        onError={setError}
        onMessage={setMessage}
        onImported={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

export default function Settings() {
  return (
    <PasswordGate title="Settings">
      <SettingsContent />
    </PasswordGate>
  );
}
