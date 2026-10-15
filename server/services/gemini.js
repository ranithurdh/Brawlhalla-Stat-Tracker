import { GoogleGenAI } from "@google/genai";
import Settings from "../models/Settings.js";

// Model names change over time. Check the current free-tier models in
// Google AI Studio and update this (or change it on the Settings page).
export const DEFAULT_MODEL = "gemini-2.5-flash";

export const DEFAULT_PROMPT = `You are reading a screenshot of the post-match stats screen from the game Brawlhalla.
For every player listed, extract the numbers below and return ONLY valid JSON (no markdown, no commentary) in exactly this shape:
{
  "players": [
    {
      "gamertag": string,
      "won": boolean | null,
      "kos": number | null,
      "falls": number | null,
      "accidents": number | null,
      "damageDone": number | null,
      "damageTaken": number | null
    }
  ]
}
Rules:
- Ignore which legend each player used. Do not return legends.
- "kos", "falls", "accidents", "damageDone" and "damageTaken" are the columns with those names (Damage Done and Damage Taken may be labelled "Damage Dealt" / "Damage Received").
- "won" is true for every player on the winning team (in a 2v2 that is both teammates) and false for everyone else. Work it out from the Victory / Defeat banner, the team grouping, or the highlighted winning side. Use null only if you truly cannot tell.
- Use null for any number you cannot read clearly. Never guess.
- Numbers must be plain numbers with no commas or units.
- Copy gamertags exactly as shown, including capitals, dots, underscores and symbols.`;

// Reads settings from MongoDB, falling back to .env and the defaults.
export async function getSettings() {
  let doc = await Settings.findOne({ key: "main" });
  if (!doc) doc = await Settings.create({ key: "main" });

  const envKey = process.env.GEMINI_API_KEY || "";
  return {
    apiKey: doc.apiKey || envKey,
    apiKeySource: doc.apiKey ? "settings" : envKey ? "env" : "none",
    model: doc.model || DEFAULT_MODEL,
    prompt: doc.prompt || DEFAULT_PROMPT,
  };
}

// A hosted site shouldn't hang forever if Gemini is slow, and a busy Gemini
// ("503 overloaded") usually works a few seconds later, so those are retried.
const TIMEOUT_MS = 45_000;
const RETRY_DELAYS_MS = [1500, 4000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBusy(err) {
  if (err.statusCode === 504) return true; // our own timeout
  const status = Number(err.status || err.code);
  if ([500, 502, 503, 504].includes(status)) return true;
  return /UNAVAILABLE|overloaded|high demand|ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(err.message || ""));
}

async function callGemini(request, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Gemini took too long to answer. Try again in a moment.");
      err.statusCode = 504;
      reject(err);
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([ai.models.generateContent(request), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Sends one screenshot to Gemini and returns the parsed JSON.
export async function extractFromImage({ buffer, mimeType }) {
  const { apiKey, model, prompt } = await getSettings();

  if (!apiKey) {
    const err = new Error("No Gemini API key yet. An admin can add one on the Settings page (or set GEMINI_API_KEY on the server).");
    err.statusCode = 400;
    throw err;
  }

  const request = {
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: buffer.toString("base64") } },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  };

  let result;
  for (let attempt = 0; ; attempt++) {
    try {
      result = await callGemini(request, apiKey);
      break;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isBusy(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  const raw = (result.text || "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error(
      "Gemini replied with something that wasn't valid JSON. Try again, or tighten the prompt on the Settings page."
    );
    err.statusCode = 502;
    throw err;
  }
}
