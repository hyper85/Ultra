/* Delete my account (Play Store requirement): the server revokes Strava, deletes the Strava/Garmin rows, the synced
   data and the login, in that order, skipping a table a setup does not have; the app asks twice, then wipes the device.
   Needs the auth build on 4175 (see tests/garmin-connect.mjs). node tests/account-delete.mjs */
import { chromium, base, log, acts, check } from "./seed.mjs";
import { deleteAccount } from "../api/account.js";
const { ok, done } = check();
// server: a fake Supabase admin client that records what happens
{
  const steps = [];
  const table = (name) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => { steps.push(`read ${name}`); return name === "strava_tokens" ? { data: { access_token: "TOK" }, error: null } : { data: null, error: null }; } }) }),
    delete: () => ({ eq: async (_c, uid) => { steps.push(`delete ${name} ${uid}`); return name === "garmin_keys" ? { error: { message: 'relation "public.garmin_keys" does not exist' } } : { error: null }; } }),
  });
  const admin = { from: table, auth: { admin: { deleteUser: async (uid) => { steps.push(`deleteUser ${uid}`); return { error: null }; } } } };
  let revoked = null;
  const out = await deleteAccount({ admin, uid: "U1", fetchImpl: async (url, opts) => { revoked = `${url} ${opts.headers.Authorization}`; return new Response("{}"); } });
  ok(revoked === "https://www.strava.com/oauth/deauthorize Bearer TOK", "Strava access revoked with the stored token");
  ok(steps.join(" > ") === "read strava_tokens > delete strava_tokens U1 > delete garmin_keys U1 > delete ultraplan_user_data U1 > deleteUser U1", `order: ${steps.join(" > ")}`);
  ok(out.at(-1) === "auth.users", "a missing garmin_keys table is skipped, the login is still deleted");
  let err = null;
  const bad = { ...admin, from: (n) => ({ ...table(n), delete: () => ({ eq: async () => ({ error: n === "ultraplan_user_data" ? { message: "permission denied" } : null }) }) }) };
  try { await deleteAccount({ admin: bad, uid: "U2", fetchImpl: async () => new Response("{}") }); } catch (e) { err = e; }
  ok(err && /ultraplan_user_data: permission denied/.test(err.message), "a real database error stops before the login is deleted");
}
// app: two taps, then the device is wiped
{
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
  const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
  await ctx.addInitScript(({ base, log, acts, session }) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", "da"); localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session)); }, { base, log, acts, session });
  await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
  await ctx.route("**/sb/auth/v1/logout**", (r) => r.fulfill({ status: 204, body: "" }));
  await ctx.route("**/sb/rest/v1/**", (r) => r.fulfill({ status: r.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/strava", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"connected":false}' }));
  await ctx.route("**/api/garmin", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"connected":false}' }));
  let calls = 0, fail = true;
  await ctx.route("**/api/account", (r) => { calls++; if (fail) { fail = false; return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Kontoen kunne ikke slettes helt (test). Prøv igen, eller skriv til os." }) }); } return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  let alertText = ""; page.on("dialog", (d) => { alertText = d.message(); d.accept(); });
  await page.goto(process.env.ULTRA_AUTH_URL || "http://localhost:4175/", { waitUntil: "networkidle" }); await page.waitForTimeout(800);
  await page.locator("nav.tabbar button").nth(4).click(); await page.waitForTimeout(300);
  const konto = page.locator("details#konto"); if (!(await konto.evaluate((d) => d.open))) await konto.locator("summary").click();
  await konto.getByRole("button", { name: "Slet min konto" }).click(); await page.waitForTimeout(150);
  ok(calls === 0 && /Er du sikker\?/.test(await konto.locator(".del-acc").innerText()), "first tap only asks");
  await konto.getByRole("button", { name: "Fortryd" }).click();
  ok(await konto.locator(".del-acc").count() === 0, "Fortryd closes the question");
  await konto.getByRole("button", { name: "Slet min konto" }).click();
  await konto.getByRole("button", { name: "Ja, slet min konto" }).click(); await page.waitForTimeout(600);
  ok(calls === 1 && /Kontoen kunne ikke slettes helt/.test(await konto.locator(".del-err").innerText()) && await page.evaluate(() => !!localStorage.getItem("ultraplan-log")), "a server error is shown and nothing local is wiped");
  await konto.getByRole("button", { name: "Ja, slet min konto" }).click(); await page.waitForTimeout(1200);
  const left = await page.evaluate(() => ["ultraplan-profile", "ultraplan-log", "ultraplan-activities"].map((k) => localStorage.getItem(k)));
  ok(calls === 2 && /Din konto og alle dine data er slettet/.test(alertText), `deleted: confirmation shown (${alertText.slice(0, 50)})`);
  const prof = left[0] ? JSON.parse(left[0]) : {};
  ok(!prof.onboarded && (!left[1] || left[1] === "{}") && (!left[2] || left[2] === "{}"), "the device is wiped: back to the questionnaire, no log, no runs");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
