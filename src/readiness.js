/* Dagsform: one number for "how ready is the body today", built only from numbers the runner can see.
   Starts at 100 and loses points for each warning sign, so every point is traceable:
   - resting HR above the 28-day normal: 7.5 per beat (+4 → 70 "hold igen", +7 → under 50, as the app's own rule)
   - sleep under 7 hours: 10 per missing hour, at most 25
   - HRV more than 10 % under its normal: 1 per extra percent, at most 20
   - load (ACWR of the last full week) over 1.3: 1 per 0.01, at most 20
   Needs the resting HR and its normal; the rest is optional. Not a medical measure. */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const median = (xs) => { const s = xs.filter((x) => x > 0).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export function readiness({ hr, normal, sleep, hrv, hrvNormal, acwr } = {}) {
  if (!(hr > 0) || !(normal > 0)) return null;
  const parts = [];
  const d = hr - normal;
  parts.push({ k: "hr", pts: -Math.min(55, Math.max(0, d) * 7.5), hr, normal, d });
  if (sleep > 0) parts.push({ k: "sleep", pts: -Math.round(Math.min(25, Math.max(0, 7 - sleep) * 10)), sleep });
  if (hrv > 0 && hrvNormal > 0) { const drop = (hrvNormal - hrv) / hrvNormal; parts.push({ k: "hrv", pts: -clamp(Math.round((drop - 0.1) * 100), 0, 20), hrv, hrvNormal: Math.round(hrvNormal) }); }
  if (acwr > 0) parts.push({ k: "load", pts: -clamp(Math.round((acwr - 1.3) * 100), 0, 20), acwr });
  const score = clamp(Math.round(100 + parts.reduce((s, p) => s + p.pts, 0)), 0, 100);
  return { score, level: score >= 75 ? "good" : score >= 50 ? "ok" : "low", parts };
}

/* readinessFor({ wellness, today, acwr }) → readiness from the daily watch values: today's (or yesterday's) resting HR
   against the median of the 28 days before it; { ...readiness, day } or null. */
export function readinessFor({ wellness = {}, today, yesterday, acwr } = {}) {
  const day = wellness?.[today]?.hr > 0 ? today : wellness?.[yesterday]?.hr > 0 ? yesterday : null;
  if (!day) return null;
  const before = Object.keys(wellness).filter((d) => d < day).sort().slice(-28);
  if (before.filter((d) => wellness[d]?.hr > 0).length < 7) return null; // a normal needs a week of days
  const v = wellness[day];
  const r = readiness({ hr: v.hr, normal: Math.round(median(before.map((d) => wellness[d]?.hr || 0))), sleep: v.sleep, hrv: v.hrv, hrvNormal: median(before.map((d) => wellness[d]?.hrv || 0)), acwr });
  return r ? { ...r, day } : null;
}
