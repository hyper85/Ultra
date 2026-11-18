/* Hard sessions are steps: warm-up (15 min, Z1–Z2) + work + recoveries + cool-down (10 min, Z1–Z2). The card's text
   and the day's km come from the same list, so they always add up. On the app's own plan the hard day's km IS the
   steps' total; on the coach plan the coach's km stays (a ceiling) and the warm-up and cool-down are sized to fill it.
   node tests/hard-sessions.mjs */
import { openApp, check } from "./seed.mjs";
const { ok, done } = check();
const { sessionSteps, describeSession } = await import("../src/sessions.js");
// every hard-session name the app plan and the coach plan produce
const TEMPLATES = ["6×2 min tærskel", "8×2 min tærskel", "5×3 min tærskel", "3×10 min tærskel", "3×10 min tærskel", "6×3 min tærskel på bakker", "8×2 min tærskel på bakker",
  "20 min tempo", "25 min tempo", "2×15 min tempo", "2×12 min tempo", "2×20 min tempo", "Stigninger + 10 min tempo", "Stigninger + 2×10 min tempo", "Stigninger + Tempo",
  "Bakker 6×90 s", "Bakker 8×90 s", "Bakker 8×90s", "Løbstempo 2×15 min", "Løbstempo 2×10 min", "Åbnere 3×1 min", "Åbnere 4×2 min",
  "Rolig tempo 12 min", "Rolig tempo 15 min", "2×12 min tempo", "Fartleg 30 min"];
const sum = (st) => st.steps.reduce((a, x) => a + x.km, 0);
for (const q of TEMPLATES) for (const pace of [5.25, 6.25, 7]) {
  const st = sessionSteps(q, { easyPaceMinKm: pace });
  const g = describeSession(q, { easyPaceMinKm: pace, maxHR: 188, restHR: 48 });
  const bad = !st || Math.abs(st.km - sum(st)) > 0.3 || !/opvarmning/.test(g.text) || !/nedjog/.test(g.text) || st.steps[0].key !== "warmup" || st.steps.at(-1).key !== "cooldown" || st.wu !== 15 || st.cd !== 10;
  if (bad || pace === 6.25) ok(!bad, `${q} @ ${pace}: ${st?.km} km = steps ${st ? sum(st).toFixed(2) : "?"} · ${g.text.slice(0, 60)}…`);
}
// fitted to a coach's km: the steps fill exactly that, or the text says they do not fit
for (const q of TEMPLATES) {
  const g = describeSession(q, { easyPaceMinKm: 6.25, km: 8 });
  const s8 = g.steps.reduce((a, x) => a + x.km, 0);
  ok(g.over ? /mere end planens 8 km/.test(g.text) : Math.abs(s8 - 8) <= 0.3 && /I alt ca\. 8 km/.test(g.text), `${q} fitted to 8 km: ${g.over ? "over – said so" : `steps ${s8.toFixed(2)} km`}`);
}
ok(sessionSteps("Kun roligt") === null && sessionSteps("Stigninger 6×20 s") === null && sessionSteps("Gå/løb 8×(3 min løb / 1 min gang)") === null && sessionSteps("Rolig 30 min + stigninger 4×15 s") === null, "easy days, walk/run and strides after an easy run are not hard sessions");
// the screen: coach plan, Wednesday 18 Nov "Stigninger + 10 min tempo", 7 km
{
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-18T07:00:00" });
  const txt = (await page.locator(".today").innerText()).replace(/\s+/g, " ");
  const steps = await page.locator(".today .step").allInnerTexts();
  const mins = steps.map((x) => +(x.match(/(\d+) min/) || [])[1]); const kms = steps.map((x) => +((x.match(/([\d,]+) km/) || [])[1] || "0").replace(",", "."));
  ok(/^Opvarmning/.test(steps[0]) && /^Stigninger/.test(steps[1]) && /^10 min tempo/.test(steps[2]) && /^Nedjog/.test(steps[3]) && mins[0] === 15 && mins[3] === 10, `Wed 18 Nov: step list warm-up 15 · strides · tempo · cool-down 10 (${steps.map((x) => x.replace(/\s+/g, " ")).join(" | ")})`);
  ok(/\b7\s*km\b/.test(txt) && /I alt ca\. 7 km/.test(txt) && Math.abs(kms.reduce((a, b) => a + b, 0) - 7) <= 0.3, `Wed 18 Nov: 7 km and the steps add up to it (${kms.join(" + ")})`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
// the screen: the app's own plan – the hard day's km is the steps' total
{
  const d = (avail) => ({ avail, time: "", note: "" });
  const week = [d("normal"), d("none"), d("normal"), d("normal"), d("none"), d("long"), d("normal")];
  const { browser, page, errors } = await openApp({ lang: "da", at: "2026-11-18T07:00:00", patch: { coachMode: false, qualityDay: 2, longDay: 5, maxRunDays: 4, sched: { A: week, B: week } } });
  const txt = (await page.locator(".today").innerText()).replace(/\s+/g, " ");
  const shown = +((txt.match(/(\d+(?:\.\d)?)\s*km/) || [])[1]); const said = +(((txt.match(/I alt ca\. (\d+(?:,\d)?) km/) || [])[1] || "").replace(",", "."));
  ok(/opvarmning/i.test(txt) && shown > 0 && shown === said, `app plan: the hard day shows ${shown} km and its steps say ${said} km`);
  ok(errors.length === 0, `no errors ${errors.join(";")}`);
  await browser.close();
}
done();
