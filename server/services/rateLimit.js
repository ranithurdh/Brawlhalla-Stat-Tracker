import RateLimit from "../models/RateLimit.js";

// Fixed 15-minute windows, counted in MongoDB.
export const WINDOW_MS = 15 * 60 * 1000;

function bucket(key, now = Date.now()) {
  const n = Math.floor(now / WINDOW_MS);
  return { id: `${key}:${n}`, end: (n + 1) * WINDOW_MS };
}

export async function getCount(key) {
  const doc = await RateLimit.findById(bucket(key).id).lean();
  return doc?.count || 0;
}

// Adds one to the counter and returns the new count.
export async function hit(key) {
  const b = bucket(key);
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await RateLimit.findOneAndUpdate(
        { _id: b.id },
        { $inc: { count: 1 }, $setOnInsert: { expireAt: new Date(b.end + 60_000) } },
        { upsert: true, returnDocument: "after", lean: true }
      );
      return doc.count;
    } catch (err) {
      // Two requests creating the same counter at once: the second just retries.
      if (err.code !== 11000 || attempt >= 1) throw err;
    }
  }
}

export async function clear(key) {
  await RateLimit.deleteOne({ _id: bucket(key).id });
}
