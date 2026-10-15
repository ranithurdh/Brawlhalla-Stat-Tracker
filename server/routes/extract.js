import { Router } from "express";
import multer from "multer";
import { extractFromImage } from "../services/gemini.js";
import Player from "../models/Player.js";
import { makeRoster, suggest } from "../services/roster.js";
import { makeDraftToken } from "../services/draft.js";
import { makeFingerprint } from "../services/migrate.js";
import { DUPLICATE_MESSAGE, isDuplicate } from "../services/duplicates.js";
import { uploadGuard } from "../middleware/uploadGuard.js";

const MIN_MEMBERS = 2;

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) return cb(null, true);
    const err = new Error("Upload a PNG, JPG, or WebP image.");
    err.statusCode = 400;
    cb(err);
  },
});

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const toText = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const toBool = (v) => {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    if (/^(true|yes|win|won|victory)$/i.test(v.trim())) return true;
    if (/^(false|no|loss|lost|defeat)$/i.test(v.trim())) return false;
  }
  return null;
};

// Cleans up whatever Gemini returned so the frontend always gets the same shape.
// Also accepts the field names of the older prompt (name, suicides, damageDealt).
function normalize(data, roster) {
  const players = Array.isArray(data?.players) ? data.players : [];
  return {
    players: players.map((p) => {
      const gamertag = toText(p?.gamertag ?? p?.name) || "";
      const { player, matchedBy } = gamertag ? suggest(roster, gamertag) : {};
      return {
        gamertag,
        playerId: player ? String(player._id) : "",
        matchedBy: matchedBy || null,
        won: toBool(p?.won),
        kos: toNumber(p?.kos),
        falls: toNumber(p?.falls),
        accidents: toNumber(p?.accidents ?? p?.suicides),
        damageDone: toNumber(p?.damageDone ?? p?.damageDealt),
        damageTaken: toNumber(p?.damageTaken),
      };
    }),
  };
}

// Returns [status, message, code]. The code lets the page tell "Gemini's limit is
// over" (queue the screenshot for later) apart from errors that won't fix themselves.
function describeGeminiError(err) {
  if (err.statusCode) return [err.statusCode, err.message];

  const status = err.status || err.code;
  const msg = String(err.message || "");

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return [
      429,
      "Gemini's limit is over for now. The screenshot can wait in the queue until it resets.",
      "gemini_limit",
    ];
  }
  if (status === 403 || /API key|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return [400, "Gemini rejected the API key. Check it on the Settings page."];
  }
  if (status === 404) {
    return [400, "Gemini couldn't find that model name. Check the model on the Settings page."];
  }
  return [502, `Gemini request failed: ${msg.slice(0, 200)}`];
}

router.post("/", uploadGuard, upload.single("screenshot"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Choose a screenshot to upload." });
  }
  try {
    const data = await extractFromImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    const roster = makeRoster(await Player.find());
    const result = normalize(data, roster);

    // Uploading needs no password, so the screenshot has to show at least 2 of
    // the players listed in Settings (a close spelling counts).
    const found = new Set(result.players.filter((p) => p.playerId).map((p) => p.playerId)).size;
    if (result.players.length === 2 && found < 2) {
      return res.status(422).json({
        error:
          "This looks like a 1v1, and 1v1s only count when both players are registered members. Add the missing player in Settings first.",
        code: "not_counted",
      });
    }
    if (found < MIN_MEMBERS) {
      return res.status(422).json({
        code: "not_counted",
        error: `This doesn't look like one of your matches: only ${found} of the players listed in Settings ${
          found === 1 ? "was" : "were"
        } found, and at least ${MIN_MEMBERS} are needed. Check it's the post-match stats screen, or add the missing gamertags in Settings.`,
      });
    }
    // The same stats as a match that is already saved: stop here, before anyone
    // reviews it. (Rows with no gamertag are dropped when saving, so drop them here too.)
    const named = result.players.filter((p) => p.gamertag);
    if (named.length && (await isDuplicate(makeFingerprint(named)))) {
      return res.status(409).json({ error: DUPLICATE_MESSAGE, code: "duplicate" });
    }
    // The signed token lets someone without the admin password save exactly
    // what Gemini read (see services/draft.js).
    res.json({ ...result, draftToken: makeDraftToken(result.players) });
  } catch (err) {
    const [status, message, code] = describeGeminiError(err);
    res.status(status).json({ error: message, ...(code ? { code } : {}) });
  }
});

export default router;
