/* Strength log: the weight per exercise, session by session. Stored in the profile as
   p.lifts = { [exercise name]: [[day, kg], ...] } – oldest first, the newest LIFT_KEEP kept, one entry per day.
   Pure functions; the screens decide where the numbers show. */
export const LIFT_KEEP = 30;
const r1 = (x) => Math.round(x * 10) / 10;

// "62,5" or 62.5 → 62.5; anything that is not a weight between 0 and 500 kg → null.
export const liftKg = (v) => { const n = typeof v === "string" ? +v.trim().replace(",", ".") : +v; return Number.isFinite(n) && n > 0 && n <= 500 ? r1(n) : null; };

/* addLift(lifts, name, day, kg) → a new store with that day's weight set (an empty or invalid kg removes the day). */
export function addLift(lifts = {}, name, day, kg) {
  const v = liftKg(kg);
  const rows = (Array.isArray(lifts?.[name]) ? lifts[name] : []).filter(([d]) => d !== day);
  if (v != null) rows.push([day, v]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const next = { ...(lifts || {}) };
  if (rows.length) next[name] = rows.slice(-LIFT_KEEP); else delete next[name];
  return next;
}

/* liftInfo(lifts, name, day) → what to show beside an exercise on `day`:
   today (kg logged that day), last ([day, kg] before it), best (highest before it), record (today beats best),
   next (the weight to try: one step up once the same weight was lifted the last two sessions; step 1 kg under 20 kg, else 2.5). */
export function liftInfo(lifts = {}, name, day) {
  const rows = Array.isArray(lifts?.[name]) ? lifts[name] : [];
  const today = rows.find(([d]) => d === day)?.[1] ?? null;
  const before = rows.filter(([d]) => d < day);
  const last = before.length ? before[before.length - 1] : null;
  const best = before.length ? Math.max(...before.map(([, k]) => k)) : null;
  const steady = before.length >= 2 && before[before.length - 1][1] === before[before.length - 2][1];
  const next = steady ? r1(last[1] + (last[1] < 20 ? 1 : 2.5)) : null;
  return { today, last, best, next, record: today != null && best != null && today > best };
}

/* liftProgress(lifts) → one row per exercise with at least two sessions, most-trained first:
   { name, n, first, latest, best, change (latest − first), day (latest day) }. */
export function liftProgress(lifts = {}) {
  return Object.entries(lifts || {}).filter(([, rows]) => Array.isArray(rows) && rows.length >= 2).map(([name, rows]) => {
    const kg = rows.map(([, k]) => k);
    return { name, n: rows.length, first: kg[0], latest: kg[kg.length - 1], best: Math.max(...kg), change: r1(kg[kg.length - 1] - kg[0]), day: rows[rows.length - 1][0] };
  }).sort((a, b) => b.n - a.n || (a.day < b.day ? 1 : -1));
}

// Stored data that is not a lift log is dropped entry by entry (sanitize.js).
export function cleanLifts(lifts) {
  if (!lifts || typeof lifts !== "object" || Array.isArray(lifts)) return {};
  const out = {};
  for (const [name, rows] of Object.entries(lifts)) {
    if (!Array.isArray(rows)) continue;
    const ok = rows.filter((x) => Array.isArray(x) && /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && liftKg(x[1]) != null).map(([d, k]) => [d, liftKg(k)]);
    if (ok.length) out[name] = ok.slice(-LIFT_KEEP);
  }
  return out;
}
