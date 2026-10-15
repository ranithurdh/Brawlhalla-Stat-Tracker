import crypto from "crypto";
import { optionalAdmin } from "./admin.js";

// Protects the Gemini quota. Reading a screenshot costs a Gemini request, and
// the site is public once it is deployed, so:
//   1. If UPLOAD_CODE is set, ordinary visitors must send it (admins don't need it).
//   2. Each address gets a limited number of screenshot reads per 15 minutes.
// Both are checked before Gemini is called.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_READS = Number(process.env.UPLOAD_LIMIT_PER_15_MIN) || 40; // a dorm may share one address
const MAX_WRONG_CODES = 15;

const reads = new Map(); // ip -> { count, resetAt }
const wrong = new Map();

function bump(map, ip, now) {
  let e = map.get(ip);
  if (!e || e.resetAt < now) {
    e = { count: 0, resetAt: now + WINDOW_MS };
    map.set(ip, e);
  }
  e.count += 1;
  return e;
}

// Drop finished entries now and then so the maps can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const map of [reads, wrong]) for (const [k, v] of map) if (v.resetAt < now) map.delete(k);
}, WINDOW_MS).unref();

const same = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash("sha256").update(String(a)).digest(),
    crypto.createHash("sha256").update(String(b)).digest()
  );

function guard(req, res, next) {
  if (req.isAdmin) return next();
  const now = Date.now();

  const code = process.env.UPLOAD_CODE;
  if (code) {
    const given = req.get("x-upload-code") || "";
    if (!given || !same(given, code)) {
      if (given && bump(wrong, req.ip, now).count > MAX_WRONG_CODES) {
        return res.status(429).json({ error: "Too many wrong codes. Try again in 15 minutes." });
      }
      return res.status(403).json({
        error: given ? "Wrong upload code." : "Enter the upload code to upload screenshots.",
        code: "upload_code_required",
      });
    }
  }

  if (bump(reads, req.ip, now).count > MAX_READS) {
    return res.status(429).json({
      error: "Too many screenshots from this connection in a short time. Try again in a few minutes.",
    });
  }
  next();
}

// Use in front of the screenshot-reading route.
export const uploadGuard = [optionalAdmin, guard];
