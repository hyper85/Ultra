/* The week card's line follows the week: the hard session ahead, done (✓, then "Næste: lang tur"), or missed; and the
   resting-HR warning is judged against the MEASURED normal (Garmin days, else the log), not the profile value that also
   sets the zones. Coach plan week 10 (26 Oct): tempo Wed 9 km, long run Sat 26 km. node tests/week-line.mjs */
import { openApp, check, mk } from "./seed.mjs";
const { ok, done } = check();
const line = async (page) => (await page.locator(".advice").allInnerTexts()).map((x) => x.replace(/\n/g, " ")).find((x) => /lang tur|long run|Hård session|Hard session|Kun roligt/.test(x)) || "";
const run = (day, km, min, hr = 135) => ({ [`${day}-Run`]: mk(day, km, min, "Run", hr) });
const cases = [
  ["Tue, nothing yet", "2026-10-27T09:00:00", {}, /^Hård session ons: .*tempo.* · lang tur 26 km lør\.$/],
  ["Fri, tempo done", "2026-10-30T09:00:00", { ...run("2026-10-28", 9, 50, 157), ...run("2026-10-29", 8, 50, 129) }, /^✓ Hård session ons er løbet · Næste: lang tur 26 km lør\.$/],
  ["Fri, tempo missed", "2026-10-30T09:00:00", run("2026-10-29", 8, 50), /^Hård session ons blev ikke løbet – lad den ligge · Næste: lang tur 26 km lør\.$/],
  ["Sun, all done", "2026-11-01T09:00:00", { ...run("2026-10-28", 9, 50, 157), ...run("2026-10-31", 26, 170) }, /^✓ Hård session ons er løbet · ✓ lang tur 26 km lør · Resten af ugen roligt\.$/],
  ["Fri, a short jog on Wed is not the session", "2026-10-30T09:00:00", run("2026-10-28", 3, 20), /^Hård session ons blev ikke løbet/],
];
for (const [label, at, extraActs, re] of cases) {
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at, extraActs });
  const l = await line(page);
  ok(re.test(l) && errors.length === 0, `${label}: ${l}`);
  await browser.close();
}
{ // English
  const { browser, page } = await openApp({ lang: "en", width: 390, at: "2026-10-30T09:00:00", extraActs: run("2026-10-28", 9, 50, 157) });
  const l = await line(page);
  ok(/^✓ Hard session Wed done · Next: long run 26 km Sat\.$/.test(l), `English: ${l}`);
  await browser.close();
}
// resting HR: Garmin's measured normal 52–53 → this week's 53 is normal, no warning (the profile says 49)
const days = (from, n, f) => Object.fromEntries(Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 8, 28) + (from + i) * 86400000).toISOString().slice(0, 10); return [d, { hr: f(i) }]; }));
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-30T09:00:00", patch: { restHR: 49, wellness: days(0, 32, (i) => 52 + (i % 2)) }, logPatch: { "2026-10-26": { hr: 53, hrAuto: true } } });
  const txt = (await page.locator("main").innerText()).replace(/\n/g, " ");
  ok(!/over din normal/.test(txt), "Garmin normal 52–53: a week at 53 gives no warning (the profile's 49 is not the normal)");
  await browser.close();
}
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-30T09:00:00", patch: { restHR: 49, wellness: days(0, 32, (i) => 48 + (i % 3)) }, logPatch: { "2026-10-26": { hr: 53, hrAuto: true } } });
  const txt = (await page.locator("main").innerText()).replace(/\n/g, " ");
  ok(/Hvilepuls 53 er 4 over din normal \(49\): hold igen og sov mere\./.test(txt), "Garmin normal 49: 53 warns and names the normal");
  await browser.close();
}
{ // no Garmin days: the weekly log (48–50 in the seed) is the normal
  const { insights } = { insights: await import("../src/insights.js") };
  const b1 = insights.restingBaseline({ wellness: {}, log: { "2026-09-28": { hr: 50 }, "2026-10-05": { hr: 50 }, "2026-10-12": { hr: 54 }, "2026-10-19": { hr: 53 } }, profileRest: 49, beforeKey: "2026-10-26" });
  const b2 = insights.restingBaseline({ wellness: {}, log: {}, profileRest: 49, beforeKey: "2026-10-26" });
  ok(b1.source === "log" && b1.normal === 52 && b2.source === "profile" && b2.normal === 49, `baseline: log ${b1.normal}, then profile ${b2.normal}`);
}
// desktop: two independent columns – no gap under a short rest-day card; phone: today, week, food in that order
for (const [width, at] of [[1930, "2026-10-30T09:00:00"], [1280, "2026-10-28T09:00:00"], [390, "2026-10-30T09:00:00"]]) {
  const { browser, page } = await openApp({ lang: "da", width, height: 1000, at });
  const r = await page.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); const a = b("main .panel.today"), w = b("main .week-panel"), k = b("main .panel.kost"); return { a: [a.left, a.top, a.bottom], w: [w.left, w.top, w.bottom], k: [k.left, k.top] }; });
  if (width > 1000) ok(r.k[0] === r.a[0] && r.k[1] - r.a[2] <= 20 && r.w[0] > r.a[0] && Math.abs(r.w[1] - r.a[1]) < 2, `${width}px: food right under today (${Math.round(r.k[1] - r.a[2])} px), the week beside it`);
  else ok(r.w[1] > r.a[2] && r.k[1] > r.w[2] && r.k[1] - r.w[2] <= 16, `${width}px: today, week, food in order (${Math.round(r.k[1] - r.w[2])} px)`);
  if (width === 1930) await page.screenshot({ path: process.env.SHOT || "/tmp/claude-0/-home-user-Ultra/a738c4a7-b731-54dc-b1ff-3ce9899054c5/scratchpad/today-desktop.png" });
  await browser.close();
}
done();
