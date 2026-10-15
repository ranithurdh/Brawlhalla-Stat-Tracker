// Helpers for matching in-game names (gamertags) to dorm members.

// "Amarabandu_Rupasinghe" and "amarabandurupasinghe" count as the same tag.
export const normTag = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = temp;
    }
  }
  return prev[b.length];
}

// players: array of Player documents (or plain objects) with gamertags.
export function makeRoster(players) {
  const byId = new Map();
  const byTag = new Map();
  for (const p of players) {
    byId.set(String(p._id), p);
    for (const tag of p.gamertags || []) {
      const key = normTag(tag);
      if (key && !byTag.has(key)) byTag.set(key, p);
    }
  }
  return { byId, byTag, players };
}

// Exact match only. Used when calculating stats, so a guess never counts.
export function findExact(roster, gamertag) {
  return roster.byTag.get(normTag(gamertag)) || null;
}

// Exact match first, then a single clearly-closest tag (to forgive a misread
// letter). Used only to *suggest* a member on the review screen.
export function suggest(roster, gamertag) {
  const exact = findExact(roster, gamertag);
  if (exact) return { player: exact, matchedBy: "exact" };

  const key = normTag(gamertag);
  if (key.length < 5) return { player: null, matchedBy: null };
  const maxDist = key.length >= 8 ? 2 : 1;

  let best = null;
  let bestDist = Infinity;
  let tie = false;
  for (const [tag, player] of roster.byTag) {
    const d = distance(key, tag);
    if (d < bestDist) {
      best = player;
      bestDist = d;
      tie = false;
    } else if (d === bestDist && player !== best) {
      tie = true;
    }
  }
  if (best && bestDist <= maxDist && !tie) return { player: best, matchedBy: "close" };
  return { player: null, matchedBy: null };
}

// The member a saved match row belongs to: the explicit link if there is one,
// otherwise an exact gamertag match.
export function playerForRow(roster, row) {
  if (row.playerId && roster.byId.has(String(row.playerId))) {
    return roster.byId.get(String(row.playerId));
  }
  return findExact(roster, row.gamertag);
}
