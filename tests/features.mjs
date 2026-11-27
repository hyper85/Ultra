/* Strength log, Dagsform, Ugens gennemgang, Rekorder and the quick log. node tests/features.mjs
   - lifts.js: one weight per exercise and day, "same weight twice → next step", record, progress, bad data dropped
   - readiness.js: 100 minus traceable deductions; needs a week of daily resting HR
   - records.js: longest / biggest week / fastest, and Riegel equivalents from the best recent run
   - quicklog.js: a typed sentence fills the log form (Danish and English); nonsense fills nothing
   - UI: the kilo field on a strength day, the Dagsform card with its reasons, the weekly review (mocked AI), the
     Rekorder and Styrke panels on Fremskridt, the quick log field – on the phone without sideways scroll */
import { openApp, check, mk } from "./seed.mjs";
import { addLift, liftInfo, liftProgress, cleanLifts } from "../src/lifts.js";
import { readiness, readinessFor } from "../src/readiness.js";
import { records, equivalents, riegel, fmtRaceTime } from "../src/records.js";
import { parseQuick } from "../src/quicklog.js";
const { ok, done } = check();
const tab = (page, i) => page.locator("nav.tabbar button").nth(i).click().then(() => page.waitForTimeout(300));
const body = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// ---- engines
{
  let L = {}; for (const [d, k] of [["2026-11-09", 60], ["2026-11-02", "57,5"], ["2026-11-16", 60]]) L = addLift(L, "Squat", d, k);
  ok(JSON.stringify(L.Squat) === '[["2026-11-02",57.5],["2026-11-09",60],["2026-11-16",60]]', "lifts: sorted by day, comma decimals read");
  const i = liftInfo(L, "Squat", "2026-11-23");
  ok(i.today === null && i.last[1] === 60 && i.best === 60 && i.next === 62.5 && !i.record, "lifts: same weight twice → try 62.5");
  ok(liftInfo(addLift({}, "Curl", "2026-11-02", 8), "Curl", "2026-11-09").next === null && liftInfo({ Curl: [["2026-11-02", 8], ["2026-11-09", 8]] }, "Curl", "2026-11-16").next === 9, "lifts: one session suggests nothing; under 20 kg the step is 1 kg");
  const L2 = addLift(L, "Squat", "2026-11-23", 65);
  ok(liftInfo(L2, "Squat", "2026-11-23").record && liftProgress(L2)[0].change === 7.5 && Object.keys(addLift(L2, "Squat", "2026-11-23", "")).length === 1 && addLift(L2, "Squat", "2026-11-23", "").Squat.length === 3, "lifts: record, progress first → latest, an emptied field removes the day");
  ok(JSON.stringify(cleanLifts({ a: [["x", 1], ["2026-01-01", 20], ["2026-01-02", -3]], b: 3, c: [] })) === '{"a":[["2026-01-01",20]]}' && Object.keys(cleanLifts(null)).length === 0, "lifts: stored junk is dropped");
  let many = {}; for (let n = 1; n <= 40; n++) many = addLift(many, "X", `2026-${String(Math.ceil(n / 28)).padStart(2, "0")}-${String(((n - 1) % 28) + 1).padStart(2, "0")}`, 20 + n);
  ok(many.X.length === 30 && many.X[29][1] === 60, "lifts: the newest 30 sessions are kept");

  ok(readiness({ hr: 51, normal: 52, sleep: 7.5 }).score === 100 && readiness({ hr: 56, normal: 52 }).score === 70 && readiness({ hr: 56, normal: 52 }).level === "ok" && readiness({ hr: 59, normal: 52 }).level === "low", "readiness: +4 → 70 (hold igen), +7 → low, at normal → 100");
  const r = readiness({ hr: 56, normal: 52, sleep: 6, hrv: 40, hrvNormal: 60, acwr: 1.61 });
  ok(r.score === 100 - 30 - 10 - 20 - 20 && r.parts.map((p) => p.pts).join() === "-30,-10,-20,-20", `readiness: every point traceable (${r.score}: ${r.parts.map((p) => `${p.k} ${p.pts}`).join(", ")})`);
  ok(readiness({ hr: 50 }) === null && readiness({ hr: 90, normal: 50, sleep: 3, acwr: 2 }).score === 0, "readiness: no normal → nothing; never below 0");
  const w = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`2026-11-${String(10 + k).padStart(2, "0")}`, { hr: 50 + (k % 3), hrv: 60 }]));
  ok(readinessFor({ wellness: { ...w, "2026-11-25": { hr: 55, sleep: 6 } }, today: "2026-11-25", yesterday: "2026-11-24" }).score === 60 && readinessFor({ wellness: { ...w, "2026-11-24": { hr: 51 } }, today: "2026-11-25", yesterday: "2026-11-24" }).day === "2026-11-24" && readinessFor({ wellness: { "2026-11-25": { hr: 55 } }, today: "2026-11-25", yesterday: "2026-11-24" }) === null, "readiness: today against the 28-day median, yesterday as fallback, nothing without a week of days");

  const A = Object.fromEntries([mk("2026-09-01", 8, 50, "Run"), mk("2026-09-03", 10, 52, "Run"), { ...mk("2026-09-05", 24, 190, "Run"), vert: 620 }, mk("2026-09-06", 5, 60, "Walk"), mk("2026-09-08", 6, 2, "Run")].map((a) => [a.id, a]));
  const rec = records(A);
  ok(rec.longest.km === 24 && rec.week.km === 42 && rec.week.key === "2026-08-31" && rec.vert.m === 620 && Math.abs(rec.fastest.pace - 5.2) < 0.01 && rec.n === 4, `records: longest ${rec.longest.km}, week ${rec.week.km}, vert ${rec.vert.m}, fastest ${rec.fastest.pace.toFixed(2)} (a 6 km in 2 min is a GPS error; the walk is not a run)`);
  const eq = equivalents(A, { today: "2026-10-08" });
  ok(eq.basis.km === 10 && eq.rows.map((x) => x.km).join() === "5,10,21.1,42.2" && Math.abs(eq.rows[1].min - 52) < 0.01 && Math.abs(eq.rows[0].min - riegel(52, 10, 5)) < 0.01 && eq.rows[2].min > 52 * 2.11, "equivalents: Riegel from the best run of the last 12 weeks");
  ok(equivalents(A, { today: "2027-03-01" }) === null && equivalents({}, { today: "2026-10-08" }) === null && fmtRaceTime(24.6) === "24:36" && fmtRaceTime(112.2) === "1:52:12", "equivalents: nothing from old or missing runs; times with seconds");

  const q = (s) => JSON.stringify(parseQuick(s));
  ok(q("8 km på 48 min, føltes tungt") === '{"type":"Run","km":8,"min":48,"rpe":7}' && q("løb 12,5 km 1:05:30 rpe 6") === '{"type":"Run","km":12.5,"min":66,"rpe":6}', "quick log: km, minutes, feeling and a clock time");
  ok(q("styrke 45 min hårdt") === '{"type":"Strength","km":"","min":45,"rpe":7}' && q("gik 5 km 1 time") === '{"type":"Walk","km":5,"min":60,"rpe":""}' && q("cyklede 1 t 20 min") === '{"type":"Ride","km":"","min":80,"rpe":""}', "quick log: strength, walk and ride");
  ok(q("10k in 52:30 easy") === '{"type":"Run","km":10,"min":53,"rpe":3}' && q("ran 5 km 8/10") === '{"type":"Run","km":5,"min":"","rpe":8}', "quick log: English");
  ok(parseQuick("hej") === null && parseQuick("") === null && parseQuick("løb i dag") === null, "quick log: nothing understood → nothing filled");
}
const d = (avail) => ({ avail, time: "", note: "" }); const wk = [d("normal"), d("normal"), d("normal"), d("normal"), d("normal"), d("long"), d("normal")];
const strength = { coachMode: false, mode: "strength", style: "hybrid", gear: "gym", raceDate: "", raceKm: "", raceName: "", startDate: "2026-11-02", liftDays: [0, 2, 4], sched: { A: wk, B: wk } };
// ---- strength log on a strength day (Wednesday 25 November)
{
  const a = await openApp({ lang: "da", at: "2026-11-25T09:00:00", once: true, patch: strength });
  const first = a.page.locator(".today .ex-kg input").first();
  ok(await a.page.locator(".today .ex-kg input").count() >= 3 && await first.getAttribute("placeholder") === "–", "a strength day: a kilo field per weighted exercise");
  await first.fill("60"); await first.blur(); await a.page.waitForTimeout(300);
  const lifts = await a.page.evaluate(() => JSON.parse(localStorage.getItem("ultraplan-profile")).lifts);
  const name = Object.keys(lifts)[0];
  ok(Object.keys(lifts).length === 1 && JSON.stringify(lifts[name]) === '[["2026-11-25",60]]', `the weight is saved under the exercise (${name})`);
  await a.page.reload({ waitUntil: "networkidle" }); await a.page.waitForTimeout(400);
  ok(await a.page.locator(".today .ex-kg input").first().inputValue() === "60" && await noScroll(a.page), "after a reload the field shows today's weight; no sideways scroll");
  ok(a.errors.length === 0, `no errors ${a.errors.join(";")}`);
  await a.browser.close();
  const b = await openApp({ lang: "da", at: "2026-11-25T09:00:00", patch: { ...strength, lifts: { [name]: [["2026-11-11", 60], ["2026-11-18", 60]] } } });
  const f = b.page.locator(".today .ex-kg").first();
  ok(await f.locator("input").getAttribute("placeholder") === "62,5" && /samme vægt to gange: prøv 62,5/.test(await f.innerText()), "same weight twice: the field suggests 62,5");
  await f.locator("input").fill("65"); await f.locator("input").blur(); await b.page.waitForTimeout(300);
  ok(/Ny rekord/.test(await b.page.locator(".today .ex-kg").first().innerText()), "65 kg after 60: Ny rekord");
  await tab(b.page, 2); await b.page.locator("#lifts").waitFor({ timeout: 5000 }).catch(() => {});
  const x = await body(b.page);
  ok(/Styrke, kg/i.test(x) && /60 → 65/.test(x) && /\+5/.test(x) && await noScroll(b.page), "Fremskridt: the strength table shows first → latest and the gain");
  ok(b.errors.length === 0, `no errors ${b.errors.join(";")}`);
  await b.browser.close();
  const c = await openApp({ lang: "da", at: "2026-11-25T09:00:00", patch: { ...strength, gear: "none" } });
  ok(await c.page.locator(".ex-kg").count() === 0, "a body-weight programme has no kilo fields");
  await c.browser.close();
}
// ---- Dagsform
{
  const w = Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`2026-09-${String(20 + k > 30 ? 20 + k - 30 : 20 + k).padStart(2, "0")}`.replace(/^2026-09-(0\d)$/, "2026-10-$1"), { hr: 50, hrv: 60 }]));
  const a = await openApp({ lang: "da", patch: { wellness: { ...w, "2026-10-08": { hr: 55, sleep: 6 } } } });
  const card = a.page.locator("#readiness");
  ok(await card.count() === 1 && /53/.test(await card.locator(".rd-score").innerText()) && /hold igen i dag/i.test(await card.innerText()) && /Hvilepuls 55 \(normal 50\) · søvn 6 t/.test(await card.innerText()), `Dagsform: 100 − 37,5 − 10 = 53 (rounded), hold igen (${(await card.innerText()).replace(/\s+/g, " ").slice(0, 70)})`);
  await card.locator("summary").click(); await a.page.waitForTimeout(150);
  const open = (await card.innerText()).replace(/\s+/g, " ");
  ok(/5 over din normal \(50\) −37,5/.test(open) && /Søvn 6 t \(under 7 t koster\) −10/.test(open) && /ikke en medicinsk måling/.test(open) && await noScroll(a.page), "the reasons are behind a tap, point by point");
  ok(a.errors.length === 0, `no errors ${a.errors.join(";")}`);
  await a.browser.close();
  const b = await openApp({ lang: "da" });
  ok(await b.page.locator("#readiness").count() === 0, "without daily values from the watch there is no Dagsform");
  await b.browser.close();
  const e = await openApp({ lang: "en", patch: { wellness: { ...w, "2026-10-08": { hr: 50, sleep: 8 } } } });
  ok(/Readiness · ready for today's session/i.test(await e.page.locator("#readiness").innerText()) && /100/.test(await e.page.locator(".rd-score").innerText()), "English: Readiness 100");
  await e.browser.close();
}
// ---- Ugens gennemgang (the AI is mocked), Rekorder, quick log
{
  const a = await openApp({ lang: "da", once: true });
  const sent = [];
  await a.page.route("**/api/coach", (r) => { sent.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Godt: 20 km som planlagt.\n\nJuster: sov mere.\n\nFokus: hold de rolige ture rolige." }) }); });
  await tab(a.page, 3);
  const rev = a.page.locator("#review");
  ok(/Ugens gennemgang/i.test(await rev.innerText()) && /uge 6/.test(await rev.innerText()), "Træner: the weekly review is offered for the last full week");
  await rev.getByRole("button", { name: "Få ugens gennemgang" }).click(); await a.page.waitForTimeout(500);
  ok(/Fokus: hold de rolige ture rolige/.test(await rev.innerText()) && sent.length === 1 && /ugens gennemgang af sidste uge/.test(sent[0].question) && sent[0].history.length === 0 && !!sent[0].context?.plan, "the review asks the coach once, with the runner's numbers, and shows the answer");
  ok(!/Hammer Trail|@/.test(JSON.stringify(sent[0].context.løber || {})), "no name or email in what is sent");
  await a.page.reload({ waitUntil: "networkidle" }); await tab(a.page, 3);
  ok(/Fokus: hold de rolige ture rolige/.test(await a.page.locator("#review").innerText()) && await a.page.getByRole("button", { name: "Lav en ny" }).count() === 1, "the review is kept on the device for that week");
  await tab(a.page, 2); await a.page.locator("#records").waitFor({ timeout: 5000 }).catch(() => {});
  const x = await body(a.page);
  ok(/Rekorder/i.test(x) && /Længste tur 10 km/.test(x) && /Største uge 18 km/.test(x) && /Hurtigste tur, 5 km\+ \d:\d{2}\/km/.test(x), `Fremskridt: Rekorder (${(x.match(/Rekorder.{0,120}/i) || [""])[0]})`);
  ok(/Det kan du løbe/i.test(x) && /5 km \d{2}:\d{2} 10 km [\d:]{5,7} Halvmaraton \d:\d{2}:\d{2}/.test(x) && /Anslået ud fra din bedste tur/.test(x) && await noScroll(a.page), "Det kan du løbe: 5 and 10 km from the best run, labelled as an estimate");
  // quick log: open the chooser on today, type a sentence
  await tab(a.page, 0);
  await a.page.locator(".today .btn").first().click(); await a.page.waitForTimeout(250);
  if (await a.page.locator(".quicklog").count() === 0) { await a.page.getByRole("button", { name: "Skift" }).click(); await a.page.waitForTimeout(150); }
  const ql = a.page.locator(".quicklog input");
  await ql.fill("hej med dig"); await a.page.getByRole("button", { name: "Udfyld" }).click(); await a.page.waitForTimeout(150);
  ok(/Det forstod jeg ikke/.test(await body(a.page)) && await a.page.locator(".quicklog").count() === 1, "nonsense fills nothing and says so");
  await ql.fill("8 km på 48 min, føltes tungt"); await ql.press("Enter"); await a.page.waitForTimeout(250);
  const vals = await a.page.evaluate(() => [...document.querySelectorAll(".dayform input[type=number]")].map((i) => i.value));
  ok(vals[0] === "8" && vals[1] === "48" && vals[2] === "7" && await a.page.locator(".quicklog").count() === 0, `the sentence fills km, minutes and RPE for the runner to check (${vals.join("/")})`);
  ok(a.errors.length === 0, `no errors ${a.errors.join(";")}`);
  await a.browser.close();
}
done();
