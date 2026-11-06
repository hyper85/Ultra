/* A Garmin sync only brings the days since the last one (from two days before it). The week's resting HR and sleep
   must still be the average of the whole week (stored days + new ones), not of the last 2–3 days, and the I dag week
   card shows today's own value under the field when it differs ("i dag 51"). Auth build on :4175 (see garmin-connect).
   node tests/garmin-week-avg.mjs */
import { chromium, base, log, acts, check } from "./seed.mjs";
const { ok, done } = check();
const URL0 = process.env.ULTRA_AUTH_URL || "http://localhost:4175/";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
const clock = ({ T }) => { const RD = Date; const off = T - RD.now(); globalThis.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [RD.now() + off])); } static now() { return RD.now() + off; } }; };
// stored from earlier syncs: Mon–Wed of the week of 2 Nov; the new sync brings Wed–Fri
const stored = { "2026-11-02": { hr: 60, sleep: 8 }, "2026-11-03": { hr: 58, sleep: 7 }, "2026-11-04": { hr: 56, sleep: 6 }, "2026-10-30": { hr: 49, sleep: 7 } };
const fresh = { "2026-11-04": { hr: 56, sleep: 6 }, "2026-11-05": { hr: 52, sleep: 6 }, "2026-11-06": { hr: 50, sleep: 5.5 } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
await ctx.addInitScript(clock, { T: new Date("2026-11-06T15:50:00").getTime() });
await ctx.addInitScript(({ base, log, acts, session }) => {
  localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", "da");
  localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
}, { base: { ...base, garminV: 99, wellness: stored }, log: { ...log, "2026-11-02": { hr: 53, hrAuto: true, sleep: 5.8, sleepAuto: true } }, acts, session });
const calls = [];
await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
await ctx.route("**/sb/rest/v1/**", (r) => r.fulfill({ status: r.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: "[]" }));
await ctx.route("**/api/strava", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: false }) }));
await ctx.route("**/api/garmin", async (r) => {
  const b = JSON.parse(r.request().postData() || "{}"); calls.push(b);
  if (b.op === "status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: true, lastSync: "2026-11-06T06:00:00Z" }) });
  if (b.op === "sync") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ days: fresh, found: { hr: 3, sleep: 3 }, range: { start: "2026-11-04", end: "2026-11-06" }, full: false, lastSync: "2026-11-06T14:50:00Z" }) });
  return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});
const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL0, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
ok(calls.some((c) => c.op === "sync" && !c.full), "a silent, incremental sync on load");
const l = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log"))["2026-11-02"]);
// whole week: (60 + 58 + 56 + 52 + 50) / 5 = 55.2 → 55; the three synced days alone would give 53
ok(l.hr === 55 && l.hrAuto === true, `week resting HR is the whole week's average (${l.hr}, not 53)`);
ok(l.sleep === 6.5, `week sleep is the whole week's average (${l.sleep})`);
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-profile")));
ok(prof.wellness["2026-11-02"].hr === 60 && prof.wellness["2026-11-06"].hr === 50 && prof.wellness["2026-10-30"].hr === 49, "the day store keeps every day");
const lastWeek = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log"))["2026-10-26"]);
ok(!lastWeek || lastWeek.hr === log["2026-10-26"]?.hr, "a week the sync did not touch is left alone");
const card = page.locator(".week-panel .weekfields");
const txt = (await card.innerText()).replace(/\s+/g, " ");
ok(/i dag 50/.test(txt) && /i dag 5\.5/.test(txt), `today's values under the week's fields (${txt})`);
ok(await card.locator('input[title="Ugens snit fra dit ur"]').count() === 2, "the fields say they are the week's average");
ok(errors.length === 0, `no errors ${errors.join(";")}`);
await browser.close();
done();
