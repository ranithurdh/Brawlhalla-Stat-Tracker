import mongoose from "mongoose";
import { PlayerStatSchema } from "./Match.js";

// A 1v1 match: exactly two registered members, one winner and one loser.
// Kept in its own collection so it never touches the usual stats. The ELO and
// head-to-head numbers are worked out from these by services/duels.js.
const DuelSchema = new mongoose.Schema(
  {
    players: { type: [PlayerStatSchema], validate: (v) => v.length === 2 },
    // Same hash as a normal match, used to block the same match being saved twice.
    fingerprint: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model("Duel", DuelSchema);
