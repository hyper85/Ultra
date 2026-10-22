/* Daily resting HR: a Garmin 4-week report lands day by day (profile store), charts on Overblik, feeds the coach's
   questions and the AI context; a screenshot gets a helpful refusal. node tests/wellness.mjs */
import { openApp, check } from "./seed.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { ok, done } = check();
const dir = mkdtempSync(join(tmpdir(), "ultra-wellness-"));
const days = []; for (let i = 27; i >= 0; i--) { const d = new Date(Date.UTC(2026, 9, 8) - i * 86400000).toISOString().slice(0, 10); days.push([d, i === 0 ? 55 : 46 + ((i * 7) % 5)]); }
const csv = "Date,Resting Heart Rate,High Heart Rate\n" + days.map(([d, hr]) => `${d},${hr},${hr + 90}`).join("\n") + "\n";
writeFileSync(join(dir, "Heart Rate.csv"), csv);
writeFileSync(join(dir, "Screenshot_20261022.jpg"), Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex"));
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(200));
{
  const { browser, page, errors } = await openApp({ lang: "da", width: 390 });
  await tab(page, 4);
  await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  await page.locator("#files input[type=file]").setInputFiles(join(dir, "Heart Rate.csv")); await page.waitForTimeout(800);
  const msg = await page.locator("#files .advice").first().innerText();
  ok(/Hvilepuls for 5 uger lagt i loggen\. 28 dage på Overblik\./.test(msg), `import message: ${msg.slice(0, 120)}`);
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-profile")));
  ok(prof.wellness && Object.keys(prof.wellness).length === 28 && prof.wellness["2026-10-08"].hr === 55, `28 days stored, latest 55 (${Object.keys(prof.wellness || {}).length})`);
  const lg = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log")));
  ok(lg["2026-10-05"].hr === 50 && !lg["2026-10-05"].hrAuto, `a typed week value is kept (${lg["2026-10-05"].hr})`);
  // Overblik chart
  await tab(page, 2);
  const panel = page.locator("#chart-hr-days");
  const ptxt = (await panel.innerText()).replace(/\n/g, " ");
  ok(/Hvilepuls, dag for dag 28 dage · normal 48/i.test(ptxt) && /Seneste 55 \(8\. okt\.\): 7 over normal\. Hold igen og sov mere\./.test(ptxt), `chart head: ${ptxt.slice(0, 120)}`);
  ok(await panel.locator("svg circle").count() === 28, "28 points");
  // the coach's first question follows the daily value
  await tab(page, 3);
  const chips = await page.locator(".ask-chips button").allInnerTexts();
  ok(chips[0] === "Min hvilepuls er høj – skal jeg løbe i dag?", `coach chip: ${chips[0]}`);
  // a screenshot is refused with the way to the CSV
  await tab(page, 4);
  await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  await page.locator("#files input[type=file]").setInputFiles(join(dir, "Screenshot_20261022.jpg")); await page.waitForTimeout(600);
  const m2 = await page.locator("#files .advice").first().innerText();
  ok(/Screenshot_20261022\.jpg er et billede\. Appen læser tal, ikke skærmbilleder: hent rapporten som CSV fra connect\.garmin\.com/.test(m2), `image refusal: ${m2.slice(0, 100)}`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
// the AI context carries the series
{
  const { coachContext, buildInsights } = await import("../src/insights.js");
  const { ymd, addDays, parseLocal } = await import("../src/import.js");
  const rows = Array.from({ length: 8 }, (_, k) => { const d = addDays(parseLocal("2026-08-24"), k * 7); return { i: k + 1, key: ymd(d), wkStart: d, phase: "Opbygning", km: 25, days: [0, 0, 6, 5, 0, 14, 0], longDay: 5, qDay: 2, lng: 14, isRace: false }; });
  const wellness = Object.fromEntries(days.map(([d, hr]) => [d, { hr }]));
  const p = { currentKm: 25, level: 2, maxRunDays: 4, longDay: 5, sched: { A: [] }, intol: [], restHR: 49, wellness };
  const ins = buildInsights({ plan: { rows, weeks: 8, peak: 50 }, log: {}, acts: {}, p, todayKey: "2026-10-05", maxHR: 186 });
  const ctx = coachContext({ p, plan: { rows, weeks: 8, peak: 50 }, cur: rows[6], log: {}, acts: {}, acwrFor: () => null, insights: ins, todayStr: "2026-10-08", maxHR: 186, advice: "x" });
  ok(ctx.hvilepuls_dagligt && ctx.hvilepuls_dagligt.normal_28d === 48 && ctx.hvilepuls_dagligt.seneste.hr === 55 && ctx.hvilepuls_dagligt.sidste_28_dage.length === 28, `context: ${JSON.stringify(ctx.hvilepuls_dagligt).slice(0, 90)}`);
}
done();
