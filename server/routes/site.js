import { Router } from "express";
import express from "express";
import Site from "../models/Site.js";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();

const PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_FAVICON = 200_000; // characters of data URL
const MAX_BACKGROUND = 4_500_000;

const bad = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

const getSite = () =>
  Site.findOneAndUpdate({ key: "main" }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });

// Public: the site reads this on every page load.
router.get("/", async (req, res, next) => {
  try {
    const s = await getSite();
    res.json({
      hasFavicon: Boolean(s.favicon),
      faviconV: s.faviconAt ? s.faviconAt.getTime() : 0,
      hasBackground: Boolean(s.background),
      backgroundV: s.backgroundAt ? s.backgroundAt.getTime() : 0,
      overlayOpacity: s.overlayOpacity,
    });
  } catch (err) {
    next(err);
  }
});

function serveImage(field) {
  return async (req, res, next) => {
    try {
      const s = await getSite();
      const m = PATTERN.exec(s[field] || "");
      if (!m) return res.status(404).end();
      res.set("Content-Type", m[1]);
      res.set("Cache-Control", "public, max-age=86400"); // the page adds ?v= when it changes
      res.send(Buffer.from(m[2], "base64"));
    } catch (err) {
      next(err);
    }
  };
}
router.get("/favicon", serveImage("favicon"));
router.get("/background", serveImage("background"));

// Admin only. Send "" for favicon or background to remove it.
// (The body is read after the password check; backgrounds are bigger than the
// default 1 MB limit.)
router.put("/", requireAdmin, express.json({ limit: "6mb" }), async (req, res, next) => {
  try {
    const { favicon, background, overlayOpacity } = req.body || {};
    const update = {};

    if (typeof favicon === "string") {
      if (favicon === "") {
        update.favicon = "";
        update.faviconAt = null;
      } else {
        if (!PATTERN.test(favicon) || favicon.length > MAX_FAVICON) {
          throw bad("Use a small PNG, JPG or WebP image for the icon.");
        }
        update.favicon = favicon;
        update.faviconAt = new Date();
      }
    }

    if (typeof background === "string") {
      if (background === "") {
        update.background = "";
        update.backgroundAt = null;
      } else {
        if (!PATTERN.test(background) || background.length > MAX_BACKGROUND) {
          throw bad("Use a PNG, JPG or WebP background image under about 3 MB.");
        }
        update.background = background;
        update.backgroundAt = new Date();
      }
    }

    if (overlayOpacity !== undefined) {
      const n = Number(overlayOpacity);
      if (!Number.isFinite(n) || n < 0 || n > 1) throw bad("Opacity must be between 0 and 100%.");
      update.overlayOpacity = n;
    }

    await Site.findOneAndUpdate({ key: "main" }, update, { upsert: true, setDefaultsOnInsert: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
