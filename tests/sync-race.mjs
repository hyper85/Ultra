/* Strava and Garmin sync on app start at the same time. Whichever answers last must not write an older copy of the
   weekly log: the new run's km (Strava) and the sleep/HRV week values (Garmin) both survive, in either order.
   Needs the auth build on 4175 (see tests/garmin-connect.mjs). node tests/sync-race.mjs */
import { chromium, base, log, acts, check } from "./seed.mjs";
const { ok, done } = check();
const URL0 = process.env.ULTRA_AUTH_URL || "http://localhost:4175/";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
const days = { "2026-10-26": { hr: 50, sleep: 6.5, hrv: 55 }, "2026-10-27": { hr: 51, sleep: 7, hrv: 56 } };
const run = { stravaId: 99, startLocal: "2026-10-27T18:00:00Z", km: 9.4, min: 60, hr: 135, maxHr: 150, type: "Run", name: "Aftentur", vert: 20, treadmill: false };
for (const [label, stravaDelay, garminDelay] of [["Strava last", 600, 100], ["Garmin last", 100, 600]]) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
  await ctx.addInitScript(({ base, log, acts, session }) => {
    localStorage.setItem("ultraplan-profile", JSON.stringify({ ...base, garminV: 3 })); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", "da");
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
  }, { base, log, acts, session });
  await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
  await ctx.route("**/sb/rest/v1/**", (r) => r.fulfill({ status: r.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: "[]" }));
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  await ctx.route("**/api/strava", async (r) => { const b = JSON.parse(r.request().postData() || "{}");
    if (b.op === "status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: true, athlete: "Runner", lastSync: null }) });
    await wait(stravaDelay); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activities: [run], lastSync: "2026-10-28T08:00:00Z", athlete: "Runner" }) }); });
  await ctx.route("**/api/garmin", async (r) => { const b = JSON.parse(r.request().postData() || "{}");
    if (b.op === "status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: true, lastSync: null }) });
    await wait(garminDelay); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ days, found: { hr: 2, sleep: 2, hrv: 2 }, lastSync: "2026-10-28T08:00:00Z" }) }); });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL0, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({ log: JSON.parse(localStorage.getItem("ultraplan-log")), acts: JSON.parse(localStorage.getItem("ultraplan-activities")) }));
  const wk = st.log["2026-10-26"] || {};
  ok(Object.values(st.acts).some((a) => a.name === "Aftentur"), `${label}: the Strava run is stored`);
  ok(wk.km >= 9.4 && wk.auto, `${label}: the week's km has the run (${wk.km})`);
  ok(wk.sleepAuto && wk.hrvAuto && wk.hrAuto, `${label}: Garmin's week values kept (${JSON.stringify(wk)})`);
  ok(errors.length === 0, `${label}: no errors ${errors.join(";")}`);
  await browser.close();
}
done();
