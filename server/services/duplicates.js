import Match from "../models/Match.js";
import Duel from "../models/Duel.js";

export const DUPLICATE_MESSAGE = "This match has already been added.";

// True when a saved match (normal or 1v1) already has exactly these stats.
// The fingerprint covers every player's gamertag, KOs, falls, accidents, damage
// done, damage taken and result, whatever order the rows are in.
export async function isDuplicate(fingerprint, { ignoreMatchId } = {}) {
  const matchFilter = { fingerprint };
  if (ignoreMatchId) matchFilter._id = { $ne: ignoreMatchId };
  const [match, duel] = await Promise.all([Match.exists(matchFilter), Duel.exists({ fingerprint })]);
  return Boolean(match || duel);
}

export function duplicateError() {
  const err = new Error(DUPLICATE_MESSAGE);
  err.statusCode = 409;
  err.code = "duplicate";
  return err;
}
