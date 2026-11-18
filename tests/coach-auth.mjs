/* The AI coach answers only a logged-in runner when Supabase is set up (production): api/coach.js checks the
   session like api/invite.js, with a per-user brake of 40 questions an hour per instance. The app sends the session
   and a 401 (expired session) shows the message with a Log ind button. Auth build on :4175. node tests/coach-auth.mjs */
import { chromium, base, log, acts, check } from "./seed.mjs";
const { ok, done } = check();
// ---- server
process.env.SUPABASE_URL = "http://sb.test"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.ZAI_API_KEY = "test-key";
const mod = await import("../api/coach.js");
const fakeClient = (user) => () => ({ auth: { getUser: async (tok) => (tok === "good" ? { data: { user }, error: null } : { data: null, error: { message: "bad jwt" } }) } });
const u = { id: "u1" };
ok((await mod.coachCaller({ headers: {} }, { createClientImpl: fakeClient(u) })).why === "login", "no token: 401, log in");
ok((await mod.coachCaller({ headers: { authorization: "Bearer nope" } }, { createClientImpl: fakeClient(u) })).why === "expired", "a bad token: 401, session expired");
ok((await mod.coachCaller({ headers: { authorization: "Bearer good" } }, { createClientImpl: fakeClient(u) })).id === "u1", "a good token: the caller's id");
const t0 = 1_000_000; let over = false; for (let i = 0; i < 40; i++) over = over || mod.overRate("u2", t0 + i);
ok(!over && mod.overRate("u2", t0 + 41) === true && mod.overRate("u2", t0 + 3600_001 + 40) === false, "40 questions an hour pass, the 41st is braked, an hour later it opens again");
const res = { code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, end(b) { this.body = JSON.parse(b); } };
await mod.default({ method: "POST", headers: {}, body: { question: "Hej", context: {}, lang: "da" } }, res);
ok(res.code === 401 && res.body.login === true && /Log ind under Mere → Konto/.test(res.body.error), `the handler refuses a caller without a session before any AI call (${res.code} ${res.body?.error})`);
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.ZAI_API_KEY;
// ---- app (auth build)
const URL0 = process.env.ULTRA_AUTH_URL || "http://localhost:4175/";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
const run = async (loggedIn, expired = false) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
  await ctx.addInitScript(({ base, log, acts, session, loggedIn }) => { localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-log", JSON.stringify(log)); localStorage.setItem("ultraplan-activities", JSON.stringify(acts)); localStorage.setItem("ultraplan-lang", "da"); if (loggedIn) localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session)); }, { base, log, acts, session, loggedIn });
  await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
  await ctx.route("**/sb/rest/v1/**", (r) => r.fulfill({ status: r.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/strava", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"connected":false}' }));
  await ctx.route("**/api/garmin", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"connected":false}' }));
  const auth = [];
  await ctx.route("**/api/coach", (r) => { auth.push(r.request().headers().authorization || ""); return expired ? r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ login: true, error: "Din session er udløbet. Log ind igen for at bruge AI-træneren." }) }) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Tag den roligt i dag." }) }); });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL0, { waitUntil: "load" }); await page.waitForTimeout(1500);
  await page.locator("nav.tabbar button").nth(3).click(); await page.waitForTimeout(300);
  return { browser, page, auth, errors };
};
{ // an expired session: the coach's 401 says so, with a way to log in
  const { browser, page, errors } = await run(true, true);
  const ta = page.locator(".composer textarea"); await ta.fill("Hej"); await ta.press("Enter"); await page.waitForTimeout(800);
  ok(/Din session er udløbet/.test(await page.locator("main").innerText()) && await page.locator(".advice.warn button", { hasText: "Log ind" }).count() === 1, "a 401 from the coach shows the message and a Log ind button");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
{
  const { browser, page, auth, errors } = await run(true);
  const ta = page.locator(".composer textarea"); await ta.fill("Hvordan griber jeg ugen an?"); await ta.press("Enter"); await page.waitForTimeout(800);
  ok(auth[0] === "Bearer sess" && /Tag den roligt i dag/.test(await page.locator(".chat").innerText()), `logged in: the question carries the session and the answer shows (${auth[0]})`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
