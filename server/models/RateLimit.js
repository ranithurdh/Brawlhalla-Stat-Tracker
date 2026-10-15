import mongoose from "mongoose";

// Counters for the wrong-password lockout and the screenshot-reading limit.
// They live in the database (not in server memory) so they work when the site
// runs as many short-lived serverless functions, like on Vercel. Old counters
// delete themselves (TTL index on expireAt).
const RateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String },
    count: { type: Number, default: 0 },
    expireAt: { type: Date },
  },
  { versionKey: false }
);
RateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);
