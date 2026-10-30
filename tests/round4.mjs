/* Round 4: event prep card, missed-day note, long-run fuel line, strength RPE chips, CSV export, and the date tick in an
   app left open. node tests/round4.mjs */
import { openApp, mk, check } from "./seed.mjs";
import { readFileSync } from "node:fs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(200));
// 1. event prep: 3 days before, the day before, and 4 days before (nothing)
for (const [at, want] of [["2026-10-21T09:00:00", /★ Eventyrsport BakkeTrail om 3 dage Lørdag kl\. 10:00 · 25 km/], ["2026-10-23T09:00:00", /★ Eventyrsport BakkeTrail i morgen Lørdag kl\. 10:00 · 25 km/], ["2026-10-20T09:00:00", null]]) {
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at });
  const card = page.locator(".advice.event-prep");
  if (want) {
    const txt = (await card.innerText()).replace(/\n/g, " ");
    ok(want.test(txt), `${at.slice(0, 10)}: ${txt.slice(0, 90)}`);
    ok(/Ca\. 3:\d\d undervejs: 75 g kulhydrat i timen, ca\. \d+ geler i alt, 1,\d l at drikke\./.test(txt), `fuel line: ${txt.match(/Ca\.[^.]*\./)?.[0]}`);
    ok(at.startsWith("2026-10-23") ? /Pak tasken i aften/.test(txt) : /Tjek vejr, sko og mad/.test(txt), "the right reminder for the day");
    ok(await page.locator(".meta-chip.event").count() === 0, "no countdown chip while the prep card shows");
  } else ok(await card.count() === 0, `${at.slice(0, 10)}: no event card 4 days out`);
  ok(errors.length === 0, "no errors");
  await browser.close();
}
// 2. missed day: Friday after a Thursday with 5 km planned and nothing run; then with a strength session instead
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-09T09:00:00" });
  const m = await page.locator(".advice.missed").innerText();
  ok(/^I går: 5 km planlagt, ikke løbet\. Lad den ligge/.test(m), `missed: ${m}`);
  await browser.close();
  const lift = { ...mk("2026-10-08", 0, 51, "WeightTraining", 110), id: "2026-10-08-WeightTraining", kind: "strength" };
  const b = await openApp({ lang: "da", width: 390, at: "2026-10-09T09:00:00", extraActs: { [lift.id]: lift } });
  const m2 = await b.page.locator(".advice.missed").innerText();
  ok(/I går: 5 km planlagt, du lavede styrke 51 min i stedet\. Lad turen ligge\./.test(m2), `missed with strength: ${m2}`);
  await b.browser.close();
  const c = await openApp({ lang: "da", width: 390, at: "2026-10-08T09:00:00" }); // Wednesday was run: no note
  ok(await c.page.locator(".advice.missed").count() === 0, "no note when yesterday was run");
  await c.browser.close();
}
// 3. long-run fuel line on the card (Saturday 14 km) and under the Plan guide
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-10T07:00:00" });
  const f = await page.locator(".today-sub.fuel").innerText();
  ok(/^Ca\. 1:\d\d · ~\d0 g kulhydrat ≈ \d geler · \d,\d l at drikke · sigt efter ~350 m\+$/.test(f), `long-run line: ${f}`);
  await tab(page, 1); await page.getByRole("button", { name: /Sådan gør du/ }).click(); await page.waitForTimeout(150);
  ok(await page.locator(".guide p.fuel").count() === 1, "fuel line in the Plan guide");
  await browser.close();
}
// 4. strength RPE chips
{
  const lift = { ...mk("2026-10-08", 0, 51, "WeightTraining", 110), id: "2026-10-08-WeightTraining", kind: "strength" };
  const { browser, page } = await openApp({ lang: "da", width: 390, todayRun: true, extraActs: { [lift.id]: lift } });
  const groups = page.locator(".quick-rpe");
  ok(await groups.count() === 2 && /Hvor hård var styrken\?/.test(await groups.nth(1).innerText()), "run chips and strength chips");
  await groups.nth(1).locator("button", { hasText: "8" }).click(); await page.waitForTimeout(150);
  ok(/Styrken føltes som RPE 8/.test(await groups.nth(1).innerText()), "strength RPE set");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-activities"))["2026-10-08-WeightTraining"].rpe);
  ok(stored === 8, `stored on the activity (${stored})`);
  const runRpe = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-activities"))["2026-10-08-Run"].rpe);
  ok(!runRpe, "the run's RPE is untouched");
  await browser.close();
}
// 5. CSV export
{
  const { browser, page } = await openApp({ lang: "da", width: 390 });
  await tab(page, 4);
  await page.locator("details.acc", { has: page.locator("h2", { hasText: /^Eksportér$/ }) }).locator("> summary").click();
  let dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Loggen (CSV)" }).click();
  const logCsv = readFileSync(await (await dl).path(), "utf8");
  ok(logCsv.startsWith("﻿uge_start;km;rpe;hvilepuls") && /\r\n2026-08-24;28;5;50;7\.2;89;/.test(logCsv), `log csv: ${logCsv.split("\r\n")[1]}`);
  dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Ture og pas (CSV)" }).click();
  const actCsv = readFileSync(await (await dl).path(), "utf8");
  ok(/^﻿dato;type;navn;km;min;puls;rpe/.test(actCsv) && /2026-09-01;Run;Run;8;50;132/.test(actCsv), `acts csv: ${actCsv.split("\r\n")[1]}`);
  await browser.close();
}
// 6. the date advances in an app left open
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-08T21:59:00" }); // 23:59 in Copenhagen (the clock is set in UTC)
  ok(/^Torsdag 8\. oktober/.test(await page.locator(".today-date").innerText()), "Thursday before midnight");
  await page.evaluate(() => { const D = globalThis.Date; globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + 120000])); } static now() { return D.now() + 120000; } }; window.dispatchEvent(new Event("focus")); });
  await page.waitForTimeout(300);
  ok(/^Fredag 9\. oktober/.test(await page.locator(".today-date").innerText()), `after midnight and a return: ${await page.locator(".today-date").innerText()}`);
  await browser.close();
}
// 7. Overblik forecast tile and contextual coach questions
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-22T09:00:00" });
  await tab(page, 2);
  const tile = page.locator(".tile", { hasText: /Prognose/ });
  const tt = (await tile.innerText()).replace(/\n/g, " ");
  ok(/Prognose \d{1,2}:\d\d ud fra dit rolige tempo/.test(tt), `forecast tile: ${tt}`);
  await tile.click(); await page.waitForTimeout(500);
  ok(await page.locator("#raceday[open]").count() === 1, "tapping the forecast opens Løbsdag");
  await tab(page, 3);
  const chips = await page.locator(".ask-chips button").allInnerTexts();
  ok(chips.length === 4 && chips[0] === "Hvordan skal jeg gribe Eventyrsport BakkeTrail an?" && chips[1] === "Jeg sprang gårsdagens tur over – hvad nu?", `chips: ${chips.join(" | ")}`);
  await browser.close();
  // the MEASURED normal (earlier log weeks at 44) makes this week's 50 high – the profile value alone no longer does
  const b = await openApp({ lang: "da", width: 390, logPatch: { "2026-09-07": { km: 21.1, hr: 44 }, "2026-09-14": { km: 15, hr: 44 }, "2026-09-21": { km: 33, hr: 44 }, "2026-09-28": { km: 20, hr: 44, xmin: 663 } } });
  await tab(b.page, 3);
  const c2 = await b.page.locator(".ask-chips button").allInnerTexts();
  ok(c2[0] === "Min hvilepuls er høj – skal jeg løbe i dag?" && c2.length === 4, `chips with a high resting HR: ${c2.join(" | ")}`);
  await b.browser.close();
}
// English
{
  const { browser, page, errors } = await openApp({ lang: "en", width: 360, at: "2026-10-22T09:00:00" });
  const txt = (await page.locator(".advice.event-prep").innerText()).replace(/\n/g, " ");
  ok(/★ Eventyrsport BakkeTrail in 2 days Saturday at 10:00 · 25 km/.test(txt) && /About 3:\d\d out there/.test(txt), `en: ${txt.slice(0, 80)}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "360: no sideways scroll");
  ok(errors.length === 0, "en no errors");
  await browser.close();
}
done();
