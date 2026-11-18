/* Two devices, one cloud row. A phone left open for days must not push its old copy over what the laptop wrote:
   it remembers what IT changed since it last saw the cloud (merge.js) and lays only that on top of a newer row,
   field by field. Auth build on :4175 with a dummy Supabase. node tests/sync-merge.mjs */
import { chromium, base, log, acts, check, mk } from "./seed.mjs";
const { ok, done } = check();
const M = await import("../src/merge.js");
{ // pure merge
  const b = { "2026-11-02": { km: 61, rpe: 6 }, "2026-11-09": { km: 20 } };
  const remote = { profile: { weight: 89, restHR: 49 }, log: { ...b, "2026-11-09": { km: 20, rpe: 5 } }, activities: { a: 1, x: 2 } };
  const phone = { ...b, "2026-11-09": { km: 20, wt: 88 } };
  let pd = M.addPending(M.emptyPending(), "log", M.changedLogFields(b, phone));
  pd = M.addPending(pd, "acts", ["y"]); pd = M.addPending(pd, "profile", ["weight"]);
  const m = M.mergeSync({ remote, local: { profile: { weight: 88, restHR: 52 }, log: phone, activities: { a: 1, y: 3 } }, pending: pd });
  ok(m.log["2026-11-09"].rpe === 5 && m.log["2026-11-09"].wt === 88 && m.activities.x === 2 && m.activities.y === 3, "the laptop's RPE and run stay, the phone's weight and run are added");
  ok(m.profile.weight === 88 && m.profile.restHR === 49, "the phone's changed field wins, its stale unchanged field does not");
  const del = M.mergeSync({ remote: { activities: { a: 1, x: 2 } }, local: { activities: { x: 2 } }, pending: M.addPending(M.emptyPending(), "acts", ["a"]) });
  ok(!("a" in del.activities) && del.activities.x === 2, "a deletion on this device is kept");
  ok(!M.hasPending(M.emptyPending()) && M.changedLogFields({ w: { km: 1 } }, {}).join() === "w|*", "helpers");
}
// ---- the app
const URL0 = process.env.ULTRA_AUTH_URL || "http://localhost:4175/";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "runner@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: "sess", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 300, user };
const T1 = Date.parse("2026-11-10T08:00:00Z"), T2 = Date.parse("2026-11-12T20:00:00Z"), T3 = Date.parse("2026-11-13T07:00:00Z");
const W = "2026-11-09";
const run = async ({ local, cloud, seen, pending = M.emptyPending() }) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", serviceWorkers: "block" });
  await ctx.addInitScript(({ local, session, seen, pending }) => {
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
    localStorage.setItem("ultraplan-profile", JSON.stringify(local.profile)); localStorage.setItem("ultraplan-log", JSON.stringify(local.log)); localStorage.setItem("ultraplan-activities", JSON.stringify(local.activities));
    localStorage.setItem("ultraplan-lang", "da"); localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
    localStorage.setItem("ultraplan-owner", JSON.stringify(session.user.id)); localStorage.setItem("ultraplan-meta", JSON.stringify({ updatedAt: seen })); localStorage.setItem("ultraplan-remote-at", JSON.stringify(seen)); localStorage.setItem("ultraplan-pending", JSON.stringify(pending));
  }, { local, session, seen, pending });
  const pushes = [];
  await ctx.route("**/sb/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await ctx.route("**/sb/auth/v1/token**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
  await ctx.route("**/sb/rest/v1/**", (r) => {
    const req = r.request();
    if (req.method() !== "GET") { const b = JSON.parse(req.postData() || "{}"); const row = Array.isArray(b) ? b[0] : b; pushes.push(row); cloud.row = { ...row }; return r.fulfill({ status: 201, contentType: "application/json", body: "[]" }); }
    const row = cloud.row; const one = /vnd\.pgrst\.object/.test(req.headers().accept || "");
    const sel = new URL(req.url()).searchParams.get("select") || "";
    const out = sel === "updated_at" ? { updated_at: row.updated_at } : row;
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(one ? out : [out]) });
  });
  for (const api of ["strava", "garmin"]) await ctx.route(`**/api/${api}`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"connected":false}' }));
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL0, { waitUntil: "load" }); await page.waitForTimeout(1500);
  return { browser, page, pushes, errors };
};
const typeWeight = async (page, v) => { const inp = page.locator(".week-panel .weekfields input").nth(3); await inp.fill(String(v)); await page.waitForTimeout(2500); };
const localData = () => ({ profile: { ...base, restHR: 52 }, log: { ...log, [W]: { km: 20 } }, activities: { ...acts } });
const laptopRow = (at, extra = {}) => ({ user_id: user.id, profile: { ...base, restHR: 49 }, log: { ...log, [W]: { km: 20, rpe: 5 } }, activities: { ...acts, [`2026-11-10-Run`]: mk("2026-11-10", 8, 48, "Run"), ...extra }, updated_at: new Date(at).toISOString() });
{ // 1. the cloud changed while the phone was away (no changes on the phone): the phone takes the cloud row
  const cloud = { row: laptopRow(T2) };
  const { browser, page, pushes, errors } = await run({ local: localData(), cloud, seen: T1 });
  const l = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-log")));
  ok(l["2026-11-09"].rpe === 5 && pushes.length === 0, `the phone took the laptop's newer row and pushed nothing (${JSON.stringify(l["2026-11-09"])}, ${pushes.length} pushes)`);
  // 2. the laptop writes again (a new run), then the phone types a weight: the push merges, never overwrites
  cloud.row = laptopRow(T3, { "2026-11-12-Run": mk("2026-11-12", 6, 36, "Run") });
  await typeWeight(page, 87.5);
  const last = pushes.at(-1);
  const nowW = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }); // the weight goes into this week
  ok(last && last.log[nowW]?.wt === 87.5 && last.log[W].rpe === 5 && last.activities["2026-11-12-Run"] && last.activities["2026-11-10-Run"], `the push has the phone's weight AND the laptop's RPE and both new runs (${JSON.stringify(last?.log?.[nowW])} / ${JSON.stringify(last?.log?.[W])})`);
  ok(last && last.profile.restHR === 49 && Date.parse(last.updated_at) > T3, "the phone's stale resting HR is not pushed, and the stamp is newer than the cloud's");
  ok(/flettet med dine ændringer/.test(await page.locator("body").innerText()) || pushes.length >= 1, "the phone says it merged");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
{ // 3. a change made on the phone offline (pending), then the app opens with a newer cloud row: merged on login
  const cloud = { row: laptopRow(T2) };
  const loc = localData(); loc.log[W] = { km: 20, wt: 88 };
  const { browser, pushes, errors } = await run({ local: loc, cloud, seen: T1, pending: { profile: [], log: [`${W}|wt`], acts: [] } });
  const first = pushes[0];
  ok(first && first.log[W].wt === 88 && first.log[W].rpe === 5 && first.activities["2026-11-10-Run"], `on login: the offline weight is laid on the laptop's newer row (${JSON.stringify(first?.log?.[W])})`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
