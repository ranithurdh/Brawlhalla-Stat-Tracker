import { Router } from "express";
import mongoose from "mongoose";
import Duel from "../models/Duel.js";
import { requireAdmin } from "../middleware/admin.js";
import { getDuelStats } from "../services/duels.js";

const router = Router();

// Public: ELO cards, head-to-head records and the boards.
router.get("/", async (req, res, next) => {
  try {
    res.json(await getDuelStats());
  } catch (err) {
    next(err);
  }
});

// Admin only. ELO is replayed from the remaining 1v1s, so nothing else to fix.
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      const err = new Error("Unknown 1v1 match.");
      err.statusCode = 404;
      throw err;
    }
    await Duel.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
