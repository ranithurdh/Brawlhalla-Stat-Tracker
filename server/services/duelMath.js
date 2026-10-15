// Pure 1v1 calculations (no database): ELO, head-to-head records and the boards.

export const START_ELO = 1000;
// How far one match can move a rating. 32 is the classic chess club value.
export const K_FACTOR = 32;
// A player (or a pair of players) needs this many matches to be counted for
// win percentages, rivalries, dominations and streaks.
export const MIN_MATCHES = 3;

const BOARD_SIZE = 5;

// Chance (0 to 1) that a player rated `a` beats a player rated `b`.
export const expectedScore = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const bare = (p) => ({ playerId: p.id, name: p.name, face: p.face });

// players: [{ id, name, face }]
// duels:   [{ id, at, winnerId, loserId }] oldest first
// Every player starts on START_ELO and every match moves both ratings exactly
// like chess: the winner gains K x (1 - expected), the loser loses the same.
export function computeDuelStats(players, duels) {
  const byId = new Map(
    players.map((p) => [
      p.id,
      {
        ...p,
        elo: START_ELO,
        wins: 0,
        losses: 0,
        streak: 0, // current run of wins (0 after a loss)
        bestStreak: 0,
        h2h: new Map(), // opponent id -> { wins, losses }
      },
    ])
  );

  const history = [];
  for (const d of duels) {
    const w = byId.get(d.winnerId);
    const l = byId.get(d.loserId);
    if (!w || !l || w === l) continue;

    const expected = expectedScore(w.elo, l.elo);
    const delta = K_FACTOR * (1 - expected);
    const before = { winner: w.elo, loser: l.elo };
    w.elo += delta;
    l.elo -= delta;

    w.wins += 1;
    l.losses += 1;
    w.streak += 1;
    w.bestStreak = Math.max(w.bestStreak, w.streak);
    l.streak = 0;

    const wr = w.h2h.get(l.id) || { wins: 0, losses: 0 };
    wr.wins += 1;
    w.h2h.set(l.id, wr);
    const lr = l.h2h.get(w.id) || { wins: 0, losses: 0 };
    lr.losses += 1;
    l.h2h.set(w.id, lr);

    history.push({
      id: d.id,
      at: d.at,
      winner: { ...bare(w), eloBefore: before.winner, eloAfter: w.elo },
      loser: { ...bare(l), eloBefore: before.loser, eloAfter: l.elo },
      delta,
    });
  }

  const all = [...byId.values()].map((p) => {
    const matches = p.wins + p.losses;
    return { ...p, matches, winRate: matches ? p.wins / matches : null };
  });
  const rankOrder = (a, b) => b.elo - a.elo || b.matches - a.matches || a.name.localeCompare(b.name);
  all.sort(rankOrder);

  // Everyone's card: ELO first, then the record against each other player.
  const cards = all.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    name: p.name,
    face: p.face,
    elo: Math.round(p.elo),
    matches: p.matches,
    wins: p.wins,
    losses: p.losses,
    winRate: p.winRate,
    streak: p.streak,
    bestStreak: p.bestStreak,
    h2h: all
      .filter((o) => o.id !== p.id)
      .map((o) => {
        const r = p.h2h.get(o.id) || { wins: 0, losses: 0 };
        return { ...bare(o), wins: r.wins, losses: r.losses };
      }),
  }));

  // Pairs with enough matches between them, for rivalries and dominations.
  const pairs = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const aw = a.h2h.get(b.id)?.wins || 0;
      const bw = b.h2h.get(a.id)?.wins || 0;
      const games = aw + bw;
      if (games < MIN_MATCHES) continue;
      pairs.push({ a, b, aw, bw, games, diff: Math.abs(aw - bw) });
    }
  }

  const eligible = cards.filter((c) => c.matches >= MIN_MATCHES);

  const winRate = [...eligible]
    .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches || b.elo - a.elo || a.name.localeCompare(b.name))
    .map((c, i) => ({
      rank: i + 1,
      playerId: c.playerId,
      name: c.name,
      face: c.face,
      winRate: c.winRate,
      wins: c.wins,
      losses: c.losses,
      matches: c.matches,
    }));

  // Closest records first (a 5-5 beats a 3-2); more games break a tie.
  const rivalries = [...pairs]
    .sort((x, y) => x.diff - y.diff || y.games - x.games || x.a.name.localeCompare(y.a.name))
    .slice(0, BOARD_SIZE)
    .map((p, i) => ({
      rank: i + 1,
      games: p.games,
      diff: p.diff,
      a: { ...bare(p.a), wins: p.aw },
      b: { ...bare(p.b), wins: p.bw },
    }));

  // Biggest gap in wins first. A level record is a rivalry, not a domination.
  const dominations = pairs
    .filter((p) => p.diff > 0)
    .map((p) => {
      const aLeads = p.aw > p.bw;
      const top = aLeads ? p : { ...p, a: p.b, b: p.a, aw: p.bw, bw: p.aw };
      return { top, winRate: top.aw / top.games };
    })
    .sort(
      (x, y) =>
        y.top.diff - x.top.diff ||
        y.winRate - x.winRate ||
        y.top.games - x.top.games ||
        x.top.a.name.localeCompare(y.top.a.name)
    )
    .slice(0, BOARD_SIZE)
    .map(({ top, winRate: rate }, i) => ({
      rank: i + 1,
      games: top.games,
      diff: top.diff,
      winRate: rate,
      winner: { ...bare(top.a), wins: top.aw },
      loser: { ...bare(top.b), wins: top.bw },
    }));

  const streaks = eligible
    .filter((c) => c.bestStreak > 0)
    .sort((a, b) => b.bestStreak - a.bestStreak || b.streak - a.streak || b.matches - a.matches || a.name.localeCompare(b.name))
    .map((c, i) => ({
      rank: i + 1,
      playerId: c.playerId,
      name: c.name,
      face: c.face,
      bestStreak: c.bestStreak,
      streak: c.streak,
      matches: c.matches,
    }));

  const recent = history
    .slice(-10)
    .reverse()
    .map((h) => ({
      id: h.id,
      at: h.at,
      delta: h.delta,
      winner: { ...bare(h.winner), eloAfter: Math.round(h.winner.eloAfter) },
      loser: { ...bare(h.loser), eloAfter: Math.round(h.loser.eloAfter) },
    }));

  return {
    startElo: START_ELO,
    kFactor: K_FACTOR,
    minMatches: MIN_MATCHES,
    totalMatches: history.length,
    players: cards,
    boards: { winRate, rivalries, dominations, streaks },
    recent,
  };
}
