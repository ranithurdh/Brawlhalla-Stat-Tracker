import crypto from "crypto";
import Match from "../models/Match.js";
import Duel from "../models/Duel.js";
import Player from "../models/Player.js";
import Settings from "../models/Settings.js";
import PlayerStats from "../models/PlayerStats.js";
import TeamStats from "../models/TeamStats.js";
import RateLimit from "../models/RateLimit.js";
import { makeRoster, normTag, playerForRow } from "./roster.js";
import { recomputeAllStats } from "./stats.js";

// The six starting members. Added once, on the first start with an empty roster.
const STARTING_PLAYERS = [
  { name: "Ranithu", gamertags: ["rdhthenerd"] },
  { name: "Sadaham", gamertags: ["sadahamthalpavila"] },
  { name: "Nadin", gamertags: ["dudeberserker"] },
  { name: "Sandanu", gamertags: ["Amarabandu_Rupasinghe"] },
  { name: "Bhashika", gamertags: ["unknowndunnosomeone"] },
  { name: "Nithil", gamertags: ["nithil.senila7"] },
];

// Bump this when the stat rules change so the saved totals are rebuilt once.
// 2 = least damage needs all 3 lives lost; most-dominant counts added.
// 3 = a life is a fall only (accidents no longer count); dominant uses damage per
//     life; most-dominated counts added.
// 4 = most dominated is the highest (damage taken - damage done) per life in a
//     match, counted per match like most dominant.
const STATS_VERSION = 4;

export function makeFingerprint(players) {
  const parts = players
    .map((p) =>
      [normTag(p.gamertag), p.kos, p.falls, p.accidents, p.damageDone, p.damageTaken, p.won].join(":")
    )
    .sort();
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

// Old matches stored a winning team colour or player name, not a per-player flag.
function inferWon(row, winner, rows) {
  const w = String(winner || "").trim().toLowerCase();
  if (!w) return null;
  const team = (r) => String(r.team || "").trim().toLowerCase();
  const name = (r) => String(r.name || "").trim().toLowerCase();
  const known = rows.some((r) => team(r) === w) || rows.some((r) => name(r) === w);
  if (!known) return null;
  return team(row) === w || name(row) === w;
}

// Upgrades matches saved by the previous version (name / suicides / damageDealt).
async function migrateMatches() {
  const coll = Match.collection;
  const old = await coll.find({ "players.name": { $exists: true } }).toArray();
  let converted = 0;
  for (const doc of old) {
    const players = doc.players.map((p) => ({
      gamertag: p.gamertag ?? p.name,
      playerId: null,
      won: inferWon(p, doc.winnerTeam, doc.players),
      kos: p.kos ?? null,
      falls: p.falls ?? null,
      accidents: p.accidents ?? p.suicides ?? null,
      damageDone: p.damageDone ?? p.damageDealt ?? null,
      damageTaken: p.damageTaken ?? null,
    }));
    try {
      await coll.updateOne(
        { _id: doc._id },
        { $set: { players, fingerprint: makeFingerprint(players) } }
      );
      converted += 1;
    } catch (err) {
      console.warn(`Could not upgrade match ${doc._id}: ${err.message}`);
    }
  }
  if (converted) console.log(`Upgraded ${converted} saved match(es) to the new format.`);
  return converted;
}

// The old default prompt returns the old field names, so a saved copy of it is
// set aside and the new default takes over.
async function migratePrompt() {
  const res = await Settings.collection.findOne({ key: "main", promptVersion: { $ne: 2 } });
  if (!res) return;
  await Settings.collection.updateOne(
    { _id: res._id },
    { $set: { promptVersion: 2, prompt: "", legacyPrompt: res.prompt || "" } }
  );
  if (res.prompt) console.log("Saved prompt was from the old format; the new default prompt is now in use.");
}

// 1v1s used to be saved like any other match. Any saved match with exactly two
// players, both registered members (one winner, one loser), is moved to the 1v1
// collection so it stops counting in the usual stats. Safe to run on every start:
// it copies first and only deletes the original once the copy is saved.
async function moveDuels() {
  const candidates = await Match.collection.find({ players: { $size: 2 } }).toArray();
  if (!candidates.length) return 0;

  const roster = makeRoster(await Player.find());
  let moved = 0;
  for (const doc of candidates) {
    const [a, b] = doc.players;
    const pa = playerForRow(roster, a);
    const pb = playerForRow(roster, b);
    const oneEach = (a.won === true && b.won === false) || (a.won === false && b.won === true);
    if (!pa || !pb || String(pa._id) === String(pb._id) || !oneEach) continue;
    try {
      await Duel.collection.insertOne({
        players: doc.players,
        fingerprint: doc.fingerprint,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt || doc.createdAt,
        __v: 0,
      });
    } catch (err) {
      // Already copied on an earlier start that stopped before the delete.
      if (err.code !== 11000) {
        console.warn(`Could not move match ${doc._id} to 1v1: ${err.message}`);
        continue;
      }
    }
    await Match.collection.deleteOne({ _id: doc._id });
    moved += 1;
  }
  if (moved) console.log(`Moved ${moved} saved 1v1 match(es) to the 1v1 page.`);
  return moved;
}

async function seedPlayers() {
  let settings = await Settings.findOne({ key: "main" });
  if (!settings) settings = await Settings.create({ key: "main" });
  if (settings.seededPlayers) return;
  if ((await Player.countDocuments()) === 0) {
    await Player.insertMany(STARTING_PLAYERS);
    console.log("Added the starting members.");
  }
  settings.seededPlayers = true;
  await settings.save();
}

export async function prepareDatabase() {
  await Promise.all([Match.init(), Duel.init(), Player.init(), PlayerStats.init(), TeamStats.init(), Settings.init(), RateLimit.init()]);
  await migratePrompt();
  const converted = await migrateMatches();
  await seedPlayers();
  const movedDuels = await moveDuels();

  // Build the saved totals once if they're missing (first start after upgrading),
  // or if old matches were just converted. After this they're updated per match.
  const [statCount, teamCount, playerCount, matchCount] = await Promise.all([
    PlayerStats.countDocuments(),
    TeamStats.countDocuments(),
    Player.countDocuments(),
    Match.countDocuments(),
  ]);
  const settings = await Settings.findOne({ key: "main" });
  const outdated = (settings?.statsVersion || 1) < STATS_VERSION;

  if (outdated || converted || movedDuels || statCount < playerCount || (statCount === 0 && matchCount > 0) ||
    (teamCount === 0 && matchCount > 0)) {
    const r = await recomputeAllStats();
    console.log(`Built stats for ${r.players} players from ${r.matches} matches.`);
  }
  if (outdated && settings) {
    settings.statsVersion = STATS_VERSION;
    await settings.save();
  }
}
