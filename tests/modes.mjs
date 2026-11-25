/* Training modes, the owner-only coach plan, and "Slet historik". node tests/modes.mjs
   - plan engine (bundled from App.jsx): fitness / hybrid without a race = a rolling plan in 4-week blocks, no taper,
     no race week, no back-to-back; strength = no running; a 10 km race = a long run longer than the race, a 1-week
     taper, "Løbsspecifik"; an 83 km ultra keeps its back-to-back and 3-week taper
   - a new user picks the mode first and never sees the bundled Hammer Trail coach plan; "Kun styrke" counts sessions
   - the owner (coachMode true) keeps the coach plan; Mere → Træningsform switches modes
   - Slet historik: runs, log and the daily resting HR go, and older runs do not come back (reload, file import) */
import { openApp, fresh, check, mk } from "./seed.mjs";
import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(300));
const dir = mkdtempSync(join(tmpdir(), "ultra-modes-"));
await build({ stdin: { contents: 'export { buildPlan, modeOf } from "./src/App.jsx";', resolveDir: process.cwd(), loader: "js" }, bundle: true, platform: "node", format: "esm", outfile: join(dir, "plan.mjs"), loader: { ".css": "empty", ".png": "empty", ".svg": "empty" }, jsx: "automatic", define: { "import.meta.env.VITE_SUPABASE_URL": "undefined", "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined", __APP_VERSION__: '"test"' }, logLevel: "silent" });
const { buildPlan, modeOf } = await import(join(dir, "plan.mjs"));
const d = (avail) => ({ avail, time: "", note: "" }); const wk = [d("normal"), d("normal"), d("normal"), d("normal"), d("normal"), d("long"), d("normal")];
const P = (o) => ({ startDate: "2026-11-02", raceDate: "", raceKm: "", currentKm: 30, level: 2, maxRunDays: 4, qualityDay: 2, longDay: 5, sched: { A: wk, B: wk }, ...o });
{
  const f = buildPlan(P({ mode: "fitness" }), { easyPaceMinKm: 6.25 });
  ok(f.weeks >= 16 && f.rows.every((r) => !r.isRace && !r.sun && r.km <= r.target + 0.5) && f.rows.filter((r) => r.deload).every((r) => (r.i % 4) === 0), `fitness: ${f.weeks} rolling weeks, no race week, no back-to-back, an easy week every 4th`);
  const top = Math.max(...f.rows.map((r) => r.target)); const late = f.rows.filter((r) => r.i > 13 && !r.deload).map((r) => r.target);
  ok(top <= Math.min(30 * 1.1 * 1.5, 30 * 1.1 + 30) + 1 && late.every((x) => x === late[0]), `fitness: the top (${top}) is a sustainable step above today, then held (${late.join(",")})`);
  const h = buildPlan(P({ mode: "hybrid" }), { easyPaceMinKm: 6.25 });
  ok(h.rows.every((r) => !r.isRace) && Math.max(...h.rows.map((r) => r.target)) < top, "hybrid without a race: rolling too, with a lower running top");
  const s = buildPlan(P({ mode: "strength" }), { easyPaceMinKm: 6.25 });
  ok(s.rows.every((r) => r.km === 0 && r.runDays.length === 0 && r.qDay == null), "strength: no running at all");
  const ten = buildPlan(P({ mode: "race", raceDate: "2027-03-14", raceKm: 10 }), { easyPaceMinKm: 6.25 });
  const tenLong = Math.max(...ten.rows.filter((r) => !r.isRace).map((r) => r.lng));
  ok(tenLong > 10 && ten.rows.filter((r) => r.phase === "Nedtrapning").length === 1 && ten.rows.some((r) => r.phaseLabel === "Løbsspecifik") && ten.rows.every((r) => !r.sun), `10 km race: long run ${tenLong} km, 1-week taper, "Løbsspecifik", no back-to-back`);
  const ultra = buildPlan(P({ mode: "race", startDate: "2026-08-24", raceDate: "2027-01-30", raceKm: 83, currentKm: 45, level: 3 }), { easyPaceMinKm: 6.25 });
  ok(ultra.rows.some((r) => r.sun > 0) && ultra.rows.filter((r) => r.phase === "Nedtrapning").length === 3 && ultra.rows.at(-1).isRace, "83 km ultra: back-to-back weekends and a 3-week taper as before");
  ok(modeOf({ style: "hybrid" }) === "hybrid" && modeOf({}) === "race" && modeOf({ mode: "fitness", style: "hybrid" }) === "fitness", "old profiles: style hybrid → hybrid, nothing → race");
}
// ---- a new user: the mode first, no Hammer Trail coach plan anywhere
{
  const { browser, page, errors } = await fresh({ lang: "da", at: "2026-11-25T09:00:00" });
  const head = async () => (await page.locator(".ob-head .muted").innerText()).trim();
  ok(/Træning/.test(await head()) && /Hvad vil du træne\?/i.test(await page.locator(".ob").innerText()), "the questionnaire starts with the training mode");
  await page.getByRole("button", { name: /^Kun styrke/ }).click(); await page.getByRole("button", { name: "Næste" }).click();
  const nums = page.locator("section input[type=number]"); await nums.nth(0).fill("35"); await nums.nth(1).fill("178"); await nums.nth(2).fill("75");
  for (let k = 0; k < 3; k++) { await page.getByRole("button", { name: /^(Næste|Vis min plan)$/ }).click(); await page.waitForTimeout(150); }
  const res = await page.locator(".ob").innerText();
  ok(/Start styrkeplanen/.test(res) && !/Trænerplan|Hammer/i.test(res), "Kun styrke: no race step, no running form, no coach plan, one strength card");
  await page.getByRole("button", { name: "Start styrkeplanen" }).click(); await page.waitForTimeout(600);
  const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  ok(/UGEN 0 \/ 3 styrkepas/i.test(txt) && !/\d+ dage/.test((await page.locator(".topbar-race").count()) ? "x dage" : ""), `the week counts strength sessions and there is no race countdown (${(txt.match(/UGEN[^M]*/i) || [""])[0]})`);
  await tab(page, 1);
  ok(!/Trænerplan|trænerens plan|Brug trænerplanen/i.test(await page.locator("main").innerText()) && await page.locator("#raceday").count() === 0, "Plan: no coach-plan offer and no Løbsdag without a race");
  await tab(page, 4);
  const start = page.locator("details.acc", { has: page.locator("h2", { hasText: /^Start$/ }) }); await start.locator("> summary").click(); await page.waitForTimeout(150);
  ok(!/Trænerplan/.test(await start.innerText()) && !/Hammer/i.test(await page.locator("main").innerText()), "Mere: no coach-plan switch and no Hammer Trail plan for a runner who never had one (they can still import their own coach's plan)");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
// ---- the owner keeps the coach plan; Træningsform switches the app plan
{
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-25T09:00:00" });
  const chip = await page.locator(".meta-chip").first().innerText();
  ok(/Uge \d+ af 23/.test(chip) && await page.locator(".topbar-race").count() === 1, `the owner's coach plan is untouched (${chip})`);
  await tab(page, 4);
  const mode = page.locator("details#mode"); const sum = await mode.locator("summary").innerText(); await mode.locator("> summary").click(); await page.waitForTimeout(200);
  ok(/trænerplan/i.test(sum) && /Du følger trænerplanen/.test(await mode.innerText()), "Træningsform says the coach plan is in use");
  const start = page.locator("details.acc", { has: page.locator("h2", { hasText: /^Start$/ }) }); await start.locator("> summary").click(); await page.waitForTimeout(150);
  ok(/Trænerplan – brug trænerens uger/.test(await start.innerText()), "the owner still has the coach-plan switch");
  page.on("dialog", (x) => x.accept());
  await mode.getByRole("button", { name: /^Form uden løb/ }).click(); await page.waitForTimeout(500);
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-profile")));
  ok(prof.mode === "fitness" && prof.coachMode === false && prof.coachAvailable === true, "switching asks, leaves the coach plan and keeps the way back");
  ok(await page.locator(".topbar-race").count() === 0, "no race countdown in fitness mode");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
// ---- Slet historik stays deleted
{
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-25T09:00:00", once: true, patch: { wellness: { "2026-11-20": { hr: 50 } } } });
  page.on("dialog", (x) => x.accept());
  await tab(page, 4);
  const reset = page.locator("details.acc", { has: page.locator("h2", { hasText: /^Nulstil$/ }) }); await reset.locator("> summary").click();
  await reset.getByRole("button", { name: "Slet historik" }).click(); await page.waitForTimeout(600);
  const st = () => page.evaluate(() => ({ log: Object.keys(JSON.parse(localStorage.getItem("ultraplan-log") || "{}")).length, acts: Object.keys(JSON.parse(localStorage.getItem("ultraplan-activities") || "{}")).length, prof: JSON.parse(localStorage.getItem("ultraplan-profile")) }));
  let s = await st();
  ok(s.log === 0 && s.acts === 0 && Object.keys(s.prof.wellness || {}).length === 0 && s.prof.historyFrom === "2026-11-25", `runs, log and resting HR are gone (${s.log}/${s.acts}), history from ${s.prof.historyFrom}`);
  ok(s.prof.onboarded === true && s.prof.coachMode === true, "settings and plan are kept");
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(600); s = await st();
  ok(s.log === 0 && s.acts === 0, "after a reload nothing is rebuilt");
  // a file with one old run and one from today: only today's comes in
  const csv = "Activity Type,Date,Title,Distance,Time,Avg HR\nRunning,2026-11-10 07:00:00,Gammel,8.00,00:50:00,140\nRunning,2026-11-25 07:00:00,Ny,6.00,00:36:00,138\n";
  await tab(page, 4); await page.locator("#files > summary").click(); await page.waitForTimeout(150);
  await page.locator("#files input[type=file]").setInputFiles({ name: "Activities.csv", mimeType: "text/csv", buffer: Buffer.from(csv) }); await page.waitForTimeout(900);
  const a = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("ultraplan-activities") || "{}")).map((x) => x.day));
  ok(a.length === 1 && a[0] === "2026-11-25", `a file: only today's run comes in (${a.join(",")})`);
  if (!(await reset.evaluate((e) => e.open))) await reset.locator("> summary").click();
  ok(/Historik fra 25\. nov/i.test(await reset.innerText()), "Nulstil shows the history start and a way to allow older runs");
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
