/* How to run each session. The plan names a session ("6×2 min tærskel", "Bakker 8×90 s", "Løbstempo 2×15 min");
   this turns the name into a short, concrete instruction with the runner's own heart-rate numbers. Pure and
   deterministic, like the rest of the engine. The session names are Danish (that is what the plan stores); the
   matching stays Danish and every returned string goes through t(). */
import { t, getLang, locale } from "./i18n.js";
import { hrAt } from "./hr.js";

// hp = { maxHR, restHR }: zones by heart-rate reserve (Karvonen) when the resting HR is known, see hr.js.
const fmtHR = (hp, lo, hi) => (hp.maxHR ? ` (${hrAt(lo, hp)}–${hrAt(hi, hp)})` : "");
const reps = (q) => { const m = String(q).match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(min|s)/i); return m ? { n: +m[1], d: +m[2].replace(",", "."), unit: m[3].toLowerCase() } : null; };
const dur = (r) => (r ? `${r.d} ${r.unit === "s" ? "s" : "min"}` : "");
const restFor = (r) => (!r ? "" : r.unit === "s" ? t("60–90 s gang") : r.d <= 2 ? t("1 min rolig jog") : r.d <= 5 ? t("2 min rolig jog") : t("3 min rolig jog"));

// The words a session name is built from, longest first so "Rolig tempo" is not split into "Rolig" + "tempo".
const NAME_WORDS = ["gå/løb", "min løb", "min gang", "kun hvis smertefri", "kun roligt", "rolig tempo", "løbstempo", "stigninger", "tærskel", "på bakker", "bakker", "åbnere", "rolig"];
const NAME_RE = new RegExp(NAME_WORDS.map((w) => w.replace(/[/]/g, "\\/")).join("|"), "gi");
/* sessionName("8×2 min tærskel") -> "8×2 min threshold" in English, unchanged in Danish. */
export const sessionName = (q) => {
  const s = String(q || "");
  if (getLang() === "da") return s;
  return s.replace(NAME_RE, (m) => { const w = t(m.toLowerCase()); return m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w; });
};

/* ---- Hard sessions as steps ----
   Every hard session is a list of steps: warm-up, the main work (reps, recoveries, blocks) and cool-down. The text on
   the card and the day's km come from the same list, so the steps always add up to the km shown.
   Paces are the runner's easy pace (min/km) × a factor per kind of step: warm-up, cool-down and jog recoveries at the
   easy pace, the work at the zone's pace. Default warm-up 15 min, cool-down 10 min, both Z1–Z2.
   sessionSteps(quality, { easyPaceMinKm, km }) -> { kind, zone, steps: [{ key, min, f, km }], wu, cd, km, over } or
   null for a day that is not a hard session (easy, walk/run, strides at the end of an easy run).
   With `km` (the coach's number for the day) the warm-up and cool-down are sized so the steps fill exactly that
   (at least 10 + 5 min); `over` is true when even that does not fit, and km is then the steps' own total. */
export const WARMUP_MIN = 15, COOLDOWN_MIN = 10;
const WU_MIN = 10, CD_MIN = 5;
const F = { jog: 1, walk: 1.8, stride: 0.6, tempo: 0.82, threshold: 0.78, hill: 0.9, race: 0.95, opener: 0.8, steady: 0.9, hard: 0.78 };
export const DEFAULT_EASY_PACE = 6.25;
// Easy pace by level when the log has none yet (min/km), the same table as race.js.
export const easyPaceFor = (level) => ({ 1: 7.0, 2: 6.25, 3: 5.75, 4: 5.25 })[level] || DEFAULT_EASY_PACE;
const minOf = (r) => (r.unit === "s" ? r.d / 60 : r.d);
const oneMin = (s) => { const m = String(s).match(/(\d+(?:[.,]\d+)?)\s*min/i); return m ? +m[1].replace(",", ".") : null; };
const restMin = (r) => (r.unit === "s" ? 1.25 : r.d <= 2 ? 1 : r.d <= 5 ? 2 : 3);
// n reps of `min` at factor f with `gap` minutes at factor gf between them
const repsOf = (n, min, f, gap, gf, key) => { const out = []; for (let i = 0; i < n; i++) { out.push({ key, min, f }); if (gap && i < n - 1) out.push({ key: "rest", min: gap, f: gf }); } return out; };

// The main work of a hard session, by name: kind, zone, steps and the sentence that says them.
function mainOf(q) {
  const ql = q.toLowerCase(); const r = reps(q);
  if (!q || /kun roligt|gå\/løb/.test(ql) || /^rolig \d+ min/.test(ql)) return null;
  if (/rolig tempo/.test(ql)) { const d = oneMin(q) || 15; return { kind: "steady", zone: "Z2–Z3", steps: [{ key: "steady", min: d, f: F.steady }], say: t("Derefter {d} min jævn, rolig fart.", { d }) }; }
  if (/tærskel/.test(ql)) {
    if (!r) return { kind: "threshold", zone: "Z4 · 80–90 %", steps: [{ key: "work", min: 20, f: F.threshold }], say: t("Derefter {q} i tærskelfart.", { q: sessionName(q) }) };
    return { kind: "threshold", zone: "Z4 · 80–90 %", steps: repsOf(r.n, minOf(r), /bakke/.test(ql) ? F.hill : F.threshold, restMin(r), r.unit === "s" ? F.walk : F.jog, "work"), say: t("Derefter {n} × {dur} i tærskelfart med {rest} imellem.", { n: r.n, dur: dur(r), rest: restFor(r) }) };
  }
  if (/løbstempo/.test(ql)) {
    const rr = r || { n: 1, d: oneMin(q) || 20, unit: "min" };
    return { kind: "racepace", zone: "Z2–Z3 · 70–78 %", steps: repsOf(rr.n, minOf(rr), F.race, 5, F.jog, "work"), say: rr.n > 1 ? t("Derefter {n} × {dur} i løbstempo med 5 min rolig imellem.", { n: rr.n, dur: dur(rr) }) : t("Derefter {dur} i løbstempo.", { dur: dur(rr) }) };
  }
  if (/åbnere/.test(ql)) {
    const rr = r || { n: 3, d: 1, unit: "min" };
    return { kind: "openers", zone: "Z3–Z4", steps: repsOf(rr.n, minOf(rr), F.opener, 2, F.jog, "work"), say: t("Derefter {n} × {dur} lidt hurtigere end løbstempo med 2 min rolig jog imellem.", { n: rr.n, dur: dur(rr) }) };
  }
  const tempoOf = (txt) => { const tr = reps(txt); if (tr) return { steps: repsOf(tr.n, minOf(tr), F.tempo, 3, F.jog, "work"), say: t("{n} × {dur} tempo med 3 min rolig jog imellem", { n: tr.n, dur: dur(tr) }) }; const d = oneMin(txt) || 20; return { steps: [{ key: "work", min: d, f: F.tempo }], say: t("{d} min tempo i ét stræk", { d }) }; };
  if (/^stigninger\s*\+/.test(ql)) {
    const tp = tempoOf(q.match(/\+\s*(.+)$/)?.[1] || "");
    return { kind: "strides-tempo", zone: "Z3–Z4", steps: [...repsOf(5, 20 / 60, F.stride, 40 / 60, F.walk, "stride"), { key: "rest", min: 2, f: F.jog }].map((x) => ({ ...x, g: "strides" })).concat(tp.steps),
      say: t("Derefter 4–6 stigninger à 20 s (glidende fart op til cirka 90 % af sprint, gang tilbage) og 2 min rolig jog. Så {tempo}.", { tempo: tp.say }) };
  }
  if (/stigninger/.test(ql)) return null; // strides at the end of an easy run
  if (/bakker/.test(ql)) {
    const rr = r || { n: 8, d: 90, unit: "s" };
    return { kind: "hills", zone: "Z4–Z5", steps: repsOf(rr.n, minOf(rr), F.hill, minOf(rr), F.jog, "work"), say: t("Derefter {n} × {dur} op ad bakken i hård, kontrolleret fart. Jog roligt ned som pause.", { n: rr.n, dur: dur(rr) }) };
  }
  if (/tempo/.test(ql)) { const tp = tempoOf(q); return { kind: "tempo", zone: "Z3–Z4 · 75–85 %", steps: tp.steps, say: t("Derefter {tempo}.", { tempo: tp.say }) }; }
  return { kind: "hard", zone: "Z4", steps: [{ key: "work", min: 20, f: F.hard }], say: t("Derefter selve passet: {q}, cirka 20 min.", { q: sessionName(q) }) };
}

const r2 = (x) => Math.round(x * 100) / 100;
export function sessionSteps(quality, { easyPaceMinKm, km } = {}) {
  const q = String(quality || "").trim(); const m = mainOf(q);
  if (!m) return null;
  const E = easyPaceMinKm > 0 ? easyPaceMinKm : DEFAULT_EASY_PACE;
  const kmOf = (min, f) => min / (E * f);
  const core = m.steps.reduce((a, st) => a + kmOf(st.min, st.f), 0);
  let wu = WARMUP_MIN, cd = COOLDOWN_MIN, over = false;
  if (km > 0) { // fit the coach's km: warm-up and cool-down take what is left, 60/40, at least 10 + 5 min
    const easyMin = Math.round((km - core) * E);
    if (easyMin >= WU_MIN + CD_MIN) { wu = Math.max(WU_MIN, Math.round(easyMin * 0.6)); cd = Math.max(CD_MIN, easyMin - wu); }
    else { wu = WU_MIN; cd = CD_MIN; over = true; }
  }
  const steps = [{ key: "warmup", min: wu, f: F.jog }, ...m.steps, { key: "cooldown", min: cd, f: F.jog }].map((st) => ({ ...st, km: r2(kmOf(st.min, st.f)) }));
  const total = steps.reduce((a, st) => a + kmOf(st.min, st.f), 0);
  return { kind: m.kind, zone: m.zone, say: m.say, steps, wu, cd, over, km: Math.round(total * 2) / 2, exact: r2(total) };
}

export function describeSession(quality, { maxHR, restHR, easyPace, easyPaceMinKm, km } = {}) {
  const hp = { maxHR, restHR };
  const q = String(quality || "").trim(); const ql = q.toLowerCase();
  const cap = hrAt(0.7, hp);
  const easy = t("Rolige ture under {cap} i puls{pace}.", { cap: cap ?? t("70 % af makspuls"), pace: easyPace ? t(" – dit rolige tempo ligger typisk omkring {pace}/km", { pace: easyPace }) : "" });
  if (!q || /kun roligt/.test(ql)) return { kind: "easy", zone: "Z2", text: t("Ingen hård session i denne uge. {easy}", { easy }) };
  if (/gå\/løb/.test(ql)) {
    const m = q.match(/(\d+)\s*×\s*\((\d+)\s*min løb\s*\/\s*(\d+)\s*min gang\)/i);
    const spec = m ? t("{n} × ({run} min løb / {walk} min gang)", { n: m[1], run: m[2], walk: m[3] }) : sessionName(q);
    return { kind: "walkrun", zone: "Z1–Z2", text: t("Gå/løb: {spec}. Løb i snakketempo, og gangen er en del af passet, ikke en pause. Blødt underlag. Gør det ondt på en måde, der ændrer dit skridt, så stop.", { spec }) };
  }
  if (/^rolig \d+ min/.test(ql)) return { kind: "easy", zone: "Z2", text: t("{q}. Puls under {cap}. Stigninger til sidst er 15 s glidende fart, ikke sprint. Stop ved smerte, der ændrer skridtet.", { q: sessionName(q), cap: cap ?? "70 %" }) };
  const st = sessionSteps(q, { easyPaceMinKm, km });
  if (!st) { const r = reps(q); return { kind: "strides", zone: t("teknik"), text: t("Stigninger er {set}, hvor du øger farten glidende til cirka 90 % af sprint og holder den let og høj i kadence, med 60–90 s gang imellem. Pulsen når ikke at komme op – det træner frekvens og teknik. Læg dem sidst i en rolig tur.", { set: r ? `${r.n} × ${dur(r)}` : "20 s" }) }; }
  // What the work is and how it should feel, after the steps.
  const ABOUT = {
    steady: () => t("Hele sætninger, puls under 80 %{hr}. Ingen bakker, ingen spurter.", { hr: fmtHR(hp, 0.7, 0.8) }),
    threshold: () => t(`Tærskel er den fart, du kan holde i cirka en time: puls 80–90 %{hr}, "behageligt hårdt", du kan sige korte sætninger.{hills} Første interval skal føles for let.`, { hr: fmtHR(hp, 0.8, 0.9), hills: /bakke/.test(ql) ? t(" Løb dem op ad en jævn stigning: korte skridt, kraft fra hoften, jog ned som pause.") : "" }),
    racepace: () => t("Løbstempo er den fart, du kan holde hele løbet: puls 70–78 %{hr}, gå stigningerne som på løbsdagen. Helst på trail i de sko, du skal løbe i. Øv at spise og drikke undervejs.", { hr: fmtHR(hp, 0.7, 0.78) }),
    openers: () => t("Åbnere vækker benene uden at trætte dem."),
    "strides-tempo": () => t("Tempo er jævn fart lige under tærskel: puls 75–85 %{hr}.", { hr: fmtHR(hp, 0.75, 0.85) }),
    hills: () => t("Find en bakke på 5–8 %. Pulsen ender omkring 90 %{hr} i toppen. Korte skridt, høj kadence, kig 10 m frem.", { hr: fmtHR(hp, 0.88, 0.92) }),
    tempo: () => t("Tempo er jævn fart lige under tærskel: puls 75–85 %{hr}, du kan sige en sætning, ikke to. Den typiske fejl er at starte for hurtigt.", { hr: fmtHR(hp, 0.75, 0.85) }),
    hard: () => t("Selve passet i puls 80–90 %{hr}.", { hr: fmtHR(hp, 0.8, 0.9) }),
  };
  const kmTxt = (x) => x.toLocaleString(locale(), { maximumFractionDigits: 1 });
  const total = st.over ? t("Trinene fylder ca. {km} km – mere end planens {plan} km. Skær hellere et interval væk end opvarmningen.", { km: kmTxt(st.km), plan: kmTxt(km) }) : t("I alt ca. {km} km.", { km: kmTxt(km > 0 ? km : st.km) });
  const about = ABOUT[st.kind]();
  const text = [t("{min} min rolig opvarmning (Z1–Z2).", { min: st.wu }), st.say, t("Til sidst {min} min rolig nedjog (Z1–Z2).", { min: st.cd }), total, about].join(" ");
  // The same steps grouped for the card's step list: warm-up, strides, the work (reps and recoveries), cool-down.
  const group = (x) => (x.key === "warmup" || x.key === "cooldown" ? x.key : x.g || "main");
  const parts = [];
  for (const x of st.steps) { const k = group(x); const last = parts[parts.length - 1]; if (last && last.key === k) { last.min += x.min; last.km += x.km; } else parts.push({ key: k, min: x.min, km: x.km }); }
  const mainLabel = sessionName(q.replace(/^stigninger\s*\+\s*/i, "")) || sessionName(q);
  const LABEL = { warmup: t("Opvarmning"), strides: t("Stigninger 4–6 × 20 s"), main: mainLabel.charAt(0).toUpperCase() + mainLabel.slice(1), cooldown: t("Nedjog") };
  const ZONE = { warmup: "Z1–Z2", strides: t("glidende fart"), main: st.zone, cooldown: "Z1–Z2" };
  for (const pt of parts) { pt.label = LABEL[pt.key]; pt.zone = ZONE[pt.key]; pt.min = Math.round(pt.min); pt.km = Math.round(pt.km * 10) / 10; }
  return { kind: st.kind, zone: st.zone, text, parts, total, about, steps: st.steps, km: km > 0 && !st.over ? km : st.km, over: st.over };
}

// Guidance for the two other kinds of days the plan has.
export const describeLong = ({ km, carbs, maxHR, restHR, phase }) => t("Lang tur på {km} km: puls under {hr} det meste af vejen, gå stigningerne, {carbs} g kulhydrat i timen fra minut 30.{kit}", { km, hr: hrAt(0.75, { maxHR, restHR }) ?? "75 %", carbs, kit: phase === "Ultra-prep" ? t(" Test kit, lygte og mad som på løbsdagen.") : "" });
export const describeEasy = ({ km, maxHR, restHR, easyPace }) => t("{km} km i snakketempo, puls under {hr}{pace}. Skal føles for langsomt.", { km, hr: hrAt(0.7, { maxHR, restHR }) ?? "70 %", pace: easyPace ? t(" (ca. {pace}/km)", { pace: easyPace }) : "" });
export const fmtPace = (minKm) => { if (!(minKm > 0)) return null; const sec = Math.round(minKm * 60); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };

/* longRunPlan({ km, easyPaceMinKm, phase, raceKm, raceVert }) -> one line with the run's likely duration, carbohydrate
   to bring (50 g/h in build, 70 g/h in ultra-prep, 25 g per gel), drink, and a climb target when the race has one
   (60 % of the race's m/km over the run's distance, rounded to 50). null when the run is under 75 minutes. */
export const longRunPlan = ({ km, easyPaceMinKm, phase, raceKm, raceVert }) => {
  const pace = easyPaceMinKm > 0 ? easyPaceMinKm * 1.08 : 7; // long runs go a little slower than the easy pace
  const min = km * pace;
  if (!(min >= 75)) return null;
  const hours = min / 60; const gph = phase === "Ultra-prep" ? 70 : 50;
  const g = Math.round((hours * gph) / 10) * 10; const gels = Math.ceil(g / 25);
  const l = (Math.round(hours * 5) / 10).toLocaleString(locale(), { maximumFractionDigits: 1 });
  const mm = Math.round(min); const time = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`; // round first: never "1:60"
  const climb = raceVert > 0 && raceKm > 0 && phase !== "Genopbygning" ? Math.round((km * (raceVert / raceKm) * 0.6) / 50) * 50 : 0;
  return t("Ca. {time} · ~{g} g kulhydrat ≈ {gels} geler · {l} l at drikke{climb}", { time, g, gels, l, climb: climb >= 100 ? t(" · sigt efter ~{m} m+", { m: climb }) : "" });
};
