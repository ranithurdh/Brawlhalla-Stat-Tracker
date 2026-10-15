// Shared by the Add match page and the match editor on the Matches page.

export const NUMBERS = [
  { key: "kos", label: "KOs" },
  { key: "falls", label: "Falls" },
  { key: "accidents", label: "Accidents" },
  { key: "damageDone", label: "Damage done" },
  { key: "damageTaken", label: "Damage taken" },
];

// Inputs need "" instead of null to stay controlled.
const toInput = (v) => (v === null || v === undefined ? "" : v);
const wonToInput = (v) => (v === true ? "won" : v === false ? "lost" : "");

export const blankPlayer = () => ({
  gamertag: "",
  playerId: "",
  matchedBy: null,
  won: "",
  ...Object.fromEntries(NUMBERS.map((c) => [c.key, ""])),
});

// A row from Gemini's reading or from a saved match -> a row for the form.
export const rowFromServer = (p) => ({
  gamertag: p.gamertag || "",
  playerId: p.playerId || "",
  matchedBy: p.matchedBy || null,
  won: wonToInput(p.won),
  ...Object.fromEntries(NUMBERS.map((c) => [c.key, toInput(p[c.key])])),
});

// A form row -> what the server expects.
export const rowToPayload = (p) => ({
  ...p,
  playerId: p.playerId || null,
  won: p.won === "won" ? true : p.won === "lost" ? false : null,
});
