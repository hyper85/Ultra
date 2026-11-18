/* The race forecast's pace comes from the runner's own long runs (18 km+, last 8 weeks, easy-to-steady HR, not the
   treadmill) when there are 2+: short easy runs are slower than a runner's long runs, so their median made the
   forecast 12–17 % too slow. Else the easy pace, without treadmill runs. node tests/forecast.mjs */
import { openApp, check, mk } from "./seed.mjs";
const { ok, done } = check();
const { longRunPace, predictFinish } = await import("../src/race.js");
const run = (day, km, min, vert, hr, extra = {}) => ({ id: `${day}-L`, day, km, min, vert, hr, type: "Run", ...extra });
const longs = { a: run("2026-11-01", 22, 132, 150, 138), b: run("2026-11-08", 26, 165, 400, 142), c: run("2026-11-14", 20, 124, 100, 140) };
{
  const r = longRunPace(longs, { until: "2026-11-18", maxHR: 186, restHR: 49 });
  ok(r && r.n === 3 && r.pace > 5.3 && r.pace < 5.9, `three long runs → a flat pace of ${r?.pace.toFixed(2)} min/km`);
  ok(longRunPace({ ...longs, d: run("2026-11-15", 25, 140, 700, 170) }, { until: "2026-11-18", maxHR: 186, restHR: 49 }).n === 3, "a race-effort run (HR 170) does not count");
  ok(longRunPace({ ...longs, e: run("2026-11-16", 21, 160, 0, 135, { treadmill: true }) }, { until: "2026-11-18", maxHR: 186, restHR: 49 }).n === 3, "a treadmill run does not count");
  ok(longRunPace({ ...longs, f: run("2026-08-01", 30, 200, 0, 135) }, { until: "2026-11-18", maxHR: 186, restHR: 49 }).n === 3, "a run older than 8 weeks does not count");
  ok(longRunPace({ a: longs.a }, { until: "2026-11-18", maxHR: 186, restHR: 49 }) === null, "one long run is not enough");
  // the model run backwards: a predicted run of a long run's own size gives back its time
  const p = longRunPace({ a: longs.a, x: { ...longs.a, id: "x" } }, { until: "2026-11-18", maxHR: 186, restHR: 49 }).pace;
  ok(Math.abs(predictFinish({ km: 22, vert: 150, easyPaceMinKm: p }) - 132) <= 1, "predicting a long run from its own pace gives its own time");
}
{ // on screen: Fremskridt says what the forecast is based on
  const extra = Object.fromEntries(Object.values(longs).map((a) => [a.id, { ...mk(a.day, a.km, a.min, "Run", a.hr), id: a.id, vert: a.vert }]));
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-18T09:00:00", extraActs: extra });
  await page.locator("nav.tabbar button").nth(2).click(); await page.waitForTimeout(500);
  const tile = (await page.locator(".tile", { hasText: "Prognose" }).first().innerText()).replace(/\s+/g, " ");
  ok(/ud fra dine 3 lange ture de sidste 8 uger/.test(tile), `the Prognose tile names its basis (${tile})`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
