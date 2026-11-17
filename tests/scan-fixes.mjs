/* Fixes from the 2026-11-17 scan. node tests/scan-fixes.mjs
   - a run with average HR below resting HR (sensor dropout) no longer crashes Overblik and the AI coach (zone bands)
   - times are rounded before they are split: never "1:60" or "5:60"
   - a race under 8 weeks away: the 8-week plan ends on the race, it does not run past it
   - the Plan guide's easy-run cap is the same as I dag's (heart-rate reserve)
   - the coach plan with a later questionnaire start date: no duplicate weeks in the log (React keys) */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(350));
{
  const { hrZoneWeeks } = await import("../src/insights.js");
  const acts = { a: { id: "a", day: "2026-11-10", km: 8, min: 50, hr: 44, type: "Run" }, b: { id: "b", day: "2026-11-11", km: 8, min: 45, hr: 200, type: "Run" } };
  let r = null, err = null; try { r = hrZoneWeeks(acts, { maxHR: 186, restHR: 50, until: "2026-11-17" }); } catch (e) { err = e.message; }
  const wk = r?.rows.find((x) => x.key === "2026-11-09");
  ok(!err && wk && wk.easy === 50 && wk.hard === 45, `a run under resting HR counts as easy, one over max as hard – no crash (${err || JSON.stringify(wk)})`);
  const { longRunPlan, fmtPace } = await import("../src/sessions.js");
  const lr = longRunPlan({ km: 20, easyPaceMinKm: 5.55, phase: "Opbygning" });
  ok(/Ca\. 2:00/.test(lr) && !/:60/.test(lr), `long run time rounds to 2:00, not 1:60 (${lr.slice(0, 12)})`);
  ok(fmtPace(5.995) === "6:00" && fmtPace(6.25) === "6:15", `pace 5.995 → ${fmtPace(5.995)}`);
}
{ // a race 4 weeks away: the plan's last week is the race week
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-17T09:00:00", patch: { coachMode: false, startDate: "2026-11-16", raceDate: "2026-12-12", raceKm: 50 } });
  const chip = (await page.locator(".meta-chip").first().innerText()).replace(/\s+/g, " ");
  ok(/Uge 5 af 8/.test(chip), `the 8-week plan ends on the race, today is week 5 (${chip})`);
  await tab(page, 1);
  const allWeeks = page.getByText(/Vis alle \d+ uger/); if (await allWeeks.count()) { await allWeeks.first().click(); await page.waitForTimeout(250); }
  const plan = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok(/7\.–13\. dec\./.test(plan) && !/14\.–20\. dec\./.test(plan), "the last plan week is the race week (7.–13. dec.), nothing after it");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
{ // Plan guide: easy runs under 145 like I dag (max 186, rest 49 → reserve), not 130 (70 % of max)
  const { browser, page } = await openApp({ lang: "da", at: "2026-11-17T09:00:00" });
  await tab(page, 1);
  await page.getByText("Sådan gør du").first().click(); await page.waitForTimeout(250);
  const g = (await page.locator(".guide").first().innerText()).replace(/\s+/g, " ");
  ok(/Rolige ture.*puls under 145/.test(g) && !/puls under 130/.test(g), `Plan guide easy cap 145 (${(g.match(/Rolige ture[^.]*\./) || [""])[0]})`);
  await browser.close();
}
{ // the coach plan with a later start date from the questionnaire: the log has each week once
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-17T09:00:00", patch: { startDate: "2026-09-14" } });
  const dup = []; page.on("console", (m) => { if (/same key/i.test(m.text())) dup.push(m.text().slice(0, 80)); });
  await tab(page, 2); await page.locator(".segment button, [role=tab]").nth(1).click(); await page.waitForTimeout(400);
  const keys = await page.locator("table tbody tr").evaluateAll((rows) => rows.map((r) => r.querySelector("td,th")?.innerText.trim()).filter(Boolean));
  ok(dup.length === 0 && new Set(keys).size === keys.length, `no duplicate weeks in the log (${keys.length} rows, ${dup.length} key warnings)`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
