import { Router } from "express";
import express from "express";
import Match from "../models/Match.js";
import Duel from "../models/Duel.js";
import Player from "../models/Player.js";
import Settings from "../models/Settings.js";
import Site from "../models/Site.js";
import PlayerStats from "../models/PlayerStats.js";
import TeamStats from "../models/TeamStats.js";
import { requireAdmin } from "../middleware/admin.js";
import { makeFingerprint } from "../services/migrate.js";
import { recomputeAllStats } from "../services/stats.js";

// Backup = one small JSON file with everything that can't be rebuilt:
// players (with faces), matches, 1v1s, and the Gemini model/prompt.
// Left out on purpose: the Gemini API key (a secret), the saved totals (rebuilt
// from the matches on import) and the background/tab-icon images (big files).
const FORMAT = "sandun-brawlding-backup";
const VERSION = 1;

const router = Router();

const bad = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

async function buildBackup() {
  const [players, matches, duels, settings, site] = await Promise.all([
    Player.find().sort({ createdAt: 1 }).lean(),
    Match.find().sort({ createdAt: 1 }).lean(),
    Duel.find().sort({ createdAt: 1 }).lean(),
    Settings.findOne({ key: "main" }).lean(),
    Site.findOne({ key: "main" }).lean(),
  ]);
  const clean = ({ __v, ...rest }) => rest;
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    players: players.map(clean),
    matches: matches.map(clean),
    duels: duels.map(clean),
    settings: { model: settings?.model || "", prompt: settings?.prompt || "" },
    site: { overlayOpacity: site?.overlayOpacity ?? 0.85 },
  };
}

// Admin only: download everything as a file.
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const backup = await buildBackup();
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="brawlding-backup-${day}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(backup));
  } catch (err) {
    next(err);
  }
});

// Turns the file's rows into checked, correctly typed documents (ObjectIds,
// dates) without saving anything yet. Throws a 400 that says what is wrong.
async function parseBackup(body) {
  if (!body || body.format !== FORMAT) {
    throw bad("That isn't a backup file from this site.");
  }
  if (body.version !== VERSION) {
    throw bad("That backup was made by a different version of the site.");
  }
  for (const key of ["players", "matches", "duels"]) {
    if (!Array.isArray(body[key])) throw bad(`The backup file is damaged (missing "${key}").`);
  }

  const cast = async (Model, rows, label, prepare = (r) => r) => {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const doc = new Model(prepare(rows[i]));
        await doc.validate();
        out.push(doc.toObject());
      } catch (err) {
        throw bad(`The backup file is damaged (${label} #${i + 1}: ${err.message}).`);
      }
    }
    return out;
  };

  const players = await cast(Player, body.players, "player", (r) => {
    if (r.face && !/^data:image\//.test(r.face)) return { ...r, face: "" };
    return r;
  });
  // The fingerprint is worked out again from the stats, so it is always right.
  const withFingerprint = (r) => ({ ...r, fingerprint: makeFingerprint(r.players || []) });
  const matches = await cast(Match, body.matches, "match", withFingerprint);
  const duels = await cast(Duel, body.duels, "1v1", withFingerprint);

  const seen = new Set();
  for (const m of [...matches, ...duels]) {
    if (seen.has(m.fingerprint)) throw bad("The backup file contains the same match twice.");
    seen.add(m.fingerprint);
  }

  const opacity = Number(body.site?.overlayOpacity);
  return {
    players,
    matches,
    duels,
    model: typeof body.settings?.model === "string" ? body.settings.model.trim() : "",
    prompt: typeof body.settings?.prompt === "string" ? body.settings.prompt.trim() : "",
    overlayOpacity: Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : null,
  };
}

async function replaceAll(data) {
  await Promise.all([
    Match.deleteMany({}),
    Duel.deleteMany({}),
    Player.deleteMany({}),
    PlayerStats.deleteMany({}),
    TeamStats.deleteMany({}),
  ]);
  // Raw inserts keep the original ids and dates, so matches still point at the right players.
  if (data.players.length) await Player.collection.insertMany(data.players);
  if (data.matches.length) await Match.collection.insertMany(data.matches);
  if (data.duels.length) await Duel.collection.insertMany(data.duels);

  const update = { model: data.model, prompt: data.prompt, seededPlayers: true };
  await Settings.findOneAndUpdate({ key: "main" }, update, { upsert: true, setDefaultsOnInsert: true });
  if (data.overlayOpacity !== null) {
    await Site.findOneAndUpdate(
      { key: "main" },
      { overlayOpacity: data.overlayOpacity },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  await recomputeAllStats();
}

// Admin only: replace everything with the contents of a backup file.
// A bigger body limit than the rest of the API (faces are small pictures).
router.post("/import", requireAdmin, express.json({ limit: "25mb" }), async (req, res, next) => {
  try {
    const data = await parseBackup(req.body);

    // Keep what is there now, so a failure half-way can be undone.
    const previous = await buildBackup();
    try {
      await replaceAll(data);
    } catch (err) {
      console.error("Import failed, putting the old data back:", err);
      try {
        await replaceAll(await parseBackup(previous));
      } catch (undoErr) {
        console.error("Could not put the old data back:", undoErr);
      }
      throw bad(`The import failed and the previous data was put back. (${err.message})`, 500);
    }

    res.json({
      ok: true,
      players: data.players.length,
      matches: data.matches.length,
      duels: data.duels.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
