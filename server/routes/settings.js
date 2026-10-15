import { Router } from "express";
import Settings from "../models/Settings.js";
import { requireAdmin } from "../middleware/admin.js";
import {
  getSettings,
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
} from "../services/gemini.js";

const router = Router();

// The API key is never sent back to the browser, only a short preview.
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const s = await getSettings();
    res.json({
      model: s.model,
      prompt: s.prompt,
      apiKeySet: Boolean(s.apiKey),
      apiKeyPreview: s.apiKey ? `...${s.apiKey.slice(-4)}` : "",
      apiKeySource: s.apiKeySource,
      defaultModel: DEFAULT_MODEL,
      defaultPrompt: DEFAULT_PROMPT,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/", requireAdmin, async (req, res, next) => {
  try {
    const { apiKey, clearApiKey, model, prompt } = req.body || {};
    const update = {};

    if (clearApiKey) update.apiKey = "";
    else if (typeof apiKey === "string" && apiKey.trim()) update.apiKey = apiKey.trim();

    // An empty string resets the field to its default.
    if (typeof model === "string") update.model = model.trim();
    if (typeof prompt === "string") update.prompt = prompt.trim();

    await Settings.findOneAndUpdate({ key: "main" }, update, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
