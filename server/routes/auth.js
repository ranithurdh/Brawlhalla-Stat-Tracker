import { Router } from "express";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();

// Public: lets the site tell "no password set on the server" from "ask for it".
router.get("/status", (req, res) => {
  res.json({
    configured: Boolean(process.env.ADMIN_PASSWORD),
    uploadCodeRequired: Boolean(process.env.UPLOAD_CODE),
  });
});

// Succeeds only with the right password in the header.
router.post("/check", requireAdmin, (req, res) => res.json({ ok: true }));

export default router;
