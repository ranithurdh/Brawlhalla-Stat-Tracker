import mongoose from "mongoose";

// One document (key: "main") holds the editable settings.
// Empty values fall back to the defaults in services/gemini.js.
const SettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  apiKey: { type: String, default: "" },
  model: { type: String, default: "" },
  prompt: { type: String, default: "" },
  // 2 = prompt that reads gamertag / won / accidents / damageDone.
  promptVersion: { type: Number, default: 2 },
  // A custom prompt from before version 2, kept here in case it's wanted back.
  legacyPrompt: { type: String, default: "" },
  // Bumped when the stat rules change (see services/migrate.js).
  // When this is behind, the saved totals are rebuilt once at startup.
  statsVersion: { type: Number, default: 1 },
  // Set once the first six members have been added.
  seededPlayers: { type: Boolean, default: false },
});

export default mongoose.model("Settings", SettingsSchema);
