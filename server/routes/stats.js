import { Router } from "express";
import { requireAdmin } from "../middleware/admin.js";
import { getHome, getLeaderboards, recomputeAllStats } from "../services/stats.js";

const router = Router();

// Public: the main page. Reads the saved totals, so nothing is recalculated.
router.get("/leaderboards", async (req, res, next) => {
  try {
    res.json(await getLeaderboards());
  } catch (err) {
    next(err);
  }
});

// Public: the home page (best brawler ranking and the timeline).
router.get("/home", async (req, res, next) => {
  try {
    res.json(await getHome());
  } catch (err) {
    next(err);
  }
});

// Rebuilds the saved totals from every match. Normally never needed.
router.post("/recalculate", requireAdmin, async (req, res, next) => {
  try {
    res.json(await recomputeAllStats());
  } catch (err) {
    next(err);
  }
});

export default router;
