/* A server that answers 200 with an HTML page instead of JSON (a captive portal on hotel wifi, a proxy, a platform
   error page) must never crash the app: the Strava/Garmin status read null.connected inside a React state update and
   the whole app showed "Noget gik galt". Now such an answer is an error with a plain message; the AI coach says it did
   not answer as expected, and account deletion neither signs out nor wipes the device unless the server says ok.
   Auth build on :4175 (see garmin-connect). node tests/bad-server.mjs */
import { chromium, base, log, acts, check } from "./seed.mjs";
const { ok, done } = check();
const URL0 = process.env.ULTRA_AUTH_URL || "http://localhost:4175/";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
await ctx.addInitScript(({ base, log, acts, session }) => {
  if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
  localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", "da");
  localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
  window.__rej = []; window.addEventListener("unhandledrejection", (e) => window.__rej.push(String(e.reason?.message || e.reason)));
}, { base, log, acts, session });
await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
await ctx.route("**/sb/auth/v1/logout**", (r) => r.fulfill({ status: 204, body: "" }));
await ctx.route("**/sb/rest/v1/**", (r) => r.fulfill({ status: r.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: "[]" }));
const calls = {};
await ctx.route("**/api/**", (r) => { const k = new URL(r.request().url()).pathname; calls[k] = (calls[k] || 0) + 1; return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body>Log ind på netværket</body></html>" }); });
const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL0, { waitUntil: "load" }); await page.waitForTimeout(2500);
ok(calls["/api/strava"] > 0 && calls["/api/garmin"] > 0, `the app asked Strava and Garmin for their status (${JSON.stringify(calls)})`);
ok(await page.locator("nav.tabbar").count() === 1 && !/Noget gik galt/.test(await page.locator("body").innerText()), "no crash: the app is there with its tab bar");
// AI coach
await page.locator("nav.tabbar button").nth(3).click(); await page.waitForTimeout(300);
const ta = page.locator(".composer textarea"); await ta.fill("Hvordan griber jeg ugen an?"); await ta.press("Enter"); await page.waitForTimeout(800);
ok(/AI-træneren svarede ikke som forventet/.test(await page.locator("main").innerText()), "the coach says it did not answer as expected");
// account deletion: a 200 HTML answer is not a deletion
await page.locator("nav.tabbar button").nth(4).click(); await page.waitForTimeout(300);
const konto = page.locator("details#konto"); if (!(await konto.evaluate((d) => d.open))) await konto.locator("summary").click();
let alerted = false; page.on("dialog", (d) => { alerted = true; d.dismiss(); });
await konto.getByRole("button", { name: "Slet min konto" }).click();
await konto.getByRole("button", { name: "Ja, slet min konto" }).click(); await page.waitForTimeout(800);
ok(!alerted && /Kontoen kunne ikke slettes/.test(await konto.innerText()), "account deletion: shown as failed, no 'deleted' message");
ok(await page.evaluate(() => !!localStorage.getItem("ultraplan-log") && !!localStorage.getItem("sb-localhost-auth-token")), "nothing on the device is wiped and the login stays");
ok(errors.length === 0 && (await page.evaluate(() => window.__rej)).length === 0, `no page errors or unhandled rejections ${errors.join(";")}`);
await browser.close();
done();
