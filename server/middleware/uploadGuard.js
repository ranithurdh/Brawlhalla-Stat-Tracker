import crypto from "crypto";
import { optionalAdmin } from "./admin.js";
import { getCount, hit } from "../services/rateLimit.js";

// Protects the Gemini quota. Reading a screenshot costs a Gemini request, and
// the site is public once it is deployed, so:
//   1. If UPLOAD_CODE is set, ordinary visitors must send it (admins don't need it).
//   2. Each address gets a limited number of screenshot reads per 15 minutes.
// Both are checked before Gemini is called. Counters live in MongoDB so they work
// on serverless hosts too.

const MAX_WRONG_CODES = 15;
const maxReads = () => Number(process.env.UPLOAD_LIMIT_PER_15_MIN) || 40; // a dorm may share one address

const same = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash("sha256").update(String(a)).digest(),
    crypto.createHash("sha256").update(String(b)).digest()
  );

async function guard(req, res, next) {
  if (req.isAdmin) return next();
  try {
    const code = process.env.UPLOAD_CODE;
    if (code) {
      const given = req.get("x-upload-code") || "";
      if (!given || !same(given, code)) {
        if (given) {
          const wrongKey = `wrongcode:${req.ip}`;
          if ((await getCount(wrongKey)) >= MAX_WRONG_CODES) {
            return res.status(429).json({ error: "Too many wrong codes. Try again in 15 minutes." });
          }
          await hit(wrongKey);
        }
        return res.status(403).json({
          error: given ? "Wrong upload code." : "Enter the upload code to upload screenshots.",
          code: "upload_code_required",
        });
      }
    }

    if ((await hit(`reads:${req.ip}`)) > maxReads()) {
      return res.status(429).json({
        error: "Too many screenshots from this connection in a short time. Try again in a few minutes.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Use in front of the screenshot-reading route.
export const uploadGuard = [optionalAdmin, guard];
