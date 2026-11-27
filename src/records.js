/* Personal records from the runner's own activities, and what the best recent run says about other distances.
   Pure functions over the activity store. */
import { kind, mondayOf, parseLocal, ymd, addDays } from "./import.js";

const r1 = (x) => Math.round(x * 10) / 10;
const paceOk = (a) => a.km >= 3 && a.min > 0 && a.min / a.km >= 2.5 && a.min / a.km <= 12; // outside this the GPS or the clock was wrong

/* records(acts, { includeHikes }) → { longest, week, vert, fastest, n } (each null when there is nothing to show):
   longest { km, day } · week { km, key } (Monday) · vert { m, day } · fastest { pace (min/km), km, day } over at least 5 km. */
export function records(acts = {}, { includeHikes = false } = {}) {
  const runs = Object.values(acts || {}).filter((a) => a && a.km > 0 && (kind(a.type) === "run" || (includeHikes && kind(a.type) === "hike")));
  if (!runs.length) return { longest: null, week: null, vert: null, fastest: null, n: 0 };
  const top = (xs, f) => xs.reduce((b, a) => (b == null || f(a) > f(b) ? a : b), null);
  const L = top(runs, (a) => a.km);
  const weeks = {};
  for (const a of runs) { const k = ymd(mondayOf(parseLocal(a.day))); weeks[k] = (weeks[k] || 0) + a.km; }
  const wk = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0];
  const climbs = runs.filter((a) => a.vert > 0);
  const V = top(climbs, (a) => a.vert);
  const fast = runs.filter((a) => kind(a.type) === "run" && a.km >= 5 && paceOk(a));
  const F = top(fast, (a) => -a.min / a.km);
  return {
    longest: { km: r1(L.km), day: L.day },
    week: { km: r1(wk[1]), key: wk[0] },
    vert: V ? { m: Math.round(V.vert), day: V.day } : null,
    fastest: F ? { pace: F.min / F.km, km: r1(F.km), day: F.day } : null,
    n: runs.length,
  };
}

/* equivalents(acts, { today, days }) → what the best run of the last `days` (84) says about 5, 10, 21.1 and 42.2 km,
   by Riegel's formula T2 = T1 × (D2 / D1)^1.06. "Best" is the run that gives the fastest 10 km by that formula, so a
   short fast run and a long steady one are compared fairly. Distances shorter than half the basis run or more than
   five times it are left out: the formula does not stretch that far. → { basis: { km, min, day }, rows: [{ km, min }] } or null. */
export const riegel = (min, km, to) => min * Math.pow(to / km, 1.06);
export function equivalents(acts = {}, { today, days = 84 } = {}) {
  const from = today ? ymd(addDays(parseLocal(today), -(days - 1))) : "";
  const runs = Object.values(acts || {}).filter((a) => a && kind(a.type) === "run" && paceOk(a) && !(a.incline > 0) && (!today || (a.day >= from && a.day <= today)));
  if (!runs.length) return null;
  const best = runs.reduce((b, a) => (riegel(a.min, a.km, 10) < riegel(b.min, b.km, 10) ? a : b));
  const rows = [5, 10, 21.1, 42.2].filter((d) => d >= best.km / 2 && d <= best.km * 5).map((d) => ({ km: d, min: riegel(best.min, best.km, d) }));
  return rows.length ? { basis: { km: r1(best.km), min: best.min, day: best.day }, rows } : null;
}

// 24.6 → "24:36", 112.2 → "1:52:12": race times need the seconds that fmtTime (h:mm) drops.
export const fmtRaceTime = (min) => { const s = Math.round(min * 60); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; const p = (n) => String(n).padStart(2, "0"); return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
