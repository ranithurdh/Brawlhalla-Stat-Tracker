// Pure calculations (no database), so they can be tested on their own.

// A life is lost by a fall only; accidents are not counted as lives. A player
// with no falls yet is divided by 1
// so ratios stay finite and sortable.
export const lives = (falls) => Math.max(1, falls);

// Every match is played with 3 lives. "Least damage in one match" only counts a
// match where the player lost all of them (3 falls).
export const LIVES_PER_MATCH = 3;

// "Most damage in one match" is ranked on matches against 3 players or fewer
// (everyone else in the match, so the match has at most 4 players).
// Change this number to move the line.
export const MAX_OPPONENTS_FOR_RANKED_DAMAGE = 3;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const emptyStats = (playerId) => ({
  playerId,
  matches: 0,
  ratedMatches: 0,
  wins: 0,
  samples: 0,
  kos: 0,
  falls: 0,
  accidents: 0,
  damageDone: 0,
  damageTaken: 0,
  dominantMatches: 0,
  dominatedMatches: 0,
  maxDamage: null,
  maxDamageMatch: null,
  maxDamageAt: null,
  maxDamageSmall: null,
  maxDamageSmallMatch: null,
  maxDamageSmallAt: null,
  minDamage: null,
  minDamageMatch: null,
  minDamageAt: null,
});

// Per-life numbers for one row of one match (a life = a fall, minimum 1).
// Null when the row is missing a number it needs.
export function damagePerLifeIn(row) {
  return isNum(row.damageDone) && isNum(row.falls) ? row.damageDone / lives(row.falls) : null;
}

// How badly someone was dominated in a match: damage taken per life minus damage
// done per life (a life = a fall, minimum 1). High when they took a lot and dealt
// little for each life they used.
export function dominatedScoreIn(row) {
  return isNum(row.damageDone) && isNum(row.damageTaken) && isNum(row.falls)
    ? (row.damageTaken - row.damageDone) / lives(row.falls)
    : null;
}

// The highest score of a match across everyone with the numbers (members and
// non-members). null unless at least two players differ, since if everyone is
// level nobody dominates anybody.
function topOf(rows, score) {
  const values = (rows || []).map(score).filter((v) => v !== null);
  if (values.length < 2) return null;
  const max = Math.max(...values);
  return max > Math.min(...values) ? max : null;
}

// Adds one player's row from one match to a stats object. Used both for the
// quick update when a match is saved and for a full rebuild, so they always agree.
export function addRow(stats, row, match) {
  stats.matches += 1;
  if (row.won === true || row.won === false) {
    stats.ratedMatches += 1;
    if (row.won) stats.wins += 1;
  }

  // Most dominant: the highest damage per life (fall) in the match.
  // Most dominated: the highest (damage taken - damage done) per life in the match.
  // Both look at everyone in the match, members and non-members alike, and a tie
  // counts for each tied player.
  const domTop = topOf(match.players, damagePerLifeIn);
  if (domTop !== null && damagePerLifeIn(row) === domTop) stats.dominantMatches += 1;
  const subTop = topOf(match.players, dominatedScoreIn);
  if (subTop !== null && dominatedScoreIn(row) === subTop) stats.dominatedMatches += 1;

  const complete = [row.kos, row.falls, row.accidents, row.damageDone, row.damageTaken].every(isNum);
  if (!complete) return;

  stats.samples += 1;
  stats.kos += row.kos;
  stats.falls += row.falls;
  stats.accidents += row.accidents;
  stats.damageDone += row.damageDone;
  stats.damageTaken += row.damageTaken;

  if (stats.maxDamage === null || row.damageDone > stats.maxDamage) {
    stats.maxDamage = row.damageDone;
    stats.maxDamageMatch = match._id;
    stats.maxDamageAt = match.createdAt;
  }

    // Same as above, but only matches against 3 players or fewer.
  const opponents = (match.players || []).length - 1;
  if (
    opponents <= MAX_OPPONENTS_FOR_RANKED_DAMAGE &&
    (stats.maxDamageSmall === null || stats.maxDamageSmall === undefined || row.damageDone > stats.maxDamageSmall)
  ) {
    stats.maxDamageSmall = row.damageDone;
    stats.maxDamageSmallMatch = match._id;
    stats.maxDamageSmallAt = match.createdAt;
  }
  
  // Least damage: only matches where all 3 lives were lost are eligible.
  const lostAllLives = row.falls >= LIVES_PER_MATCH;
  if (lostAllLives && (stats.minDamage === null || row.damageDone < stats.minDamage)) {
    stats.minDamage = row.damageDone;
    stats.minDamageMatch = match._id;
    stats.minDamageAt = match.createdAt;
  }
}


// Best brawler score:
//   TotalScore = DPL + (KTR x 100) + DP - MDP
// DPL = damage per life (damage done / falls), KTR = KOs to falls, DP = share of
// matches where they were the most dominant, MDP = share of matches where they
// were the most dominated. DP and MDP are in percent (0 to 100). null until the
// player has a match with all the numbers read.
export const KTR_WEIGHT = 100;

export function brawlerParts(s) {
  const deaths = lives(s.falls);
  const dpl = s.samples ? s.damageDone / deaths : null;
  const ktr = s.samples ? s.kos / deaths : null;
  const dp = s.matches ? ((s.dominantMatches || 0) / s.matches) * 100 : null;
  const mdp = s.matches ? ((s.dominatedMatches || 0) / s.matches) * 100 : null;
  const score =
    dpl === null || ktr === null || dp === null || mdp === null
      ? null
      : dpl + ktr * KTR_WEIGHT + dp - mdp;
  return { dpl, ktr, dp, mdp, score };
}

// One leaderboard row per player, from their saved totals.
export function toRow(player, s) {
  const deaths = lives(s.falls);
  return {
    playerId: String(player._id),
    name: player.name,
    face: player.face || "",
    matches: s.matches,
    wins: s.wins,
    ratedMatches: s.ratedMatches,
    winRate: s.ratedMatches ? s.wins / s.ratedMatches : null,
    damagePerLife: s.samples ? s.damageDone / deaths : null,
    koDeathRatio: s.samples ? s.kos / deaths : null,
    kos: s.kos,
    deaths: s.falls, // lives lost = falls
    damageDone: s.damageDone,
    dominantMatches: s.dominantMatches || 0,
    // Share of the matches played in which they dealt the most damage.
    dominantRate: s.matches ? (s.dominantMatches || 0) / s.matches : null,
    dominatedMatches: s.dominatedMatches || 0,
    dominatedRate: s.matches ? (s.dominatedMatches || 0) / s.matches : null,
    maxDamage: s.maxDamage,
    maxDamageSmall: s.maxDamageSmall ?? null,
    minDamage: s.minDamage,
  };
}

export function buildBoards(rows) {
  // Highest first (or lowest first), players with no data last, ties broken by
  // who has played more matches, then by name.
  const board = (key, direction) => {
    const sorted = [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === null && bv === null) return b.matches - a.matches || a.name.localeCompare(b.name);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return direction === "desc" ? bv - av : av - bv;
      return b.matches - a.matches || a.name.localeCompare(b.name);
    });
    return sorted.map((r, i) => ({
      rank: i + 1,
      playerId: r.playerId,
      name: r.name,
      // Faces are only shown for the top 3, so only those are sent.
      face: i < 3 && r[key] !== null ? r.face : "",
      value: r[key],
      matches: r.matches,
      wins: r.wins,
      ratedMatches: r.ratedMatches,
      kos: r.kos,
      deaths: r.deaths,
      damageDone: r.damageDone,  
      maxDamage: r.maxDamage,
      maxDamageSmall: r.maxDamageSmall,
      dominantMatches: r.dominantMatches,
      dominatedMatches: r.dominatedMatches,
    }));
  };

  return {
    winRate: board("winRate", "desc"),
    damagePerLife: board("damagePerLife", "desc"),
    maxDamage: board("maxDamageSmall", "desc"),
    koDeathRatio: board("koDeathRatio", "desc"),
    minDamage: board("minDamage", "asc"),
    dominantRate: board("dominantRate", "desc"),
    dominatedRate: board("dominatedRate", "desc"),
  };
}

// ---- Teams ----------------------------------------------------------------

// Stable id for a set of players, whatever order they are listed in.
export const teamKey = (ids) => [...new Set(ids.map(String))].sort().join("+");

// The teams in one match: each side (winners, losers) that has 2 or more
// tracked members. rows = [{ playerId, won }] with one row per member.
export function teamsInMatch(rows) {
  const teams = [];
  for (const won of [true, false]) {
    const ids = [...new Set(rows.filter((r) => r.won === won).map((r) => String(r.playerId)))];
    if (ids.length >= 2) teams.push({ key: teamKey(ids), playerIds: ids.sort(), won });
  }
  return teams;
}

// Most won team board: only teams that have won at least once. Most wins first,
// then best win rate, then most games. Faces (of the members) only for the top 3.
// teams = [{ key, playerIds, wins, losses }], playersById = Map(id -> player)
export function buildTeamBoard(teams, playersById, limit = 10) {
  const usable = teams
    .filter((t) => t.wins > 0 && t.playerIds.every((id) => playersById.has(String(id))))
    .map((t) => {
      const members = t.playerIds.map((id) => playersById.get(String(id)));
      const games = t.wins + t.losses;
      return {
        key: t.key,
        name: members.map((m) => m.name).join(" + "),
        faces: members.map((m) => m.face || ""),
        wins: t.wins,
        games,
        winRate: t.wins / games,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, limit);

  return usable.map((t, i) => ({
    rank: i + 1,
    playerId: t.key,
    name: t.name,
    faces: i < 3 ? t.faces : [],
    value: t.wins,
    wins: t.wins,
    games: t.games,
    winRate: t.winRate,
  }));
}
