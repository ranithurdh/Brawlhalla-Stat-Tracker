import mongoose from "mongoose";
import { prepareDatabase } from "./services/migrate.js";

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

export function explainMongoError(err) {
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

function startupWarnings() {
  if (!process.env.ADMIN_PASSWORD) {
    console.warn("WARNING: ADMIN_PASSWORD is not set. Settings and uploads are locked until you set it.");
  } else if (process.env.ADMIN_PASSWORD.length < 10) {
    console.warn("WARNING: ADMIN_PASSWORD is short. Use a long passphrase on a public site.");
  }
  if (!process.env.UPLOAD_CODE) {
    console.warn("NOTE: UPLOAD_CODE is not set, so anyone with the link can use your Gemini quota. Set it to a short secret word.");
  }
}

// Connects (and runs the one-time database checks) once per server instance.
// Serverless hosts like Vercel start a fresh instance now and then and reuse it
// for many requests, so every request just waits on this same promise.
let ready = null;

export function ensureDb() {
  if (!ready) {
    ready = (async () => {
      try {
        // A small pool, so many short-lived instances don't use up Atlas' free connection limit.
        await mongoose.connect(readMongoUri(), { serverSelectionTimeoutMS: 10000, maxPoolSize: 5 });
        console.log("Connected to MongoDB");
        await prepareDatabase();
        startupWarnings();
      } catch (err) {
        const wrapped = new Error(`Could not connect to MongoDB: ${explainMongoError(err)}`);
        wrapped.statusCode = 503;
        throw wrapped;
      }
    })();
    // A failed start must not be remembered, or the site would stay broken until redeployed.
    ready.catch(() => {
      ready = null;
      mongoose.disconnect().catch(() => {});
    });
  }
  return ready;
}
