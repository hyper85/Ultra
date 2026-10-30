/* Stored data the app did not write (or lost half of) never stops it: broken JSON, null or junk activities, impossible
   dates, junk log weeks and profile fields. Every tab must open with no page error, no crash card and no hang. Plus the
   cleaners in node. node tests/corrupt-data.mjs */
import { chromium, base, check } from "./seed.mjs";
const { ok, done } = check();
const { cleanActs, cleanLog, cleanProfile } = await import("../src/sanitize.js");
const good = { id: "2026-10-28-143-9.0", date: "2026-10-28T10:59:05.000Z", day: "2026-10-28", km: 9, min: 50, hr: 157, maxHr: 180, type: "Run", kind: "run", name: "Tempo", source: "FIT", file: "x", vert: 26, rpe: 7 };
const ca = cleanActs({ a: null, b: { km: "x" }, c: { day: "2026-13-45", km: 5, type: 7 }, d: { id: "d", date: "not a date", km: 3, type: "Run" }, e: 5, [good.id]: good, f: { day: "2026-10-27", km: "8.5", hr: "x", rpe: 12, type: "Run" } });
ok(Object.keys(ca).length === 2 && JSON.stringify(ca[good.id]) === JSON.stringify(good) && ca.f.km === 8.5 && ca.f.hr === null && !("rpe" in ca.f) && ca.f.date, `cleanActs keeps the good, fixes numbers, drops junk (${Object.keys(ca)})`);
const cl = cleanLog({ "2026-10-05": null, garbage: { km: "lots" }, "2026-10-12": { km: -5, hr: "x", sleep: {}, rpe: "6", note: "hej", hrAuto: true }, "2026-10-19": { km: 20, hr: "" } });
ok(JSON.stringify(cl) === JSON.stringify({ "2026-10-12": { rpe: 6, note: "hej", hrAuto: true }, "2026-10-19": { km: 20, hr: "" } }), `cleanLog: ${JSON.stringify(cl)}`);
const cp = cleanProfile({ ...base, maxHR: "abc", restHR: null, liftDays: "x", wellness: { "2026-10-01": { hr: 50 }, bad: 1, "2026-10-02": "x" }, sched: null, startDate: "garbage", age: "41" });
ok(!("maxHR" in cp) && !("liftDays" in cp) && !("sched" in cp) && !("startDate" in cp) && JSON.stringify(cp.wellness) === '{"2026-10-01":{"hr":50}}' && cp.age === "41" && cp.restHR === undefined, "cleanProfile drops wrong types, keeps the rest");
const cases = {
  "broken JSON log": { "ultraplan-log": "{bad", "ultraplan-activities": "{}" },
  "broken JSON acts": { "ultraplan-activities": "[1,2", "ultraplan-log": "{}" },
  "acts with junk": { "ultraplan-activities": JSON.stringify({ a: null, b: { km: "x" }, c: { day: "2026-13-45", km: 5, type: 7 }, d: { id: "d", date: "not a date", km: 3, type: "Run" }, e: 5 }), "ultraplan-log": "{}" },
  "log with junk": { "ultraplan-log": JSON.stringify({ "2026-10-05": null, garbage: { km: "lots" }, "2026-10-12": { km: -5, hr: "x", sleep: {} } }), "ultraplan-activities": "{}" },
  "profile junk fields": { "ultraplan-profile": JSON.stringify({ ...base, maxHR: "abc", restHR: null, liftDays: "x", wellness: "nope", sched: null, startDate: "garbage" }), "ultraplan-log": "{}", "ultraplan-activities": "{}" },
  "everything is an array": { "ultraplan-profile": "[]", "ultraplan-log": "[]", "ultraplan-activities": "[]" },
};
for (const [name, stored] of Object.entries(cases)) {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(({ base, stored }) => { localStorage.setItem("ultraplan-profile", JSON.stringify(base)); localStorage.setItem("ultraplan-lang", "da"); for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v); }, { base, stored });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000); const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
  const problems = [];
  try {
    await page.goto(process.env.ULTRA_URL || "http://localhost:4174/", { waitUntil: "networkidle", timeout: 10000 }); await page.waitForTimeout(300);
    const tabs = await page.locator("nav.tabbar button").count();
    // no usable profile at all: the questionnaire starts over (the right answer), otherwise the tabs must work
    if (!tabs && !/1 af \d+/.test(await page.locator("body").innerText())) problems.push(await page.locator("body").innerText().then((x) => "neither tabs nor questionnaire: " + x.slice(0, 60)));
    for (let i = 0; i < tabs; i++) { await page.locator("nav.tabbar button").nth(i).click(); await page.waitForTimeout(200); if (await page.locator(".crash").count()) problems.push(`crash card on tab ${i}`); }
  } catch (e) { problems.push("hang or timeout: " + e.message.split("\n")[0].slice(0, 80)); }
  ok(!problems.length && !errs.length, `${name}: every tab opens${problems.length || errs.length ? " – " + [...problems, ...new Set(errs)].join(" | ") : ""}`);
  await browser.close();
}
done();
