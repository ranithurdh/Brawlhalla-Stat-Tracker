import crypto from "crypto";

// When Gemini reads a screenshot, the server signs what it read. A visitor
// without the admin password can only save a match by sending that signed
// "draft" back, so they can upload and submit Gemini's numbers but can't change
// them (editing the numbers in the browser has no effect on what is saved).
// Admins skip this and send their edited rows instead.

const TTL_MS = 2 * 60 * 60 * 1000; // a draft can be submitted for 2 hours

let fallbackSecret;
function secret() {
  // DRAFT_SECRET is optional; the admin password works as the signing key too.
  // With neither set, a random key is used (drafts then don't survive a restart).
  return (
    process.env.DRAFT_SECRET ||
    process.env.ADMIN_PASSWORD ||
    (fallbackSecret ||= crypto.randomBytes(32).toString("hex"))
  );
}

const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

const bad = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

export function makeDraftToken(players) {
  const data = Buffer.from(JSON.stringify({ players, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${data}.${sign(data)}`;
}

// Returns the players Gemini read, or throws a 400.
export function readDraftToken(token) {
  const invalid = () =>
    bad("This upload can't be submitted (it has expired or didn't come from Gemini). Upload the screenshot again.");
  if (typeof token !== "string" || !token.includes(".")) throw invalid();

  const [data, sig] = token.split(".");
  const expected = sign(data);
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw invalid();

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!payload || !Array.isArray(payload.players) || !(payload.exp > Date.now())) throw invalid();
  return payload.players;
}
