import express from "express";
import cors from "cors";
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
import { ensureDb } from "./db.js";

// The Express app, without starting a server. index.js runs it as a normal
// server (local / Render / Railway); api/index.js runs it as a Vercel function.

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

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Every other API route needs the database, so connect first (only the first
// request of a server instance actually waits).
app.use("/api", async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    next(err);
  }
});
// Mounted before the 1 MB JSON limit below: background images are bigger than that.
app.use("/api/site", siteRoutes);
// Backup import has its own, larger body limit.
app.use("/api/backup", backupRoutes);
app.use(express.json({ limit: "1mb" }));

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
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        // The service worker must always be re-checked so updates reach people.
        if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
        if (filePath.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
      },
    })
  );
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

export default app;
