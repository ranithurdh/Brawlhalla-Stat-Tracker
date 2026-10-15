import crypto from "crypto";

// One shared password (ADMIN_PASSWORD in server/.env) protects everything an
// admin can do: the Settings page, editing the stats Gemini read (before or
// after saving a match), deleting matches and editing players.
// The browser sends it in the "x-admin-password" header.
//
// If ADMIN_PASSWORD is not set, protected routes are refused (never left open).

const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map(); // ip -> { count, resetAt }

// Compares hashes so timing doesn't leak how much of the password was right.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function check(req) {
  const required = process.env.ADMIN_PASSWORD;
  if (!required) {
    return {
      ok: false,
      code: 503,
      error: "No password is set on the server. Add ADMIN_PASSWORD to server/.env and restart it.",
    };
  }

  const now = Date.now();
  const record = fails.get(req.ip);
  if (record && record.resetAt < now) fails.delete(req.ip);
  const current = fails.get(req.ip);
  if (current && current.count >= MAX_FAILS) {
    return { ok: false, code: 429, error: "Too many wrong passwords. Try again in 15 minutes." };
  }

  const given = req.get("x-admin-password") || "";
  if (given && safeEqual(given, required)) {
    fails.delete(req.ip);
    return { ok: true };
  }

  // An empty header just means "not logged in yet", so it isn't counted as a guess.
  if (given) {
    const entry = current || { count: 0, resetAt: now + WINDOW_MS };
    entry.count += 1;
    fails.set(req.ip, entry);
  }
  return { ok: false, code: 401, error: "Wrong or missing password." };
}

// Admin only.
export function requireAdmin(req, res, next) {
  const r = check(req);
  if (r.ok) return next();
  return res.status(r.code).json({ error: r.error });
}

// Open to everyone, but sets req.isAdmin so the route can allow more for admins.
// No password header = an ordinary visitor. A password header that is wrong is
// refused outright (and counts towards the lockout), never treated as a visitor.
export function optionalAdmin(req, res, next) {
  req.isAdmin = false;
  if (!req.get("x-admin-password")) return next();
  const r = check(req);
  if (r.ok) {
    req.isAdmin = true;
    return next();
  }
  return res.status(r.code).json({ error: r.error });
}
