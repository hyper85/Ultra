/* Aerobic efficiency: how fast the runner goes at the same easy heart rate, over time. Only easy runs count: average
   heart rate 120–135 and at least 5 km. Faster at the same pulse = the aerobic engine is growing.

   Pace at HR 130: each run's pace is moved to what it would be at 130 bpm along the runner's own pace/HR slope
   (fitted over all qualifying runs; −0.03 min/km per bpm when there are too few runs or the fit makes no sense), then
   averaged over the last 28 days ("nu") and over days 28–56 ago ("for 4 uger siden"). The trend line is a straight
   least-squares fit of pace on date. */
import { kind, parseLocal } from "./import.js";

export const AE = { hrLo: 120, hrHi: 135, minKm: 5, refHR: 130 };
const fit = (pts) => { // least squares y = a + b x
  const n = pts.length; if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0); if (!sxx) return null;
  const b = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  return { a: my - b * mx, b };
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function aerobicEfficiency(acts, { today = new Date() } = {}) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const runs = Object.values(acts || {})
    .filter((a) => kind(a.type) === "run" && a.hr >= AE.hrLo && a.hr <= AE.hrHi && a.km >= AE.minKm && a.min > 0)
    .map((a) => ({ day: a.day, ago: Math.round((t0 - parseLocal(a.day).getTime()) / 86400000), km: a.km, hr: a.hr, pace: a.min / a.km }))
    .filter((r) => r.ago >= 0)
    .sort((x, y) => (x.day < y.day ? -1 : 1));
  if (!runs.length) return { runs, enough: false };
  const hrFit = fit(runs.map((r) => ({ x: r.hr, y: r.pace })));
  const slope = hrFit && runs.length >= 6 && hrFit.b < 0 && hrFit.b > -0.12 ? hrFit.b : -0.03;
  for (const r of runs) r.p130 = r.pace + slope * (AE.refHR - r.hr);
  const now = runs.filter((r) => r.ago < 28), then = runs.filter((r) => r.ago >= 28 && r.ago < 56);
  const nowPace = mean(now.map((r) => r.p130)), thenPace = mean(then.map((r) => r.p130));
  const first = parseLocal(runs[0].day).getTime();
  const trend = fit(runs.map((r) => ({ x: (parseLocal(r.day).getTime() - first) / 86400000, y: r.pace })));
  return { runs, enough: runs.length >= 3, slope, nowPace, thenPace, nNow: now.length, nThen: then.length,
    deltaSec: nowPace != null && thenPace != null ? Math.round((nowPace - thenPace) * 60) : null,
    trend, trendPer4w: trend ? Math.round(trend.b * 28 * 60) : null, firstDay: runs[0].day };
}

export const fmtPace = (minKm) => { if (minKm == null) return "–"; const m = Math.floor(minKm); let s = Math.round((minKm - m) * 60); return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`; };
