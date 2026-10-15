// Small formatting helpers for the 1v1 page.
export const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
export const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
