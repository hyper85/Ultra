/* Mere → Garmin with a logged-in user: paste a key, the server (mocked /api/garmin) checks it, then a sync lands resting
   HR, sleep and HRV day by day in the profile store and as weekly values in the log (typed values kept). Needs the
   auth build: VITE_SUPABASE_URL=http://localhost:4175/sb VITE_SUPABASE_ANON_KEY=anon npx vite build --outDir <dir>
   and npx vite preview --port 4175 --outDir <dir>. node tests/garmin-connect.mjs */
import { chromium, base, log, acts, check } from "./seed.mjs";
const { ok, done } = check();
const URL0 = process.env.ULTRA_AUTH_URL || "http://localhost:4175/";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
const days = {}; for (let i = 0; i < 14; i++) { const d = new Date(Date.UTC(2026, 9, 15 + i)).toISOString().slice(0, 10); days[d] = { hr: 48 + (i % 3), sleep: 6 + (i % 4) / 2, hrv: 50 + i }; }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
await ctx.addInitScript(({ base, log, acts, session }) => {
  if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
  localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", "da");
  localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
}, { base, log: { ...log, "2026-10-19": { km: 20, hr: 47 } }, acts, session });
const calls = [];
await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
await ctx.route("**/sb/rest/v1/**", (r) => r.fulfill({ status: r.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: "[]" }));
await ctx.route("**/api/strava", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: false }) }));
let connected = false;
await ctx.route("**/api/garmin", async (r) => {
  const b = JSON.parse(r.request().postData() || "{}"); calls.push({ op: b.op, key: b.key, auth: r.request().headers().authorization });
  if (b.op === "status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected, lastSync: null }) });
  if (b.op === "connect") { if (b.key !== "GOOD-KEY-0123456789-abcdef") return r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Garmin afviste nøglen. Den kan være forkert, udløbet eller slettet." }) }); connected = true; return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); }
  if (b.op === "sync") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ days, found: { hr: 14, sleep: 14, hrv: 14 }, lastSync: "2026-10-28T08:00:00.000Z" }) });
  if (b.op === "disconnect") { connected = false; return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); }
});
const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL0, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
await page.locator("nav.tabbar button").nth(4).click(); await page.waitForTimeout(300);
const g = page.locator("details#garmin");
ok(await g.count() === 1, "Garmin section under Mere");
await g.locator("summary").click(); await page.waitForTimeout(200);
ok(/Ikke forbundet/.test(await g.locator("summary").textContent()), "summary: not connected");
const input = g.locator("input[type=password]");
ok(await input.count() === 1 && await input.getAttribute("autocomplete") === "off", "key field is a password field without autocomplete");
if (process.env.SHOT) await g.screenshot({ path: process.env.SHOT });
const btn = g.getByRole("button", { name: "Forbind Garmin" });
ok(await btn.isDisabled(), "button disabled until a key is pasted");
await input.fill("wrong-key-0123456789-xyz"); await btn.click(); await page.waitForTimeout(500);
ok(/Garmin afviste nøglen/.test(await g.locator(".advice").innerText()) && !connected, "a rejected key shows Garmin's message");
await input.fill("GOOD-KEY-0123456789-abcdef"); await btn.click(); await page.waitForTimeout(1200);
const c = calls.find((x) => x.op === "connect" && x.key === "GOOD-KEY-0123456789-abcdef");
ok(c && c.auth === "Bearer sess", "key sent once to /api/garmin with the session");
const msg = (await g.locator(".advice").innerText()).replace(/\n/g, " ");
ok(/Hentede fra Garmin: 14 dage med hvilepuls, 14 nætter med søvn, 14 nætter med HRV\./.test(msg), `sync message: ${msg}`);
ok(await g.locator("input[type=password]").count() === 0 && await g.getByRole("button", { name: "Afbryd Garmin" }).count() === 1, "connected: key field gone, disconnect offered");
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-profile")));
ok(Object.keys(prof.wellness || {}).length === 14 && prof.wellness["2026-10-28"].hr === 48 + (13 % 3) && prof.wellness["2026-10-28"].hrv === 63, `14 days in the day store (${Object.keys(prof.wellness || {}).length})`);
ok(!JSON.stringify(prof).includes("GOOD-KEY"), "the key is not stored in the profile");
const lg = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log")));
ok(lg["2026-10-19"].hr === 47 && !lg["2026-10-19"].hrAuto && lg["2026-10-19"].sleep > 0 && lg["2026-10-19"].sleepAuto, `typed resting HR kept, sleep filled (${JSON.stringify(lg["2026-10-19"])})`);
ok(lg["2026-10-26"]?.hrAuto && lg["2026-10-26"]?.hrv > 0, "a new week gets resting HR and HRV");
const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => localStorage.getItem(k).includes("GOOD-KEY")));
ok(ls.length === 0, "the key is nowhere in localStorage");
// Overblik: the day-by-day resting HR chart now has the days
await page.locator("nav.tabbar button").nth(2).click(); await page.waitForTimeout(300);
ok(await page.locator("#chart-hr-days").count() === 1, "resting HR day by day on Overblik");
// reload: status says connected and syncs silently
await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1200);
ok(calls.filter((x) => x.op === "sync").length === 2, `silent sync on load (${calls.filter((x) => x.op === "sync").length})`);
await page.locator("nav.tabbar button").nth(4).click(); await page.waitForTimeout(300);
await page.locator("details#garmin summary").click(); await page.waitForTimeout(200);
ok(/forbundet · synk/.test(await page.locator("details#garmin summary").textContent()), "summary: connected with last sync");
await page.locator("details#garmin").getByRole("button", { name: "Afbryd Garmin" }).click(); await page.waitForTimeout(500);
ok(/Garmin er afbrudt, og nøglen er slettet her/.test(await page.locator("details#garmin .advice").innerText()) && await page.locator("details#garmin input[type=password]").count() === 1, "disconnect: key deleted, field back");
ok(errors.length === 0, `no errors ${errors.join(";")}`);
await browser.close();
done();
