import "dotenv/config";
import app from "./app.js";
import { ensureDb } from "./db.js";

// Normal server: connect to MongoDB, then listen. (On Vercel, api/index.js is
// used instead and the connection is made on the first request.)
const PORT = process.env.PORT || 3001;

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

try {
  await ensureDb();
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
