import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import settingsRoutes from "./routes/settings.js";
import extractRoutes from "./routes/extract.js";
import matchRoutes from "./routes/matches.js";
import authRoutes from "./routes/auth.js";
import playerRoutes from "./routes/players.js";
import statsRoutes from "./routes/stats.js";
import siteRoutes from "./routes/site.js";
import duelRoutes from "./routes/duels.js";
import backupRoutes from "./routes/backup.js";
import { prepareDatabase } from "./services/migrate.js";

const app = express();

// Hosts like Render, Railway and Fly sit behind a proxy. Without this every
// visitor looks like the same IP, which breaks the wrong-password lockout.
app.set("trust proxy", 1);

// CLIENT_ORIGIN can be one address or several separated by commas. It is only
// needed when the React app is hosted somewhere other than this server.
// Basic browser protections (a small stand-in for the "helmet" package).
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
// Mounted before the 1 MB JSON limit below: background images are bigger than that.
app.use("/api/site", siteRoutes);
// Backup import has its own, larger body limit.
app.use("/api/backup", backupRoutes);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/extract", extractRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/duels", duelRoutes);

// In production this one server also serves the built React app (client/dist),
// so the whole site is a single deploy.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, "index.html")));
}
app.use("/api", (req, res) => res.status(404).json({ error: "Unknown API route." }));

// Catch-all error handler (upload errors, database errors, and so on).
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "That image is over 5 MB." : err.message;
    return res.status(400).json({ error: message });
  }
  console.error(err);
  res
    .status(err.statusCode || 500)
    .json({ error: err.message || "Something went wrong on the server.", ...(err.code === "duplicate" ? { code: "duplicate" } : {}) });
});

const PORT = process.env.PORT || 3001;

// ---- MongoDB connection -------------------------------------------------
// Paste your connection string into MONGODB_URI (server/.env locally, or the
// environment variables page of your host). A free MongoDB Atlas string looks like:
//   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/brawlhalla-tracker?retryWrites=true&w=majority
function readMongoUri() {
  let uri = (process.env.MONGODB_URI || "").trim().replace(/^["']|["']$/g, "");
  if (!uri) {
    console.warn("MONGODB_URI is not set, using a local MongoDB at 127.0.0.1:27017.");
    return "mongodb://127.0.0.1:27017/brawlhalla-tracker";
  }
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new Error('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  }
  if (/<password>|<db_password>|<username>/i.test(uri)) {
    throw new Error("MONGODB_URI still contains <password>. Replace it (brackets included) with your database user's password.");
  }
  // Atlas gives a string with no database name; without one data lands in "test".
  const hasDbName = /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri);
  if (!hasDbName) {
    uri = uri.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/?(\?.*)?$/, "$1/brawlhalla-tracker$2");
  }
  return uri;
}

function explainMongoError(err) {
  const msg = String(err.message || err);
  if (/bad auth|authentication failed/i.test(msg)) {
    return "Wrong database username or password in MONGODB_URI. If the password has symbols like @ : / ? # %, URL-encode them (for example @ becomes %40).";
  }
  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(msg)) {
    return "Could not find that cluster address. Check the host part of MONGODB_URI.";
  }
  if (/ReplicaSetNoPrimary|Server selection timed out|timed out|ECONNREFUSED/i.test(msg)) {
    return "Could not reach the database. On MongoDB Atlas open Network Access and allow your host's IP (for a hosted site, allow 0.0.0.0/0).";
  }
  return msg;
}

// A stray error should show up in the host's logs, not silently kill the site.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

try {
  await mongoose.connect(readMongoUri(), { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB");
  await prepareDatabase();
  if (!process.env.ADMIN_PASSWORD) {
    console.warn("WARNING: ADMIN_PASSWORD is not set. Settings and uploads are locked until you set it in server/.env.");
  } else if (process.env.ADMIN_PASSWORD.length < 10) {
    console.warn("WARNING: ADMIN_PASSWORD is short. Use a long passphrase on a public site.");
  }
  if (!process.env.UPLOAD_CODE) {
    console.warn("NOTE: UPLOAD_CODE is not set, so anyone with the link can use your Gemini quota. Set it to a short secret word.");
  }
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
} catch (err) {
  console.error("Could not connect to MongoDB:", explainMongoError(err));
  process.exit(1);
}
