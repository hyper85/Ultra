/* Shared Playwright seed for the UI tests: a runner seven weeks into the coach plan, with a log and Strava runs.
   Run against `npx vite preview --port 4174` (ULTRA_URL overrides). Playwright comes from the global install. */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
export { chromium };

export const base = { v: 5, onboarded: true, age: 41, height: 181, weight: 89, restHR: 49, maxHR: 186, currentKm: 35, breakWeeks: 0, startDate: "2026-08-24", raceName: "Hammer Trail Winter 50 miles", raceDate: "2027-01-30", raceKm: 83, raceVert: 3400, qualityDay: 2, longDay: 5, liftDays: [1, 3], sex: "m", level: 3, goal: "finish", body: "keep", gear: "gym", injury: "none", diet: "all", intol: [], maxRunDays: 4, peakScale: 1, coachMode: true, sched: { A: [], B: [] } };
export const log = { "2026-08-24": { km: 28, rpe: 5, hr: 50, sleep: 7.2, wt: 89 }, "2026-08-31": { km: 48.2, rpe: 6, hr: 49 }, "2026-09-07": { km: 21.1, rpe: 5, hr: 50 }, "2026-09-14": { km: 15, rpe: 4, hr: 48 }, "2026-09-21": { km: 33, rpe: 5, hr: 48 }, "2026-09-28": { km: 20, rpe: 5, hr: 50, xmin: 663 }, "2026-10-05": { km: 6, hr: 50 } };
export const mk = (day, km, min, type, hr = 132) => ({ id: `${day}-${type}`, date: new Date(`${day}T07:00:00`).toISOString(), day, km, min, hr, type, kind: type === "Walk" ? "hike" : "run", name: type, source: "Strava", file: "x" });
export const acts = Object.fromEntries([["2026-09-01", 8, 50], ["2026-09-03", 10, 61], ["2026-09-08", 7, 44], ["2026-09-15", 8, 49], ["2026-09-22", 9, 54], ["2026-09-24", 6, 37], ["2026-09-28", 8, 52], ["2026-09-30", 6, 38], ["2026-10-07", 6, 40]].map(([d, km, min]) => [`${d}-Run`, mk(d, km, min, "Run")]));

const clock = ({ T }) => { const RD = Date; const off = T - RD.now(); globalThis.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [RD.now() + off])); } static now() { return RD.now() + off; } }; };

/* openApp({ lang, width, at, todayRun, patch, extraActs }) → { browser, ctx, page, errors }: the seeded runner at local time `at`. */
export async function openApp({ lang = "da", width = 390, height = 844, at = "2026-10-08T09:00:00", todayRun = false, patch = {}, extraActs = {} } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: "Europe/Copenhagen", acceptDownloads: true, serviceWorkers: "block" }); // page.route cannot see requests the service worker makes
  const a = { ...acts, ...extraActs }; if (todayRun) a[`${at.slice(0, 10)}-Run`] = mk(at.slice(0, 10), 5.2, 33, "Run");
  await ctx.addInitScript(clock, { T: new Date(at).getTime() });
  await ctx.addInitScript(({ base, log, acts, lang }) => { localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", lang); }, { base: { ...base, ...patch }, log, acts: a, lang });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.ULTRA_URL || "http://localhost:4174/", { waitUntil: "networkidle" });
  return { browser, ctx, page, errors };
}

/* fresh({ lang, width, at }) → a brand-new install (lands in the questionnaire). */
export async function fresh({ lang = "da", width = 390, height = 844, at = "2026-10-08T09:00:00" } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: "Europe/Copenhagen" });
  await ctx.addInitScript(clock, { T: new Date(at).getTime() });
  await ctx.addInitScript((lang) => localStorage.setItem("ultraplan-lang", lang), lang);
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.ULTRA_URL || "http://localhost:4174/", { waitUntil: "networkidle" });
  return { browser, ctx, page, errors };
}

export const check = () => { let fails = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; }; const done = () => { console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0); }; return { ok, done }; };
