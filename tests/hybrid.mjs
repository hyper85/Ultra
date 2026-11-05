/* Hybrid training (opt-in): strength is a goal next to the running, up to 5 sessions as a split, a 15 % lower running
   top, and no leg session the day before the long run or the hard session. It only applies to the app's own plan:
   the coach plan and the default ultra style are unchanged. node tests/hybrid.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(250));
// engine
{
  const { buildStrength, HYBRID_MAX } = await import("../src/strength.js");
  const H = (count, guard = []) => buildStrength({ gear: "gym", phase: "Opbygning", week: 4, count, style: "hybrid", guard });
  const kinds = (r) => r.sessions.map((s) => s.kind).join(",");
  ok(HYBRID_MAX === 5 && kinds(H(1)) === "full" && kinds(H(2)) === "legs,upper" && kinds(H(3)) === "legs,upper,full" && kinds(H(4)) === "legs,upper,power,pull" && kinds(H(5)) === "legs,push,pull,power,full", `splits 1–5: ${[1, 2, 3, 4, 5].map((n) => kinds(H(n))).join(" | ")}`);
  ok(H(7).sessions.length === 5 && H(5).sessions.map((s) => s.key).join("") === "ABCDE", "at most 5 sessions, keyed A–E");
  ok(H(5).sessions.every((s) => s.exercises.length === 5 && s.exercises.every((e) => e.name && e.how && e.sets > 0)), "every hybrid session has five exercises with a cue and sets");
  ok(H(3).sessions[0].exercises[0].sets === 4 && /5–8/.test(H(3).sessions[0].exercises[0].reps), "build phase is heavy: 4 × 5–8");
  const g = H(2, [true, false]);
  ok(kinds(g) === "upper,legs", `a guarded first day gets the upper-body session (${kinds(g)})`);
  const g3 = H(3, [false, true, true]);
  ok(!g3.sessions[1].legs && g3.sessions[2].legs, `only one upper session to give: it takes the first guarded day (${kinds(g3)})`);
  ok(buildStrength({ style: "hybrid", isRace: true, count: 4 }).sessions.length === 0, "race week: no strength");
  const nut = await import("../src/nutrition.js");
  const lift = (o) => nut.dayTargets({ bmr: 1800, weight: 80, dayType: "lift", ...o });
  ok(lift({ hybrid: true }).kcal - lift({}).kcal === 150 && lift({ hybrid: true }).protein === 160, "hybrid lift day: +150 kcal, protein 2 g/kg");
  ok(lift({ hybrid: true, body: "lean" }).kcal === lift({ body: "lean" }).kcal, "hybrid with weight loss: no extra kcal");
  // ultra (default) is untouched: same output with no style and with style "ultra"
  const U = (o) => JSON.stringify(buildStrength({ gear: "home", phase: "Ultra-prep", week: 9, count: 3, ...o }));
  ok(U({}) === U({ style: "ultra", guard: [true, true, true] }) && JSON.parse(U({})).sessions.length === 3, "ultra style: unchanged, max 3 sessions");
}
const planText = async (page) => { await tab(page, 1); return (await page.locator("main").innerText()).replace(/\s+/g, " "); };
const todayText = async (page) => { await tab(page, 0); return (await page.locator("main").innerText()).replace(/\s+/g, " "); };
// The coach plan (the runner's January ultra) ignores hybrid completely
{
  const a = await openApp({ lang: "da", at: "2026-10-27T07:00:00" });
  const b = await openApp({ lang: "da", at: "2026-10-27T07:00:00", patch: { style: "hybrid", liftDays: [0, 1, 2, 3, 4] } });
  ok(await todayText(a.page) === await todayText(b.page), "coach plan: the Today view is identical with hybrid set");
  ok(await planText(a.page) === await planText(b.page), "coach plan: the plan tab (days, km, strength) is identical with hybrid set");
  await tab(b.page, 4);
  await b.page.locator("#strength > summary").click(); await b.page.waitForTimeout(150);
  ok(/Hybrid kan vælges, når du bruger appens egen plan/.test(await b.page.locator("#strength").innerText()), "coach plan: the strength panel says hybrid is for the app's own plan");
  ok(a.errors.length + b.errors.length === 0, `no errors ${[...a.errors, ...b.errors].join(";")}`);
  await a.browser.close(); await b.browser.close();
}
// The app's own plan: hybrid lowers the running top and gives the split
{
  const d = (avail) => ({ avail, time: "", note: "" });
  const week = [d("normal"), d("normal"), d("normal"), d("normal"), d("normal"), d("long"), d("normal")];
  const own = { coachMode: false, maxRunDays: 4, longDay: 5, qualityDay: 2, liftDays: [0, 1, 3, 4, 6], sched: { A: week, B: week } };
  const u = await openApp({ lang: "da", at: "2026-10-27T07:00:00", patch: own });
  const h = await openApp({ lang: "da", at: "2026-10-27T07:00:00", patch: { ...own, style: "hybrid" } });
  const top = async (page) => Math.max(...(await planText(page)).match(/\d+(?= km)/g).map(Number));
  const [tu, th] = [await top(u.page), await top(h.page)];
  ok(th < tu && th >= Math.round(tu * 0.8), `hybrid running top lower (${tu} → ${th} km)`);
  await tab(h.page, 4);
  await h.page.locator("#strength > summary").click(); await h.page.waitForTimeout(150);
  const panel = h.page.locator("#strength");
  ok(await panel.getByRole("button", { name: "Hybrid – løb og styrke" }).getAttribute("aria-pressed") === "true", "the style chip shows Hybrid");
  const txt = (await panel.innerText()).replace(/\s+/g, " ");
  ok(["Styrke A", "Styrke B", "Styrke C", "Styrke D", "Styrke E"].every((n) => txt.includes(n)), "five sessions A–E in the strength panel");
  // Friday is the day before Saturday's long run: never a leg session there
  const fri = (txt.match(/Styrke [A-E] · fre · [^·]*/) || [""])[0];
  ok(fri && !/Ben|Hele kroppen/.test(fri), `Friday's session is not legs (${fri.slice(0, 50)})`);
  // switching back to ultra gives 3 sessions and the old top again
  await panel.getByRole("button", { name: "Ultra – løb først" }).click(); await h.page.waitForTimeout(200);
  const txt2 = (await panel.innerText()).replace(/\s+/g, " ");
  ok(txt2.includes("Styrke C") && !txt2.includes("Styrke D"), "back to ultra: three sessions");
  ok(await top(h.page) === tu, "back to ultra: the running top is the ultra one again");
  // Tuesday is the day before Wednesday's hard session: not legs either
  const tue = (txt.match(/Styrke [A-E] · tir · [^·]*/) || [""])[0];
  ok(tue && !/Ben|Hele kroppen/.test(tue), `Tuesday's session is not legs (${tue})`);
  ok(u.errors.length + h.errors.length === 0, `no errors ${[...u.errors, ...h.errors].join(";")}`);
  await u.browser.close(); await h.browser.close();
}
{
  const e = await openApp({ lang: "en", at: "2026-10-27T07:00:00", patch: { coachMode: false, style: "hybrid", liftDays: [0, 1, 3, 4] } });
  await tab(e.page, 4); await e.page.locator("#strength > summary").click(); await e.page.waitForTimeout(150);
  const txt = (await e.page.locator("#strength").innerText()).replace(/\s+/g, " ");
  ok(/Training style/.test(txt) && /Hybrid – running and strength/.test(txt) && /Strength D/.test(txt) && !/Styrke|løb først/.test(txt), `English strength panel (${txt.slice(0, 90)})`);
  ok(e.errors.length === 0, `no errors ${e.errors.join(";")}`);
  await e.browser.close();
}
done();
