import mongoose from "mongoose";

// A dorm member. "name" is what the site shows; "gamertags" are the in-game
// names that Gemini reads from screenshots (a player can have more than one).
const PlayerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    gamertags: { type: [String], default: [] },
    // Small square image stored as a data URL (the browser shrinks it first).
    face: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Player", PlayerSchema);
