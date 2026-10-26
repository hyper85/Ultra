/* Weekly scan 1: easy pace without heart rate, walking named on the plan tile, a quiet rest-day button with tomorrow's
   session. node tests/weekly1.mjs */
import { openApp, mk, check } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(250));
// runs without heart rate still give an estimated easy pace
{
  const noHr = Object.fromEntries([["2026-09-01", 8, 50], ["2026-09-03", 10, 61], ["2026-09-08", 7, 44], ["2026-09-15", 8, 49], ["2026-09-22", 9, 54], ["2026-09-24", 6, 37], ["2026-09-28", 8, 52], ["2026-09-30", 6, 38]].map(([d, km, min]) => [`${d}-Run`, { ...mk(d, km, min, "Run"), hr: null }]));
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at: "2026-10-26T07:00:00", extraActs: noHr });
  await tab(page, 2);
  const tile = (await page.locator(".tile", { hasText: /Prognose/ }).innerText()).replace(/\n/g, " ");
  ok(/Prognose \d{1,2}:\d\d/.test(tile) && /ud fra dit (rolige tempo|tempo \(uden puls\))/.test(tile), `forecast tile: ${tile}`);
  ok(errors.length === 0, "no errors");
  await browser.close();
}
// the march named on the plan tile when walks count as km
{
  const march = { ...mk("2026-10-03", 51, 663, "Walk", 95), id: "2026-10-03-Walk", kind: "hike" };
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-26T07:00:00", patch: { includeHikes: true }, extraActs: { [march.id]: march } });
  await tab(page, 2);
  const tile = (await page.locator(".tile", { hasText: /Planen indtil nu/ }).innerText()).replace(/\n/g, " ");
  ok(/heraf 51 km gang/.test(tile), `plan tile names the walk: ${tile}`);
  await browser.close();
  const b = await openApp({ lang: "da", width: 390, at: "2026-10-26T07:00:00", extraActs: { [march.id]: march } });
  await tab(b.page, 2);
  const t2 = (await b.page.locator(".tile", { hasText: /Planen indtil nu/ }).innerText()).replace(/\n/g, " ");
  ok(!/gang/.test(t2), "nothing about walking when walks do not count as km");
  await b.browser.close();
}
// rest day: quiet button and tomorrow's session
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-26T07:00:00" });
  const btn = page.locator(".today .btn.big");
  ok(/ghost/.test(await btn.getAttribute("class")) && (await btn.innerText()) === "Log et pas", "rest day: quiet button");
  const sub = (await page.locator(".today").innerText()).replace(/\n/g, " ");
  ok(/I morgen: Styrke B · Ryg og core/.test(sub), `tomorrow line: ${sub.match(/I morgen:[^|]*/)?.[0]}`);
  await browser.close();
  const b = await openApp({ lang: "da", width: 390, at: "2026-10-30T07:00:00" }); // Friday rest → Saturday long run
  const s2 = (await b.page.locator(".today").innerText()).replace(/\n/g, " ");
  ok(/I morgen: Lang tur 26 km/.test(s2), `Friday: ${s2.match(/I morgen:[^|]*/)?.[0]}`);
  await b.browser.close();
  const c = await openApp({ lang: "da", width: 390, at: "2026-10-08T09:00:00", todayRun: true }); // a run day keeps the orange button
  ok(!/ghost/.test(await c.page.locator(".today .btn.big").getAttribute("class")), "run day: orange button");
  await c.browser.close();
}
done();
