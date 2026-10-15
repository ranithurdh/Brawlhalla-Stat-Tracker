import mongoose from "mongoose";

// How often each combination of 2+ players has won or lost together.
// Saved in the database like PlayerStats, so nothing is recalculated per visit.
const TeamStatsSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true }, // sorted player ids joined by "+"
  playerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
});

export default mongoose.model("TeamStats", TeamStatsSchema);
