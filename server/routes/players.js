import { Router } from "express";
import mongoose from "mongoose";
import Player from "../models/Player.js";
import PlayerStats from "../models/PlayerStats.js";
import { requireAdmin } from "../middleware/admin.js";
import { normTag } from "../services/roster.js";
import { recomputeAllStats } from "../services/stats.js";

const router = Router();

const bad = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const FACE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_FACE_LENGTH = 300_000;

function cleanTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const tags = [];
  for (const raw of list) {
    const tag = String(raw).trim();
    const key = normTag(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

// A name or gamertag can only belong to one member.
async function checkNoClash(name, gamertags, ignoreId) {
  const others = await Player.find(ignoreId ? { _id: { $ne: ignoreId } } : {});
  for (const o of others) {
    if (o.name.toLowerCase() === name.toLowerCase()) {
      throw bad(`There is already a player called ${o.name}.`, 409);
    }
    for (const tag of gamertags) {
      if (o.gamertags.some((t) => normTag(t) === normTag(tag))) {
        throw bad(`The gamertag "${tag}" already belongs to ${o.name}.`, 409);
      }
    }
  }
}

// Public: the leaderboards and review screen need names and faces.
router.get("/", async (req, res, next) => {
  try {
    const players = await Player.find().sort({ name: 1 });
    res.json(players);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const gamertags = cleanTags(req.body?.gamertags);
    if (!name) throw bad("Enter the name this player goes by.");
    if (gamertags.length === 0) throw bad("Enter at least one gamertag.");
    await checkNoClash(name, gamertags);

    const player = await Player.create({ name, gamertags });
    await recomputeAllStats(); // old matches with this gamertag now count
    res.status(201).json(player);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Unknown player.", 404);
    const player = await Player.findById(req.params.id);
    if (!player) throw bad("Unknown player.", 404);

    const body = req.body || {};
    if (typeof body.name === "string") {
      if (!body.name.trim()) throw bad("The name can't be empty.");
      player.name = body.name.trim();
    }
    if (body.gamertags !== undefined) {
      const tags = cleanTags(body.gamertags);
      if (tags.length === 0) throw bad("Keep at least one gamertag.");
      player.gamertags = tags;
    }
    if (typeof body.face === "string") {
      if (body.face && (!FACE_PATTERN.test(body.face) || body.face.length > MAX_FACE_LENGTH)) {
        throw bad("Use a PNG, JPG or WebP face image.");
      }
      player.face = body.face;
    }

    await checkNoClash(player.name, player.gamertags, player._id);
    await player.save();
    await recomputeAllStats();
    res.json(player);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Unknown player.", 404);
    await Player.findByIdAndDelete(req.params.id);
    await PlayerStats.deleteOne({ playerId: req.params.id });
    await recomputeAllStats();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
