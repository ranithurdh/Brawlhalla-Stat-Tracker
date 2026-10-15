import Player from "../models/Player.js";
import Match from "../models/Match.js";
import PlayerStats from "../models/PlayerStats.js";
import TeamStats from "../models/TeamStats.js";
import { makeRoster, playerForRow } from "./roster.js";
import {
  addRow,
  brawlerParts,
  buildBoards,
  buildTeamBoard,
  emptyStats,
  teamsInMatch,
  toRow,
} from "./statsMath.js";

// The tracked members in a match, one entry per member.
function membersInMatch(roster, match) {
  const seen = new Set();
  const out = [];
  for (const row of match.players) {
    const player = playerForRow(roster, row);
    if (!player || seen.has(String(player._id))) continue;
    seen.add(String(player._id));
    out.push({ player, row, playerId: String(player._id), won: row.won });
  }
  return out;
}

// The best-brawler timeline replays every match in order, so it is kept in
// memory and thrown away whenever a match or player changes.
let timelineCache = null;
const invalidateTimeline = () => {
  timelineCache = null;
};

// Quick update after saving one match.
export async function applyMatchToStats(match) {
  invalidateTimeline();
  const roster = makeRoster(await Player.find());
  const members = membersInMatch(roster, match);

  for (const m of members) {
    const doc = await PlayerStats.findOne({ playerId: m.player._id });
    const stats = doc ? doc.toObject() : emptyStats(m.player._id);
    addRow(stats, m.row, match);
    await PlayerStats.findOneAndUpdate({ playerId: m.player._id }, stats, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  }

  for (const team of teamsInMatch(members)) {
    await TeamStats.findOneAndUpdate(
      { key: team.key },
      {
        $setOnInsert: { playerIds: team.playerIds },
        $inc: { wins: team.won ? 1 : 0, losses: team.won ? 0 : 1 },
      },
      { upsert: true }
    );
  }
}

// Rebuilds every player's and team's totals from the saved matches. Runs after a
// match is deleted or when players / gamertags change (old matches then re-link).
export async function recomputeAllStats() {
  const [players, matches] = await Promise.all([
    Player.find(),
    Match.find().sort({ createdAt: 1 }),
  ]);
  const roster = makeRoster(players);
  const all = new Map(players.map((p) => [String(p._id), emptyStats(p._id)]));
  const teams = new Map();

  for (const match of matches) {
    const members = membersInMatch(roster, match);
    for (const m of members) addRow(all.get(m.playerId), m.row, match);
    for (const t of teamsInMatch(members)) {
      const entry = teams.get(t.key) || { key: t.key, playerIds: t.playerIds, wins: 0, losses: 0 };
      if (t.won) entry.wins += 1;
      else entry.losses += 1;
      teams.set(t.key, entry);
    }
  }

  await Promise.all([PlayerStats.deleteMany({}), TeamStats.deleteMany({})]);
  if (all.size) await PlayerStats.insertMany([...all.values()]);
  if (teams.size) await TeamStats.insertMany([...teams.values()]);
  invalidateTimeline();
  return { players: players.length, matches: matches.length };
}

// Turns the saved totals into the leaderboards.
export async function getLeaderboards() {
  const [players, statDocs, teamDocs] = await Promise.all([
    Player.find(),
    PlayerStats.find(),
    TeamStats.find({ wins: { $gt: 0 } }),
  ]);
  const statsById = new Map(statDocs.map((s) => [String(s.playerId), s]));
  const playersById = new Map(players.map((p) => [String(p._id), p]));
  const rows = players.map((p) => toRow(p, statsById.get(String(p._id)) || emptyStats(p._id)));

  return {
    totalMatches: await Match.countDocuments(),
    boards: {
      ...buildBoards(rows),
      mostWonTeam: buildTeamBoard(
        teamDocs.map((t) => ({ key: t.key, playerIds: t.playerIds.map(String), wins: t.wins, losses: t.losses })),
        playersById
      ),
    },
  };
}

const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

// Every player's best-brawler score after each match, oldest first. Scores are
// running (everything up to that match), so the last point equals the current board.
async function getTimeline() {
  if (timelineCache) return timelineCache;
  const [players, matches] = await Promise.all([
    Player.find().sort({ name: 1 }),
    Match.find().sort({ createdAt: 1 }),
  ]);
  const roster = makeRoster(players);
  const all = new Map(players.map((p) => [String(p._id), emptyStats(p._id)]));

  const points = [];
  for (const match of matches) {
    for (const m of membersInMatch(roster, match)) addRow(all.get(m.playerId), m.row, match);
    const scores = {};
    for (const [id, stats] of all) scores[id] = round1(brawlerParts(stats).score);
    points.push({ t: match.createdAt, matchId: String(match._id), scores });
  }

  timelineCache = {
    players: players.map((p) => ({ id: String(p._id), name: p.name })),
    points,
  };
  return timelineCache;
}

// Home page: the best-brawler ranking (podium + table) and the timeline.
// Best three brawlers using ONLY the given matches (oldest first), scored with
// the usual formula. Players with no complete match in that set are left out.
function topBrawlers(players, roster, matches, limit = 3) {
  const all = new Map(players.map((p) => [String(p._id), emptyStats(p._id)]));
  for (const match of matches) {
    for (const m of membersInMatch(roster, match)) addRow(all.get(m.playerId), m.row, match);
  }
  return players
    .map((p) => {
      const stats = all.get(String(p._id));
      return {
        playerId: String(p._id),
        name: p.name,
        face: p.face || "",
        matches: stats.matches,
        score: brawlerParts(stats).score,
      };
    })
    .filter((r) => r.score !== null)
    .sort((a, b) => b.score - a.score || b.matches - a.matches || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const RECENT_MATCHES = 15;
const RECENT_DAYS = 30; // "last month"

// Home page: the best-brawler ranking (podium + table), the timeline, and the
// best three over the last 15 matches and over the last month.
export async function getHome() {
  const [players, statDocs, totalMatches, timeline, matchDocs] = await Promise.all([
    Player.find(),
    PlayerStats.find(),
    Match.countDocuments(),
    getTimeline(),
    Match.find().sort({ createdAt: 1 }),
  ]);
  const roster = makeRoster(players);
  const latest = matchDocs.slice(-RECENT_MATCHES);
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const lastMonth = matchDocs.filter((m) => m.createdAt.getTime() >= cutoff);
  const recent = {
    last15: { matches: latest.length, top: topBrawlers(players, roster, latest) },
    lastMonth: { matches: lastMonth.length, top: topBrawlers(players, roster, lastMonth) },
  };
  const statsById = new Map(statDocs.map((s) => [String(s.playerId), s]));

  const rows = players
    .map((p) => {
      const stats = statsById.get(String(p._id)) || emptyStats(p._id);
      return {
        playerId: String(p._id),
        name: p.name,
        face: p.face || "",
        matches: stats.matches,
        ...brawlerParts(stats),
      };
    })
    .sort((a, b) => {
      if (a.score === null && b.score === null) return b.matches - a.matches || a.name.localeCompare(b.name);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score || b.matches - a.matches || a.name.localeCompare(b.name);
    })
    .map((r, i) => ({ rank: i + 1, ...r }));

  return { totalMatches, board: rows, timeline, recent };
}

