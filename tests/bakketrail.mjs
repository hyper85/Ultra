/* BakkeTrail is Saturday 24 October 10:00 (the organiser's programme), not Sunday: countdown, week 9 strip, race week
   card and the calendar file must all say so. node tests/bakketrail.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const { browser, page, errors } = await openApp({ lang: "da", width: 390 });
const chips = (await page.locator(".today-head .meta-chip").allInnerTexts()).join(" | ");
ok(/BakkeTrail om 16 dage/.test(chips), `countdown on 8 Oct: ${chips}`);
await page.locator("nav.tabbar button").nth(1).click(); await page.waitForTimeout(200);
await page.locator(".wkcard").nth(2).locator(".wkhead").click(); await page.waitForTimeout(200);
const card = (await page.locator(".wkcard").nth(2).innerText()).replace(/\n/g, " ");
ok(/★ Eventyrsport BakkeTrail lør/.test(card) && !/BakkeTrail søn/.test(card), `week 9 summary: ${card.slice(0, 120)}`);
ok(/Fre\s+–\s+hvile/.test(card) && /Lør\s+–\s+★ Eventyrsport BakkeTrail/.test(card) && /Søn\s+–\s+plan 5/.test(card), "rest Friday, race Saturday, 5 km easy Sunday");
ok(/start 10:00/.test(card), "start time on the event line");
// the calendar file
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: /kalender/ }).click();
const path = await (await dl).path(); const ics = (await import("node:fs")).readFileSync(path, "utf8");
const ev = ics.split("BEGIN:VEVENT").find((v) => /BakkeTrail/.test(v)) || "";
ok(/DTSTART;VALUE=DATE:20261024/.test(ev) && /start 10:00/.test(ev), `ics event on 24 Oct with the start: ${(ev.match(/SUMMARY:[^\r]*/) || [""])[0]}`);
const sun = ics.split("BEGIN:VEVENT").find((v) => /DTSTART;VALUE=DATE:20261025/.test(v)) || "";
ok(/SUMMARY:Rolig tur 5 km/.test(sun) && !/SUMMARY:[^\r]*BakkeTrail/.test(sun), `25 Oct is the 5 km easy run, not the race: ${(sun.match(/SUMMARY:[^\r]*/) || [""])[0]}`);
ok(errors.length === 0, `no errors ${errors.join(";")}`);
await browser.close(); done();
