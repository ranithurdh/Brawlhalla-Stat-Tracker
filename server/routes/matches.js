import { Router } from "express";
import mongoose from "mongoose";
import Match from "../models/Match.js";
import Player from "../models/Player.js";
import Duel from "../models/Duel.js";
import { optionalAdmin, requireAdmin } from "../middleware/admin.js";
import { makeRoster, playerForRow } from "../services/roster.js";
import { makeFingerprint } from "../services/migrate.js";
import { readDraftToken } from "../services/draft.js";
import { applyMatchToStats, recomputeAllStats } from "../services/stats.js";
import { DUPLICATE_MESSAGE, duplicateError, isDuplicate } from "../services/duplicates.js";

const MIN_MEMBERS = 2;
// A match with exactly this many rows is a 1v1. It is saved on the 1v1 page's
// own stats (ELO) and never touches the usual leaderboards.
const DUEL_ROWS = 2;

const router = Router();

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toText = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const bad = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Cleans and checks the rows of a match (used when saving and when editing).
// Throws a 400 that says what to fix. Returns the rows ready to store.
function buildRows(rawPlayers, roster) {
  const players = (Array.isArray(rawPlayers) ? rawPlayers : [])
    .filter((p) => toText(p?.gamertag))
    .map((p) => {
      const row = {
        gamertag: toText(p.gamertag),
        playerId: p.playerId && mongoose.isValidObjectId(p.playerId) ? p.playerId : null,
        won: p.won === true ? true : p.won === false ? false : null,
        kos: toNumber(p.kos),
        falls: toNumber(p.falls),
        accidents: toNumber(p.accidents),
        damageDone: toNumber(p.damageDone),
        damageTaken: toNumber(p.damageTaken),
      };
      // Link rows whose gamertag exactly matches a member.
      const member = playerForRow(roster, row);
      row.playerId = member ? member._id : null;
      row._label = member ? member.name : row.gamertag;
      return row;
    });

  if (players.length === 0) throw bad("Add at least one player.");

  const linked = players.filter((p) => p.playerId).map((p) => String(p.playerId));
  if (new Set(linked).size !== linked.length) {
    throw bad("The same member is chosen on two rows.");
  }
  // A 1v1 only counts when both players are registered members.
  if (players.length === DUEL_ROWS && linked.length < DUEL_ROWS) {
    throw bad(
      "This is a 1v1, and 1v1s only count when both players are registered members. Add the missing player in Settings first."
    );
  }
  // A match must contain at least 2 of the players listed in Settings. This
  // keeps unrelated screenshots out.
  if (linked.length < MIN_MEMBERS) {
    throw bad(
      `A match must include at least ${MIN_MEMBERS} of the players listed in Settings. This one has ${linked.length}.`
    );
  }

  for (const p of players) {
    if (p.won === null) throw bad(`Say whether ${p._label} won or lost.`);
    if (p.playerId) {
      for (const key of ["kos", "falls", "accidents", "damageDone", "damageTaken"]) {
        if (p[key] === null || p[key] < 0) {
          throw bad(`Fill in ${key} for ${p._label} (a number, 0 or more).`);
        }
      }
    }
  }
  if (!players.some((p) => p.won) || players.every((p) => p.won)) {
    throw bad("Mark the winning team: at least one winner and at least one loser.");
  }

  return players.map(({ _label, ...rest }) => rest);
}

// Anyone can read matches. Names shown are the members' usual names.
router.get("/", async (req, res, next) => {
  try {
    const [matches, players] = await Promise.all([
      Match.find().sort({ createdAt: -1 }).limit(100).lean(),
      Player.find(),
    ]);
    const roster = makeRoster(players);

    res.json(
      matches.map((m) => {
        const rows = m.players.map((row) => {
          const player = playerForRow(roster, row);
          return {
            ...row,
            playerId: player ? String(player._id) : null,
            displayName: player ? player.name : null,
          };
        });
        return {
          _id: m._id,
          createdAt: m.createdAt,
          players: rows,
          // The winning team, as usual names (gamertag if not a member).
          winners: rows.filter((r) => r.won === true).map((r) => r.displayName || r.gamertag),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

// Saving a match:
// - Admin (password header): saves the rows they send, edited or not.
// - Everyone else: sends only the signed draft from the upload step, and what
//   Gemini read is saved exactly as it was. Rows link to members by exact
//   gamertag only (a "close spelling" guess is something an admin has to confirm).
router.post("/", optionalAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const roster = makeRoster(await Player.find());

    const raw = req.isAdmin
      ? body.players
      : readDraftToken(body.draftToken).map((p) => ({ ...p, playerId: null }));

    let rows;
    try {
      rows = buildRows(raw, roster);
    } catch (err) {
      if (!req.isAdmin && err.statusCode === 400) {
        err.message += " Only an admin can edit what Gemini read, so ask one to add this match.";
      }
      throw err;
    }

    // Exactly the same stats as a saved match (in any order) is the same match.
    const fingerprint = makeFingerprint(rows);
    if (await isDuplicate(fingerprint)) throw duplicateError();

    // Two players = a 1v1: it goes to the 1v1 page, not the usual stats.
    if (rows.length === DUEL_ROWS) {
      const duel = await Duel.create({ players: rows, fingerprint });
      return res.status(201).json({ ...duel.toObject(), mode: "1v1" });
    }

    const match = await Match.create({ players: rows, fingerprint });
    await applyMatchToStats(match);
    res.status(201).json({ ...match.toObject(), mode: "match" });
  } catch (err) {
    // Two saves at the same moment can both pass the check above; the unique
    // index on the fingerprint stops the second one.
    if (err.code === 11000) {
      return res.status(409).json({ error: DUPLICATE_MESSAGE, code: "duplicate" });
    }
    next(err);
  }
});

// Admin only: change a saved match, then rebuild the totals.
router.put("/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Unknown match.", 404);
    const match = await Match.findById(req.params.id);
    if (!match) throw bad("Unknown match.", 404);

    const roster = makeRoster(await Player.find());
    const rows = buildRows(req.body?.players, roster);
    if (rows.length === DUEL_ROWS) {
      throw bad("A match with two players is a 1v1. Delete this one and add the 1v1 as a new match instead.");
    }
    const fingerprint = makeFingerprint(rows);

    if (await isDuplicate(fingerprint, { ignoreMatchId: match._id })) throw duplicateError();

    match.players = rows;
    match.fingerprint = fingerprint;
    await match.save();
    await recomputeAllStats();
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: DUPLICATE_MESSAGE, code: "duplicate" });
    }
    next(err);
  }
});

// Admin only.
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    await Match.findByIdAndDelete(req.params.id);
    await recomputeAllStats();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
