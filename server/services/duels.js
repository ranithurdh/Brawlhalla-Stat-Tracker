import Player from "../models/Player.js";
import Duel from "../models/Duel.js";
import { makeRoster, playerForRow } from "./roster.js";
import { computeDuelStats } from "./duelMath.js";

// Reads every 1v1 in the order it was added and works out ELO, head-to-head
// records and the boards. There are few enough 1v1s that replaying them on each
// visit is instant, and it keeps ELO correct after a match is deleted or a
// player's gamertag changes.
export async function getDuelStats() {
  const [players, duels] = await Promise.all([
    Player.find().sort({ name: 1 }),
    Duel.find().sort({ createdAt: 1, _id: 1 }),
  ]);
  const roster = makeRoster(players);

  const list = [];
  for (const d of duels) {
    const winRow = d.players.find((r) => r.won === true);
    const loseRow = d.players.find((r) => r.won === false);
    const winner = winRow && playerForRow(roster, winRow);
    const loser = loseRow && playerForRow(roster, loseRow);
    // A member who has since been removed takes their 1v1s out of the picture.
    if (!winner || !loser || String(winner._id) === String(loser._id)) continue;
    list.push({
      id: String(d._id),
      at: d.createdAt,
      winnerId: String(winner._id),
      loserId: String(loser._id),
    });
  }

  return computeDuelStats(
    players.map((p) => ({ id: String(p._id), name: p.name, face: p.face || "" })),
    list
  );
}
