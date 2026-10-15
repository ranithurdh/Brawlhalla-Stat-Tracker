// Small wrapper around fetch so every page handles errors the same way.

const KEY = "adminPassword";

// The password lives in sessionStorage: it is forgotten when the tab closes.
export const getAdminPassword = () => {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};

export const setAdminPassword = (value) => {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the password then only lasts until reload.
  }
  window.dispatchEvent(new Event("auth-change"));
};

// The upload code (set by UPLOAD_CODE on the server) is remembered on this device.
const CODE_KEY = "uploadCode";

export const getUploadCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
};

export const setUploadCode = (value) => {
  try {
    if (value) localStorage.setItem(CODE_KEY, value);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // Storage can be blocked; the code then only lasts until reload.
  }
};

async function request(path, options = {}) {
  const password = getAdminPassword();
  const headers = { ...(options.headers || {}) };
  if (password) headers["x-admin-password"] = password;
  const uploadCode = getUploadCode();
  if (uploadCode) headers["x-upload-code"] = uploadCode;

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A wrong or outdated password sends the person back to the password box.
    if (res.status === 401 && password) setAdminPassword("");
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    // "gemini_limit", "duplicate" or "not_counted" when the server says why.
    err.code = data.code || "";
    throw err;
  }
  return data;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Auth
export const getAuthStatus = () => request("/auth/status");
export const checkPassword = () => request("/auth/check", { method: "POST" });

// Settings (password needed)
export const getSettings = () => request("/settings");
export const saveSettings = (body) => request("/settings", json("PUT", body));

// Players: reading is public, changing needs the password
export const getPlayers = () => request("/players");
export const addPlayer = (body) => request("/players", json("POST", body));
export const updatePlayer = (id, body) => request(`/players/${id}`, json("PUT", body));
export const deletePlayer = (id) => request(`/players/${id}`, { method: "DELETE" });

// Leaderboards (public)
export const getLeaderboards = () => request("/stats/leaderboards");
export const getHome = () => request("/stats/home");
export const recalculateStats = () => request("/stats/recalculate", { method: "POST" });

// Matches: reading, uploading and submitting what Gemini read are public;
// editing the numbers, editing a saved match and deleting need the password
export const extractStats = (file) => {
  const form = new FormData();
  form.append("screenshot", file);
  return request("/extract", { method: "POST", body: form });
};
export const getMatches = () => request("/matches");
// Admin: { players }. Everyone else: { draftToken } from the extract step.
export const saveMatch = (match) => request("/matches", json("POST", match));
export const updateMatch = (id, body) => request(`/matches/${id}`, json("PUT", body));
export const deleteMatch = (id) => request(`/matches/${id}`, { method: "DELETE" });

// Site look: public to read, password needed to change
export const getSite = () => request("/site");
export const saveSite = (body) => request("/site", json("PUT", body));

// 1v1 page: ELO, head-to-head records and boards (public); deleting needs the password
export const getDuels = () => request("/duels");
export const deleteDuel = (id) => request(`/duels/${id}`, { method: "DELETE" });

// Backup (admin only): download everything as one file, or restore from that file.
export async function downloadBackup() {
  const password = getAdminPassword();
  const res = await fetch("/api/backup", { headers: password ? { "x-admin-password": password } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && password) setAdminPassword("");
    throw new Error(data.error || `Backup failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || "brawlding-backup.json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
export const importBackup = (backup) => request("/backup/import", json("POST", backup));
