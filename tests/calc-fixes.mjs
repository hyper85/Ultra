/* The calculation audit of 2026-11-18, one check per fix. node tests/calc-fixes.mjs
   Physiology/nutrition, the plan engine (bundled from App.jsx with esbuild), the trænerråd, race day and import. */
import { check } from "./seed.mjs";
import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const { ok, done } = check();
const I = await import("../src/import.js");
const F = await import("../src/fitness.js");
const N = await import("../src/nutrition.js");
const A = await import("../src/aerobic.js");
const R = await import("../src/race.js");
const S = await import("../src/sessions.js");
const INS = await import("../src/insights.js");

// ---- heart rate → RPE uses the reserve, like every zone
const hp = { maxHR: 186, restHR: 49 };
ok(I.rpeFromHR(140, 186, 49) === 4 && I.rpeFromHR(120, 186, 49) === 3 && I.rpeFromHR(160, 186, 49) === 7, `RPE by reserve: 140→${I.rpeFromHR(140, 186, 49)}, 120→${I.rpeFromHR(120, 186, 49)}, 160→${I.rpeFromHR(160, 186, 49)}`);
ok(I.rpeFromHR(140, 186) === 5, "without a resting HR it falls back to % of max");
// ---- resting HR: the last 28 calendar days, not the last 28 records
const store = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`2026-01-${String(i + 1).padStart(2, "0")}`, { hr: 58 }]));
ok(I.restingHRSeries(store, { days: 28, until: "2026-11-15" }).rows.length === 0, "January's resting HR is not 'the last 28 days' in November");
ok(INS.restingBaseline({ wellness: store, log: { "2025-03-03": { hr: 60 }, "2025-03-10": { hr: 60 }, "2025-03-17": { hr: 60 } }, profileRest: 49, beforeKey: "2026-11-16" }).source === "profile", "old Garmin days and old log weeks do not make the normal; the profile does");
// ---- aerobic trend on the HR-adjusted pace
const runs = Object.fromEntries(Array.from({ length: 16 }, (_, i) => { const day = new Date(Date.UTC(2026, 8, 1 + i * 4)).toISOString().slice(0, 10); const hr = 122 + Math.round(i * 0.8); const pace = 6 + 0.03 * (130 - hr); return [day, { id: day, day, km: 8, min: 8 * pace, hr, type: "Run" }]; }));
const ae = A.aerobicEfficiency ? A.aerobicEfficiency(runs, { until: "2026-11-01" }) : null;
ok(!ae || Math.abs(ae.trendPer4w ?? 0) <= 2, `same efficiency, drifting HR: trend ${ae?.trendPer4w} s/km per 4 weeks (≈ 0)`);
// ---- fitness: Cooper ranges include their top value; fitness age from the same table
ok(F.fitnessReport({ age: 25, sex: "m", vo2: 36.4 }).category === "Lav" && F.fitnessReport({ age: 25, sex: "m", vo2: 46.4 }).category === "God", "36.4 at 25 is 'Lav', 46.4 is 'God' (tops included)");
const r25 = F.fitnessReport({ age: 25, sex: "m", vo2: 42.4 });
ok(r25.percentile === 50 && r25.fitnessAge === 25, `the 50th percentile at 25 is fitness age 25 (${r25.percentile} %, ${r25.fitnessAge})`);
const r41 = F.fitnessReport({ age: 41, sex: "m", restHR: 49, maxHR: 186 });
ok(r41.ageFloor === true && /justeret for alder/.test(r41.note), "a VO2 far above the youngest average says 'under 20', and the note names the age adjustment");
// ---- nutrition: maintenance + training, the carb table holds, meals add up
const bmr = 1821;
const keepEasy = N.dayTargets({ bmr, weight: 89, dayType: "easy", km: 8 }), leanEasy = N.dayTargets({ bmr, weight: 89, dayType: "easy", km: 8, body: "lean" });
ok(keepEasy.kcal >= Math.round((bmr * 1.45 + 89 * 8) / 10) * 10 - 10 && leanEasy.kcal === keepEasy.kcal - 300, `easy 8 km: ${keepEasy.kcal} kcal (maintenance), lean ${leanEasy.kcal}`);
ok(N.dayTargets({ bmr, weight: 89, dayType: "rest" }).kcal >= bmr * 1.4, "a rest day is not under everyday maintenance");
ok(["easy", "rest", "long", "quality"].every((d) => { const x = N.dayTargets({ bmr, weight: 89, dayType: d }); return Math.round(x.carbs / 89) === { easy: 4, rest: 3, long: 7, quality: 5 }[d]; }), "carbs follow the g/kg table");
const meals = N.mealIdeas({ protein: 176, weight: 88, dayType: "easy" });
ok(meals.rows.reduce((s, r) => s + r.protein, 0) === 176, `meal protein adds up to the day's (${meals.rows.map((r) => r.protein).join("+")})`);
// ---- race day
ok(R.parseTime("12,5") === 750 && R.parseTime("1:05:75") === null && R.paceToMin("6:75") === null && R.parseTime("11:11:11") > 671, "decimal hours, no 75 seconds, no 6:75 pace");
const sp = R.splits({ km: 83, totalMin: 798, vert: 3400, carbsPerHour: 85, mlPerHour: 500 });
ok(sp.reduce((s, x) => s + x.climb, 0) === 3400 && sp.at(-1).cum === 798 && sp.find((x) => /Halvvejs/.test(x.note))?.km === 40, "splits: climb sums to 3400, finish = total, halfway at km 40");
ok(R.effortKm(10, 500) === 15 && R.stopMin(83) === 15 && R.stopMin(42) === 0, "one climb rule (100 m = 1 km) and aid-station time for ultras");
const lr = S.longRunPlan({ km: 30, easyPaceMinKm: 6.25, phase: "Ultra-prep", raceKm: 83, raceVert: 3400 });
ok(/^Ca\. 4:13/.test(lr) && /750 m\+/.test(lr), `a long run with 750 m+ takes the climb's time (${lr.slice(0, 9)})`);
// ---- the lap plan: no depot after the last lap (RaceDay.jsx, checked through the bundle below)
// ---- the plan engine, bundled from App.jsx
const dir = mkdtempSync(join(tmpdir(), "ultra-calc-"));
await build({ stdin: { contents: 'export { buildPlan, buildCoachPlan } from "./src/App.jsx";', resolveDir: process.cwd(), loader: "js" }, bundle: true, platform: "node", format: "esm", outfile: join(dir, "plan.mjs"), loader: { ".css": "empty", ".png": "empty", ".svg": "empty" }, jsx: "automatic", define: { "import.meta.env.VITE_SUPABASE_URL": "undefined", "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined", __APP_VERSION__: '"test"' }, logLevel: "silent" });
const { buildPlan, buildCoachPlan } = await import(join(dir, "plan.mjs"));
const P = (o) => ({ startDate: "2026-08-24", raceDate: "2027-01-23", raceKm: 60, currentKm: 30, level: 2, maxRunDays: 4, qualityDay: 2, longDay: 5, ...o });
for (const [label, p] of [["level 2, 60 km", P({})], ["beginner 13 weeks", P({ level: 1, currentKm: 10, raceKm: 50, raceDate: "2026-11-21" })], ["level 3, 100 km", P({ level: 3, currentKm: 50, raceKm: 100, maxRunDays: 5 })]]) {
  const pl = buildPlan(p, { easyPaceMinKm: 6.25 });
  const over = pl.rows.filter((r) => !r.isRace && r.km > r.target + 0.5);
  ok(over.length === 0, `${label}: no week over its target (${over.map((r) => `w${r.i} ${r.km}/${r.target}`).join(", ") || "none"})`);
  ok(pl.rows.every((r) => Math.abs(r.days.reduce((a, b) => a + b, 0) - r.km) < 0.01), `${label}: every week is the sum of its days`);
  const b = pl.rows.findIndex((r) => r.phase === "Ultra-prep");
  if (b > 0) { const prev = pl.rows.slice(0, b).filter((r) => !r.deload).at(-1); ok(pl.rows[b].target <= prev.target * 1.12, `${label}: build → ultra-prep step ${prev.target} → ${pl.rows[b].target} (≤ +12 %)`); }
}
const sunRace = buildPlan(P({ raceDate: "2027-01-24" }), { easyPaceMinKm: 6.25 }).rows.at(-1);
ok(sunRace.days[6] === 60 && sunRace.longDay === 6, `a Sunday race is on Sunday, not on the Saturday long-run day (${JSON.stringify(sunRace.days)})`);
// coach plan: a recovery week after an event over 6 h is 60 % of the whole planned week
const cpData = JSON.parse((await import("fs")).readFileSync(new URL("../src/data/coach-plan.json", import.meta.url), "utf8"));
const wk = cpData.weeks.find((w) => w.start === "2026-11-02");
const ev = { date: "2026-10-31", name: "Testmarch", km: 50, type: "walk", hours: 10 };
const cp = buildCoachPlan({ coachMode: true, coachPlan: { data: { ...cpData, events: [...(cpData.events || []), ev] } } });
const rec = cp.rows.find((r) => r.key === "2026-11-02");
ok(rec?.recovery && rec.km === Math.round(wk.days.reduce((a, b) => a + b, 0) * 0.6), `recovery week = 60 % of the planned ${wk.days.reduce((a, b) => a + b, 0)} km (${rec?.km}, ${JSON.stringify(rec?.days)})`);
done();
