/* Phones whose picker will not hand a CSV over: the pasted-text import; and the "new version" banner for a PWA that
   stays open. node tests/upload-fallback.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(200));
const days = []; for (let i = 27; i >= 0; i--) { const d = new Date(Date.UTC(2026, 9, 8) - i * 86400000).toISOString().slice(0, 10); days.push([`${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`, 46 + ((i * 7) % 5)]); }
const csv = ",Resting Heart Rate\n" + days.map(([d, hr]) => `${d},${hr}`).join("\n") + "\n";
{
  const { browser, page, errors } = await openApp({ lang: "da", width: 390 });
  await tab(page, 4);
  await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  ok(await page.locator("#files input[type=file]").getAttribute("accept") === null, "no accept filter on the file input (Android then offers Files, not only Photos)");
  await page.locator(".paste > summary").click(); await page.waitForTimeout(100);
  await page.locator(".paste textarea").fill(csv);
  await page.getByRole("button", { name: "Importér teksten" }).click(); await page.waitForTimeout(800);
  const msg = await page.locator("#files .advice").first().innerText();
  ok(/Hvilepuls for 5 uger lagt i loggen\. 28 dage på Overblik\./.test(msg), `pasted text imported: ${msg.slice(0, 100)}`);
  ok((await page.locator(".paste textarea").inputValue()) === "", "textarea cleared");
  const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("ultraplan-profile")).wellness || {}).length);
  ok(n === 28, `28 days stored (${n})`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
// a pasted TCX (Garmin's export, with heart rate) is recognised and lands on its day
{
  const { browser, page } = await openApp({ lang: "da", width: 390 });
  const pt = (sec, m, hr) => `<Trackpoint><Time>2026-10-09T18:00:${String(sec).padStart(2, "0")}Z</Time><DistanceMeters>${m}</DistanceMeters><HeartRateBpm><Value>${hr}</Value></HeartRateBpm></Trackpoint>`;
  const tcx = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-10-09T18:00:00Z</Id><Lap StartTime="2026-10-09T18:00:00Z"><TotalTimeSeconds>1974</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters><AverageHeartRateBpm><Value>124</Value></AverageHeartRateBpm><Track>${pt(0, 0, 110)}${pt(30, 2500, 124)}${pt(59, 5000, 130)}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
  await tab(page, 4);
  await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  await page.locator(".paste > summary").click(); await page.waitForTimeout(100);
  await page.locator(".paste textarea").fill(tcx);
  await page.getByRole("button", { name: "Importér teksten" }).click(); await page.waitForTimeout(800);
  const msg = await page.locator("#files .advice").first().innerText();
  ok(/Læste 1 aktiviteter \(1 løb\), 1 nye/.test(msg), `pasted TCX: ${msg.slice(0, 100)}`);
  const a = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("ultraplan-activities"))).find((x) => x.day === "2026-10-09"));
  ok(a && Math.abs(a.km - 5) < 0.01 && a.hr >= 120 && a.hr <= 130, `run on 9 Oct with heart rate (${a && a.km} km, HR ${a && a.hr})`);
  await browser.close();
}
// the update banner: the server's index.html names another bundle
{
  const { browser, page } = await openApp({ lang: "da", width: 390 });
  ok(await page.locator(".advice.update").count() === 0, "no banner while the bundle matches");
  await page.route("**/index.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><script type="module" src="/assets/index-NEWHASH.js"></script>' }));
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(500);
  const b = page.locator(".advice.update");
  ok(await b.count() === 1 && /Ny udgave klar\. Genindlæs for at få den\./.test((await b.innerText()).replace(/\n/g, " ")) && await b.getByRole("button", { name: "Opdater" }).count() === 1, "banner with an Opdater button");
  await browser.close();
}
done();
