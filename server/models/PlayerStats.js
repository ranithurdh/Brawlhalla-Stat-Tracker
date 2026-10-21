import mongoose from "mongoose";

// Running totals per player, saved in the database so the leaderboards never
// have to re-read every match. Updated when a match is saved, and rebuilt from
// the matches when a match is deleted or the roster changes.
const num = { type: Number, default: 0 };

const PlayerStatsSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", unique: true, required: true },
  matches: num, // every match the player appears in
  ratedMatches: num, // matches where win/loss is known
  wins: num,
  samples: num, // matches with all five numbers read (used for the sums below)
  kos: num,
  falls: num,
  accidents: num,
  damageDone: num,
  damageTaken: num,
  dominantMatches: num, // matches with the highest damage per life of anyone
  dominatedMatches: num, // matches with the highest (damage taken - damage done) per life of anyone
  maxDamage: { type: Number, default: null },
  maxDamageMatch: { type: mongoose.Schema.Types.ObjectId, default: null },
  maxDamageAt: { type: Date, default: null },
  minDamage: { type: Number, default: null },
  minDamageMatch: { type: mongoose.Schema.Types.ObjectId, default: null },
  minDamageAt: { type: Date, default: null },
  maxDamageSmall: { type: Number, default: null },
  maxDamageSmallMatch: { type: mongoose.Schema.Types.ObjectId, default: null },
  maxDamageSmallAt: { type: Date, default: null },
});

export default mongoose.model("PlayerStats", PlayerStatsSchema);
