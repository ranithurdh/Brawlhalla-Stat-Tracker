import mongoose from "mongoose";

// The legend played is not tracked on purpose.
export const PlayerStatSchema = new mongoose.Schema(
  {
    // The in-game name exactly as read from the screenshot.
    gamertag: { type: String, required: true, trim: true },
    // Which dorm member this row belongs to (null = not a tracked member).
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    // true on every member of the winning team. null = unknown (old matches).
    won: { type: Boolean, default: null },
    kos: { type: Number, default: null },
    falls: { type: Number, default: null },
    accidents: { type: Number, default: null },
    damageDone: { type: Number, default: null },
    damageTaken: { type: Number, default: null },
  },
  { _id: false }
);

const MatchSchema = new mongoose.Schema(
  {
    players: { type: [PlayerStatSchema], validate: (v) => v.length > 0 },
    // Hash of the stats, used to block the same match being saved twice.
    fingerprint: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model("Match", MatchSchema);
