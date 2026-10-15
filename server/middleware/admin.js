import crypto from "crypto";
import { clear, getCount, hit } from "../services/rateLimit.js";

// One shared password (ADMIN_PASSWORD in server/.env) protects everything an
// admin can do: the Settings page, editing the stats Gemini read (before or
// after saving a match), deleting matches and editing players.
// The browser sends it in the "x-admin-password" header.
//
// If ADMIN_PASSWORD is not set, protected routes are refused (never left open).

const MAX_FAILS = 10;

// Compares hashes so timing doesn't leak how much of the password was right.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Wrong guesses are counted per address in MongoDB (see services/rateLimit.js).
async function check(req) {
  const required = process.env.ADMIN_PASSWORD;
  if (!required) {
    return {
      ok: false,
      code: 503,
      error: "No password is set on the server. Add the ADMIN_PASSWORD setting and restart it.",
    };
  }

  // An empty header just means "not logged in yet", so it isn't counted as a guess.
  const given = req.get("x-admin-password") || "";
  if (!given) return { ok: false, code: 401, error: "Wrong or missing password." };

  const failKey = `adminfail:${req.ip}`;
  const fails = await getCount(failKey);
  if (fails >= MAX_FAILS) {
    return { ok: false, code: 429, error: "Too many wrong passwords. Try again in 15 minutes." };
  }

  if (safeEqual(given, required)) {
    if (fails > 0) await clear(failKey);
    return { ok: true };
  }
  await hit(failKey);
  return { ok: false, code: 401, error: "Wrong or missing password." };
}

// Admin only.
export async function requireAdmin(req, res, next) {
  try {
    const r = await check(req);
    if (r.ok) return next();
    return res.status(r.code).json({ error: r.error });
  } catch (err) {
    next(err);
  }
}

// Open to everyone, but sets req.isAdmin so the route can allow more for admins.
// No password header = an ordinary visitor. A password header that is wrong is
// refused outright (and counts towards the lockout), never treated as a visitor.
export async function optionalAdmin(req, res, next) {
  req.isAdmin = false;
  if (!req.get("x-admin-password")) return next();
  try {
    const r = await check(req);
    if (r.ok) {
      req.isAdmin = true;
      return next();
    }
    return res.status(r.code).json({ error: r.error });
  } catch (err) {
    next(err);
  }
}
