/* A Garmin "Activities" CSV next to Strava: indoor sessions with moving time 0 are kept, climb with a thousands comma,
   max heart rate, treadmill; a Strava copy without heart rate gets it from the file. Then the zone history on Overblik
   and the measured max heart rate on the Pulszoner card. Synthetic rows under Garmin's real header. node tests/garmin-zones.mjs */
import { openApp, check, mk } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(250));
const HEAD = 'Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Bike Cadence,Max Bike Cadence,Avg Speed,Max Speed,Total Ascent,Total Descent,Avg Stride Length,Avg Vertical Ratio,Avg Vertical Oscillation,Avg Ground Contact Time,Avg GAP,Avg Bike Cadence,Max Bike Cadence,Normalized Power® (NP®),Training Stress Score®,Max Avg Power (20 min),Avg Power,Max Power,Total Strokes,Steps,Total Reps,Total Sets,Body Battery Drain,Min Temp,Decompression,Best Lap Time,Number of Laps,Max Temp,Avg Resp,Min Resp,Max Resp,Stress Change,Stress Start,Stress End,Avg Stress,Max Stress,Moving Time,Elapsed Time,Min Elevation,Max Elevation';
const cols = HEAD.split(",");
// one row: values by column name, "--" elsewhere (Garmin's empty marker)
const row = (v) => cols.map((c) => (c in v ? v[c] : "--")).map((x, i) => (i < 3 ? x : `"${x}"`)).join(",");
const R = (type, date, title, km, time, hr, max, asc = "--", moving = time) => row({ "Activity Type": type, Date: date, Favorite: "false", Title: title, Distance: km, Time: time, "Avg HR": hr, "Max HR": max, "Total Ascent": asc, "Moving Time": moving, "Elapsed Time": time });
const runs = [];
for (let w = 0; w < 6; w++) for (const [dd, hr, max] of [[1, 128, 141], [3, 150, 170], [5, 135, 160]]) {
  const d = new Date(Date.UTC(2026, 8, 14 + 7 * w + dd)).toISOString().slice(0, 10);
  runs.push(R("Running", `${d} 18:10:00`, "Odense Running", "8.00", "00:52:00", String(hr), String(max), "40"));
}
const csv = [HEAD,
  R("Trail Running", "2026-10-24 09:54:07", "Faaborg-Midtfyn Trail Running", "25.01", "02:57:16", "166", "190", "726"),
  R("Treadmill Running", "2026-10-26 20:56:34", "Treadmill Running", "5.01", "00:34:03", "137", "199"),
  R("Indoor Cycling", "2026-10-20 21:06:57", "Base", "0.00", "01:01:32", "115", "140", "--", "00:00:00"),
  R("Other", "2026-10-11 09:05:04", "Adventure Race", "126.95", "10:00:53", "132", "170", "1,091"),
  ...runs].join("\n") + "\n";
// Strava already has the trail run, without heart rate
const strava = { "s-trail": { ...mk("2026-10-24", 25.0, 175, "TrailRun", null), id: "s-trail", date: "2026-10-24T07:54:30.000Z", vert: 700 } };
{
  const { browser, page, errors } = await openApp({ lang: "da", width: 390, at: "2026-10-28T09:00:00", extraActs: strava });
  await tab(page, 4);
  await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  await page.locator("#files input[type=file]").setInputFiles({ name: "Activities.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForTimeout(900);
  const msg = (await page.locator("#files .advice").first().innerText()).replace(/\n/g, " ");
  ok(/Læste 22 aktiviteter/.test(msg) && /21 nye/.test(msg) && /1 pas fik puls eller stigning fra filen/.test(msg), `import message: ${msg.slice(0, 160)}`);
  const A = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("ultraplan-activities"))));
  const trail = A.find((a) => a.id === "s-trail");
  ok(trail && trail.hr === 166 && trail.maxHr === 190 && trail.vert === 700 && A.filter((a) => a.day === "2026-10-24" && /trail/i.test(a.type)).length === 1, `Strava trail run got HR 166/190, kept its climb, no duplicate (${JSON.stringify(trail && { hr: trail.hr, maxHr: trail.maxHr, vert: trail.vert })})`);
  const bike = A.find((a) => a.type === "Indoor Cycling");
  ok(bike && bike.min === 62 && bike.hr === 115, `indoor cycling with moving time 0 kept by its session time (${bike && bike.min} min)`);
  ok(A.find((a) => a.name === "Adventure Race")?.vert === 1091, "climb 1,091 read as 1091 m, not 1.091");
  const tm = A.find((a) => a.type === "Treadmill Running");
  ok(tm && tm.treadmill === true && !tm.vert, "treadmill run flagged, no climb");
  ok(A.filter((a) => a.name === "Odense Running").every((a) => a.vert === 40 && a.maxHr > a.hr), "runs carry climb and max heart rate");
  // Pulszoner card: the lone 199 is a spike; 190 is above the 186 in use → offer
  const card = page.locator("details.acc", { has: page.locator("summary h2", { hasText: "Pulszoner" }) });
  await card.locator("summary").click(); await page.waitForTimeout(150);
  // Karvonen with resting 49 and max 186, as Garmin/Strava "% of HRR": 131 / 145 / 159 / 172
  const zt = (await card.locator("table").innerText()).replace(/\s+/g, " ");
  ok(/Z2 aerob 131–145/.test(zt) && /Z3 tempo 145–159/.test(zt) && /Z4 tærskel 159–172/.test(zt) && /Z5 VO2 172–186/.test(zt), `zone table by heart-rate reserve: ${zt.slice(0, 160)}`);
  ok(/Zonerne er pulsreserve \(Karvonen\)/.test(await card.innerText()) && /\(137 slag\)/.test(await card.innerText()), "card explains the model and the 137-beat reserve");
  const pk = (await card.locator(".hr-peak").innerText()).replace(/\n/g, " ");
  ok(/Højeste puls målt på et løb det seneste år: 190 \(24\. okt\.?\)\./.test(pk) && /En enlig top på 199 er sprunget over som fejlmåling\./.test(pk) && /zoner er sat for lavt/.test(pk), `peak line: ${pk}`);
  await card.getByRole("button", { name: "Brug 190 som makspuls" }).click(); await page.waitForTimeout(200);
  const mx = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-profile")).maxHR);
  ok(mx === 190, `max heart rate set to 190 (${mx})`);
  ok(await card.getByRole("button", { name: /Brug \d+ som makspuls/ }).count() === 0, "offer gone once used");
  ok(/maks 190/.test(await card.locator("summary").textContent()), "zones card now uses 190");
  // Overblik: zones per week
  await tab(page, 2);
  const z = page.locator("#chart-zones");
  ok(await z.count() === 1, "zone panel on Overblik");
  const sum = (await z.locator(".zone-sum").innerText()).replace(/\n/g, " ");
  ok(/^Sidste 4 uger: \d+ % roligt, \d+ % Z3, \d+ % Z4–Z5\./.test(sum), `summary: ${sum}`);
  const legend = await z.locator(".legend").innerText();
  ok(/Rolig · Z1–Z2/.test(legend) && /Z3/.test(legend) && /Z4–Z5/.test(legend), "legend names the three zones");
  ok(await z.locator("rect.zone-easy").count() > 0 && await z.locator("rect.zone-hard").count() > 0, "stacked segments drawn");
  const title = await z.locator("g.zbar title").nth(11).textContent();
  ok(/Rolig · Z1–Z2 \d+ min · Z3 \d+ min · Z4–Z5 \d+ min/.test(title), `hover title: ${title}`);
  await z.locator(".zone-table summary").click(); await page.waitForTimeout(100);
  ok(await z.locator(".zone-table tbody tr").count() >= 6, "table view lists the weeks");
  const foot = await z.locator("p.muted").innerText();
  ok(/pulsreserve \(Karvonen\) med hvilepuls 49 og makspuls 190: rolig under 148, Z3 148–162, Z4–Z5 fra 162\./.test(foot), `footnote names Karvonen and the bands: ${foot.slice(0, 200)}`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `no horizontal scroll at 390 px (${over})`);
  await z.screenshot({ path: process.env.SHOT || "/tmp/claude-0/-home-user-Ultra/a738c4a7-b731-54dc-b1ff-3ce9899054c5/scratchpad/zones.png" });
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
// Without a resting heart rate the zones fall back to % of max, and the card says how to switch
{
  const { browser, page } = await openApp({ lang: "da", width: 390, at: "2026-10-28T09:00:00", patch: { restHR: "" } });
  await tab(page, 4);
  const card = page.locator("details.acc", { has: page.locator("summary h2", { hasText: "Pulszoner" }) });
  await card.locator("summary").click(); await page.waitForTimeout(150);
  const zt = (await card.locator("table").innerText()).replace(/\s+/g, " ");
  ok(/Z2 aerob 112–130/.test(zt) && /Skriv din hvilepuls ind under Dig/.test(await card.innerText()), `no resting HR: % of max (${zt.slice(0, 60)})`);
  await tab(page, 0);
  ok(!/puls under 145/.test(await page.locator("main").innerText()), "today's guidance follows the model");
  await browser.close();
}
// The engine's numbers: describeEasy / describeSession / hrAt agree
{
  const { hrAt, hrShare } = await import("../src/hr.js");
  const { describeEasy, describeSession } = await import("../src/sessions.js");
  const hp = { maxHR: 186, restHR: 49 };
  ok([0.6, 0.7, 0.8, 0.9].map((f) => hrAt(f, hp)).join("/") === "131/145/159/172" && hrAt(0.7, { maxHR: 186 }) === 130 && Math.abs(hrShare(145, hp) - 0.7) < 0.01, "hrAt: Karvonen with resting HR, % of max without");
  ok(/puls under 145/.test(describeEasy({ km: 6, ...hp })) && /\(159–172\)/.test(describeSession("6×2 min tærskel", hp).text), "easy cap 145, threshold 159–172");
}
// English, and no panel without heart-rate data
{
  const { browser, page } = await openApp({ lang: "en", width: 390, at: "2026-10-28T09:00:00" });
  await tab(page, 2);
  const h = await page.locator("#chart-zones h2").allTextContents();
  ok(h.length === 0 || h[0] === "Heart-rate zones per week", `English title or no panel (${h.join()})`);
  const top = (await page.locator(".topbar-race").textContent()) || "";
  ok(/\d+\s*days/.test(top) && !/dage/.test(top), `English countdown says days (${top.trim()})`);
  await browser.close();
}
done();
