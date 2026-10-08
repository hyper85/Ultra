import { useMemo, useState } from "react";
import { ymd, parseLocal, mondayOf, addDays } from "./import.js";
import { activeCoachPlan } from "./coachplan.js";
import { BODY, GEAR, pickLiftDays } from "./strength.js";
import { RACES, vertFor, distanceKm, myPosition } from "./races.js";
import { t, locale } from "./i18n.js";
import LangSwitch from "./LangSwitch.jsx";
import { INJURY, AREAS, DIETS, INTOL } from "./options.js";
export { INJURY, AREAS, DIETS, INTOL };

// The coach's own plan (coach-plan.json) as a card next to the three computed models: fixed weeks and dates.
const coachCard = (coachPlan) => {
  const W = coachPlan.week, rows = coachPlan.weeks, today = ymd(mondayOf(new Date()));
  const now = rows.filter((w) => w.start <= today).length;
  return { key: "coach", name: "Trænerplan", topKm: Math.max(...rows.filter((w) => !w.race).map((w) => w.km)), longest: Math.max(...rows.filter((w) => !w.race).map((w) => w.days[W.longDay])),
    runDays: W.runDays.length, weeks: rows.length, start: parseLocal(rows[0].start), now: now >= 1 && now <= rows.length ? now : null, first: rows[0].km, race: coachPlan.race.name };
};

/* First-login questionnaire. Six short screens, one topic each, ending in a choice between three
   plan models computed from the answers. See docs/ux-first-login.md for the brief.
   All labels below are Danish keys for t(): they are wrapped where they are rendered, never at module level. */

const GOALS = [
  ["finish", "Gennemføre", "Kom i mål hel og glad. Kvaliteten holdes moderat."],
  ["perform", "Gennemføre på tid", "Lidt mere kvalitet, lidt mere mad på de hårde dage."],
];
const LIFTS = [[0, "Ingen"], [1, "1 pas"], [2, "2 pas"], [3, "3 pas"]];
const MODELS = [
  { key: "min", name: "Minimum", dLevel: 0, dDays: 0, peakScale: 0.8, who: "Samme dage, lavere top (80 %). Til dig med lidt tid eller skavanker." },
  { key: "bal", name: "Balanceret", dLevel: 0, dDays: 0, peakScale: 1, who: "Den vi anbefaler ud fra dine svar. Stiger roligt fra din base." },
  { key: "vol", name: "Volumen", dLevel: 0, dDays: 0, peakScale: 1.15, who: "Samme dage, højere top (115 %). Kræver disciplin med søvn og mad." },
];
const PACE = { 1: 7.0, 2: 6.25, 3: 5.75, 4: 5.25 }; // min/km used only for the hours estimate
// Stored in the profile as Danish strings (the plan engine reads them); shown through t().
// Practical food suggestions that follow the diet the user actually eats. Filtered on the Danish text (the
// intolerance keys are Danish), translated on the way out; called at render time, so t() is current.
export const dietTips = (diet = "all", intol = []) => {
  const no = (x) => intol.some((i) => x.toLowerCase().includes(i.toLowerCase()));
  const protein = {
    all: ["Kylling og kalkun", "Fisk 2–3 gange om ugen", "Æg", "Skyr og kvark", "Bønner og linser"],
    veg: ["Æg", "Skyr, kvark og hytteost", "Tofu og tempeh", "Bønner, linser og kikærter", "Proteinpulver (valle eller ært)"],
    vegan: ["Tofu og tempeh", "Linser, bønner og kikærter", "Seitan", "Sojaskyr", "Ærteprotein-pulver"],
    lowcarb: ["Kød, fisk og æg", "Skyr og ost", "Nødder og frø", "Grønt med olie", "Bønner i små mængder"],
  }[diet] || [];
  const fuel = {
    all: ["Gels eller sportsdrik", "Bananer og dadler", "Rosiner og vingummi", "Rugbrød med honning til de lange ture"],
    veg: ["Gels eller sportsdrik", "Bananer og dadler", "Rosiner", "Rugbrød med honning"],
    vegan: ["Veganske gels (tjek etiketten)", "Dadler og figner", "Rosiner og tørret mango", "Havregrød med sirup før lange ture"],
    lowcarb: ["Lav-kulhydrat i hverdagen, men 40–90 g kulhydrat/time på ture over 90 min", "Dadler og gels på den lange tur", "Øv maven på det i træning, ikke på løbsdagen"],
  }[diet] || [];
  const swaps = [];
  if (intol.includes("Laktose")) swaps.push(t("Skift skyr og mælk til laktosefri eller havre-/sojaprodukter."));
  if (intol.includes("Gluten")) swaps.push(t("Rugbrød og havre byttes til glutenfri havre, ris og kartofler. Tjek gels for hvede."));
  if (intol.includes("Nødder")) swaps.push(t("Frø (græskar, solsikke) i stedet for nødder."));
  return { protein: protein.filter((x) => !no(x)).map((x) => t(x)), fuel: fuel.filter((x) => !no(x)).map((x) => t(x)), swaps };
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Everyday-schedule presets: most people only need to correct the exceptions.
const D = (avail, time = "") => ({ avail, time, note: "" });
export const PRESETS = [
  ["most", "Tid de fleste dage", () => [D("normal", "morning"), D("none"), D("normal"), D("normal"), D("none"), D("long"), D("normal")]],
  ["weekend", "Weekend + to hverdage", () => [D("none"), D("normal", "evening"), D("none"), D("normal", "evening"), D("none"), D("long"), D("normal")]],
  ["all", "Alle dage", () => [D("normal"), D("normal"), D("normal"), D("normal"), D("normal"), D("long"), D("normal")]],
];
const presetKey = (sched) => PRESETS.find(([, , mk]) => mk().every((x, i) => x.avail === sched?.[i]?.avail))?.[0] || null;

export const goalKcal = (bmr, goal) => {
  const adj = goal === "lean" ? -300 : 0;
  const q = goal === "perform" ? 100 : 0;
  const rows = [[t("Lang tur / løbsdag"), bmr * 1.95 + adj], [t("Kvalitet / styrke"), bmr * 1.7 + adj + q], [t("Rolig løbedag"), bmr * 1.45 - 400 + adj], [t("Hviledag"), bmr * 1.3 - 450 + adj]];
  return rows.map(([n, c]) => [n, Math.max(Math.round(bmr * 1.15 / 10) * 10, Math.round(c / 10) * 10)]);
};
export const proteinG = (weight, body) => Math.round(weight * (body === "lean" ? 2.2 : 2));

// The panels, in order: the welcome screen and the diet step are gone (diet lives under Mere → Kost).
const ORDER = [1, 2, 3, 4, 5, 7];
export default function Onboarding({ initial, DAYS, AVAIL, LEVELS, buildPlan, onDone, rerun }) {
  const [step, setStep] = useState(1);
  const idx = ORDER.indexOf(step);
  const [pos, setPos] = useState(null); const [posMsg, setPosMsg] = useState(null);
  const findNear = async () => { setPosMsg(t("Finder din position…")); const p0 = await myPosition(); if (!p0) { setPos(null); setPosMsg(t("Kunne ikke få din position. Tillad placering i browseren, eller vælg et løb i listen.")); return; } setPos(p0); setPosMsg(null); };
  const raceList = pos ? [...RACES].map((r) => ({ ...r, dist: distanceKm(pos.lat, pos.lon, r.lat, r.lon) })).sort((a, b) => a.dist - b.dist) : RACES;
  const [d, setD] = useState(() => ({ ...initial, body: initial.body || "keep", gear: initial.gear || "home", liftCount: initial.liftDays ? initial.liftDays.length : 2, startDate: rerun ? initial.startDate : ymd(mondayOf(new Date())) }));
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value });
  const setDay = (i, patch) => { const A = (d.sched?.A || []).map((x, j) => (j === i ? { ...x, ...patch } : x)); const longs = A.map((x, j) => (x.avail === "long" ? j : -1)).filter((j) => j >= 0); setD({ ...d, sched: { ...(d.sched || {}), A, B: d.sched?.B || A.map((x) => ({ ...x })) }, ...(longs.length === 1 ? { longDay: longs[0] } : {}) }); };
  const STEPS = ["Velkommen", "Løbet", "Dig", "Din form", "Din krop", "Din hverdag", "Kost", "Din plan"];
  const shortDate = (date) => date.toLocaleDateString(locale(), { day: "numeric", month: "short" });

  const maxHR = d.maxHR || Math.round(d.sex === "f" ? 206 - 0.88 * (d.age || 40) : 211 - 0.64 * (d.age || 40));
  const weeksToRace = d.raceDate ? Math.floor(Math.round((parseLocal(d.raceDate) - parseLocal(d.startDate)) / 86400000) / 7) + 1 : null;
  const raceOk = !!d.raceDate && parseLocal(d.raceDate) > new Date();

  const variant = (m) => ({ ...d, level: clamp((d.level || 2) + m.dLevel, 1, 4), maxRunDays: clamp((d.maxRunDays || 4) + m.dDays, 3, 6), peakScale: m.peakScale });
  const models = useMemo(() => MODELS.map((m) => {
    const v = variant(m); const plan = buildPlan(v);
    const topKm = Math.max(...plan.rows.filter((r) => !r.isRace).map((r) => r.km)); const longest = Math.max(...plan.rows.filter((r) => !r.isRace).map((r) => r.lng));
    const short = plan.rows.filter((r) => r.unplaced >= 3).length;
    const hours = Math.round((topKm * PACE[v.level]) / 60 * 10) / 10;
    const first = plan.rows.slice(0, 4).reduce((a, r) => a + r.km, 0) / Math.min(4, plan.rows.length);
    return { ...m, v, plan, topKm, longest, hours, short, first: Math.round(first) };
  }), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const balanced = useMemo(() => buildPlan({ ...d, level: d.level || 2, peakScale: 1 }), [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = step === 1 ? raceOk && +d.raceKm > 0 : step === 2 ? d.age > 0 && d.weight > 0 && d.height > 0 : step === 3 ? d.currentKm > 0 : true;
  const next = () => setStep((s) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)]);
  const back = () => setStep((s) => ORDER[Math.max(0, ORDER.indexOf(s) - 1)]);
  const liftDaysFor = (x) => pickLiftDays(x.sched?.A || [], { longDay: x.longDay, qualityDay: x.qualityDay ?? 2, count: x.liftCount ?? 2 });
  const finish = (x) => { const { liftCount, ...rest } = x; return { ...rest, liftDays: liftDaysFor(x), onboarded: true }; };
  const choose = (m) => onDone({ ...finish(m.v), coachMode: false });
  // Same race as the coach's plan (or already on it): offer the coach's fixed weeks as the first choice.
  const coachPlan = activeCoachPlan(initial);
  const coach = d.raceDate === coachPlan.race.date || initial.coachMode !== false ? coachCard(coachPlan) : null;
  const chooseCoach = () => onDone({ ...finish(d), raceName: coachPlan.race.name, raceDate: coachPlan.race.date, raceKm: coachPlan.race.km, raceVert: coachPlan.race.vert, startDate: coachPlan.weeks[0].start, coachMode: true });
  const sched = d.sched?.A || [];
  const longDays = DAYS.map((n, i) => [n, i]).filter(([, i]) => sched[i]?.avail === "long");
  // On the first step there is nothing to go back to: a rerun gets "Annuller" (profile unchanged), a first run no button.
  const navBtns = (last) => <div className="ob-nav">{idx === 0 ? (rerun ? <button className="btn ghost" onClick={() => onDone(initial)}>{t("Annuller")}</button> : <span />) : <button className="btn ghost" onClick={back}>{t("Tilbage")}</button>}{last === undefined ? <button className="btn" onClick={next} disabled={!canNext}>{t("Næste")}</button> : last}</div>;

  return (
    <div className="ob">
      <div className="ob-head">
        <h1>Ultraplan</h1>
        <div className="ob-progress" aria-label={t("Trin {step} af {n}", { step: idx + 1, n: ORDER.length })}><span style={{ width: `${((idx + 1) / ORDER.length) * 100}%` }} /></div>
        <div className="muted">{t("{step} af {n} · {title}", { step: idx + 1, n: ORDER.length, title: t(STEPS[step]) })}</div>
      </div>

      {step === 1 && (
        <section className="panel ob-panel" style={{ position: "relative" }}>
          <LangSwitch className="corner" />
          <h2 style={{ paddingRight: 150 }}>{t("Løbet")}</h2>
          {rerun && <p className="muted">{t("Dine nuværende svar er udfyldt på forhånd.")}</p>}
          <div className="row-between"><span className="muted">{t("Vælg et kendt løb, eller skriv dit eget.")}</span><button type="button" className="linkbtn" onClick={findNear}>{pos ? t("Sorteret efter afstand") : t("Find løb nær mig")}</button></div>
          {posMsg && <div className="muted" style={{ marginTop: 4 }}>{posMsg}</div>}
          <div className="chips race-chips">{raceList.map((r) => <button key={r.name} type="button" className={d.raceName === r.name ? "on" : ""} onClick={() => setD({ ...d, raceName: r.name, raceKm: r.km[r.km.length - 1], raceVert: vertFor(r, r.km[r.km.length - 1]) })}>{r.name}{r.dist != null ? <span className="muted"> · {r.dist} km</span> : null}</button>)}</div>
          {(() => { const r = RACES.find((x) => x.name === d.raceName); return r ? (
            <div className="advice">
              <div>{r.where} · {r.url}</div>
              <div className="chips" style={{ marginTop: 6 }}>{r.km.map((k) => <button key={k} type="button" className={+d.raceKm === k ? "on" : ""} onClick={() => setD({ ...d, raceKm: k, raceVert: vertFor(r, k) })}>{k === 83 ? "50 miles" : k === 161 ? "100 miles" : `${k} km`}</button>)}</div>
              <div className="muted" style={{ marginTop: 6 }}>{t("Tjek årets dato på løbets side og skriv den herunder. Højdemeter er et skøn.")}</div>
            </div>) : null; })()}
          <label>{t("Navn på løbet")}<input value={d.raceName} onChange={set("raceName")} placeholder={t("fx Hammer Trail Winter 50 miles")} /></label>
          <div className="row2">
            <label>{t("Løbsdato")}<input type="date" value={d.raceDate} onChange={set("raceDate")} min={ymd(addDays(new Date(), 1))} required /></label>
            <label>{t("Distance (km)")}<input type="number" inputMode="decimal" value={d.raceKm} onChange={set("raceKm")} placeholder={t("fx 50")} /></label>
          </div>
          <label>{t("Højdemeter (valgfri)")}<input type="number" inputMode="numeric" value={d.raceVert} onChange={set("raceVert")} placeholder={t("fx 1200")} /></label>
          {d.raceDate && !raceOk && <div className="advice warn">{t("Datoen skal ligge efter i dag.")}</div>}
          {raceOk && weeksToRace < 8 && <div className="advice warn">{t("Kun {n} uger til løbet. Planen bliver komprimeret til minimum 8 uger, så hold igen med ambitionerne.", { n: weeksToRace })}</div>}
          {raceOk && weeksToRace >= 8 && <div className="muted" style={{ marginTop: 8 }}>{t("{n} uger fra mandag {date} til løbet.", { n: weeksToRace, date: shortDate(parseLocal(d.startDate)) })}</div>}
          <div className="muted" style={{ marginTop: 12 }}>{t("Hvad vil du med det?")}</div>
          <div className="ob-cards">
            {GOALS.map(([k, n, s]) => <button key={k} type="button" className={d.goal === k ? "on" : ""} onClick={() => setD({ ...d, goal: k })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
          </div>
          {navBtns()}
        </section>
      )}

      {step === 2 && (
        <section className="panel ob-panel">
          <h2>{t("Dig")}</h2>
          <p className="muted">{t("Bruges til pulszoner og kalorier. Intet af det deles.")}</p>
          <div className="row2">
            <label>{t("Køn")}<select value={d.sex} onChange={set("sex")}><option value="m">{t("Mand")}</option><option value="f">{t("Kvinde")}</option><option value="x">{t("Andet")}</option></select></label>
            <label>{t("Alder")}<input type="number" inputMode="numeric" value={d.age} onChange={set("age")} placeholder={t("fx 40")} /></label>
            <label>{t("Højde (cm)")}<input type="number" inputMode="numeric" value={d.height} onChange={set("height")} placeholder={t("fx 178")} /></label>
            <label>{t("Vægt (kg)")}<input type="number" inputMode="decimal" value={d.weight} onChange={set("weight")} placeholder={t("fx 75")} /></label>
            <label>{t("Hvilepuls")}<input type="number" inputMode="numeric" value={d.restHR} onChange={set("restHR")} placeholder={t("fx 55")} /></label>
            <label>{t("Makspuls (valgfri)")}<input type="number" inputMode="numeric" value={d.maxHR || ""} onChange={(e) => setD({ ...d, maxHR: e.target.value === "" ? 0 : +e.target.value })} placeholder={t("estimat {n}", { n: maxHR })} /></label>
          </div>
          {d.age > 0 && !d.maxHR && <div className="muted" style={{ marginTop: 8 }}>{t("Uden målt makspuls bruger vi {hr}.", { hr: maxHR })}</div>}
          {navBtns()}
        </section>
      )}

      {step === 3 && (
        <section className="panel ob-panel">
          <h2>{t("Din form")}</h2>
          <div className="ob-cards">
            {LEVELS.map(([v, l]) => { const [n, s] = l.split(" – "); return <button key={v} type="button" className={d.level === v ? "on" : ""} onClick={() => setD({ ...d, level: v })}><b>{n}</b><span>{s}</span></button>; })}
          </div>
          <div className="row2" style={{ marginTop: 10 }}>
            <label style={{ gridColumn: "1 / -1" }}>{t("Km om ugen lige nu (snit af de sidste 4 uger)")}<input type="number" inputMode="numeric" placeholder={t("fx 30")} value={d.currentKm ?? ""} onChange={(e) => setD({ ...d, currentKm: e.target.value === "" ? "" : +e.target.value })} /></label>
            <label>{t("Uger uden løb for nylig")}
              <select value={d.breakWeeks} onChange={(e) => setD({ ...d, breakWeeks: +e.target.value })}>
                <option value={0}>{t("Ingen pause")}</option><option value={1}>{t("1 uge")}</option><option value={2}>{t("2 uger")}</option><option value={4}>{t("4+ uger")}</option>
              </select>
            </label>
          </div>
          <div className="advice">{t("Start ca. {start} km/uge, top ca. {peak} km/uge.", { start: Math.max(15, Math.round((d.currentKm || 0) * 1.1)), peak: balanced.peak })}{d.breakWeeks >= 2 ? ` ${t("De første 4 uger er rolig genopbygning.")}` : ""}</div>
          {navBtns()}
        </section>
      )}

      {step === 4 && (
        <section className="panel ob-panel">
          <h2>{t("Din krop")}</h2>
          <div className="muted">{t("Mål for kroppen")}</div>
          <div className="ob-cards two">
            {BODY.map(([k, n, s]) => <button key={k} type="button" className={(d.body || "keep") === k ? "on" : ""} onClick={() => setD({ ...d, body: k, liftCount: k === "muscle" ? Math.max(3, d.liftCount ?? 2) : k === "keep" || k === "fit" ? Math.max(1, Math.min(2, d.liftCount ?? 2)) : (d.liftCount ?? 2) })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
          </div>
          <div className="muted" style={{ marginTop: 14 }}>{t("Skavanker lige nu")}</div>
          <div className="ob-cards">
            {INJURY.map(([k, n, s]) => <button key={k} type="button" className={(d.injury || "none") === k ? "on" : ""} onClick={() => setD({ ...d, injury: k })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
          </div>
          {(d.injury || "none") !== "none" && (
            <div className="row2" style={{ marginTop: 10 }}>
              <label>{t("Hvor sidder det?")}<select value={d.injuryArea || ""} onChange={(e) => setD({ ...d, injuryArea: e.target.value })}><option value="">{t("Vælg")}</option>{AREAS.map((a) => <option key={a} value={a}>{t(a)}</option>)}</select></label>
              <label>{t("Note (valgfri)")}<input value={d.injuryNote || ""} maxLength={60} onChange={(e) => setD({ ...d, injuryNote: e.target.value })} placeholder={t("fx ondt efter 10 km")} /></label>
            </div>
          )}
          {d.injury === "injured" && <div className="advice warn">{t("Planen starter med 4 ugers genopbygning: gå/løb-intervaller, blødt underlag og ingen hårde pas. Gør det ondt på en måde, der ændrer dit skridt, så stop. Ved smerte over 2 uger: se en fysioterapeut.")}</div>}
          {d.injury === "sore" && <div className="advice">{t('De første 3 uger uden bakker og hårde intervaller, og RPE under 6. Bliver ømheden værre uge for uge, så skift til "Skadet".')}</div>}
          {navBtns()}
        </section>
      )}

      {step === 5 && (
        <section className="panel ob-panel">
          <h2>{t("Din hverdag")}</h2>
          <p className="muted">{t("Ret kun de dage, der er anderledes. Kort = under 45 min · normal = 1–1½ time · lang = 2 timer eller mere.")}</p>
          <div className="row2">
            <label>{t("Løbedage om ugen")}<select value={d.maxRunDays} onChange={(e) => setD({ ...d, maxRunDays: +e.target.value })}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{t("{n} dage", { n })}</option>)}</select></label>
          </div>
          <div className="chips">
            {PRESETS.map(([k, label, mk]) => <button key={k} type="button" className={presetKey(sched) === k ? "on" : ""} onClick={() => setD({ ...d, sched: { A: mk(), B: mk() }, longDay: mk().findIndex((x) => x.avail === "long") })}>{t(label)}</button>)}
          </div>
          <div className="sched" style={{ marginTop: 10 }}>
            {DAYS.map((n, i) => (
              <div key={n} className={`sched-row ${sched[i]?.avail === "none" ? "off" : ""}`}>
                <b>{n}</b>
                <select aria-label={`${n} – ${t("tid")}`} className="wide" value={sched[i]?.avail || "none"} onChange={(e) => setDay(i, { avail: e.target.value })}>{AVAIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
            ))}
          </div>
          {longDays.length > 1 && <label>{t("Lang tur helst")}
            <select value={d.longDay} onChange={(e) => setD({ ...d, longDay: +e.target.value })}>{longDays.map(([n, i]) => <option key={i} value={i}>{n}</option>)}</select>
          </label>}
          {longDays.length === 0 && <div className="advice warn">{t('Sæt mindst én dag til "Lang" – det er dagen til den lange tur.')}</div>}
          <div className="muted" style={{ marginTop: 14 }}>{t("Styrke om ugen (30–45 min pr. pas)")}</div>
          <div className="chips">{LIFTS.map(([n, l]) => <button key={n} type="button" className={(d.liftCount ?? 2) === n ? "on" : ""} onClick={() => setD({ ...d, liftCount: n })}>{t(l)}</button>)}</div>
          {(d.liftCount ?? 2) > 0 && (
            <div className="ob-cards" style={{ marginTop: 8 }}>
              {GEAR.map(([k, n, s]) => <button key={k} type="button" className={(d.gear || "home") === k ? "on" : ""} onClick={() => setD({ ...d, gear: k })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
            </div>
          )}
          {navBtns(<button className="btn" onClick={next} disabled={longDays.length === 0}>{t("Vis min plan")}</button>)}
        </section>
      )}

      {step === 7 && (
        <section className="ob-result">
          <div className="panel ob-panel">
            <h2>{t("Din plan")}</h2>
            <p className="muted">{t("Vælg den plan, du kan holde i {n} uger.", { n: weeksToRace || t("alle") })}</p>
            {d.injury === "injured" && <div className="advice warn">{t("Alle tre starter med 4 ugers genopbygning og én løbedag mindre, fordi du er skadet. Toppen er sænket 10 %.")}</div>}
            {d.injury === "sore" && <div className="advice">{t("De første 3 uger er uden bakker og hårde intervaller på grund af ømheden.")}</div>}
            <div className="model-grid">
              {coach && (
                <div className="model rec">
                  <div className="model-tag">{t("Din træner")}</div>
                  <h3>{t("Trænerplan")}</h3>
                  <div className="model-num"><b>{coach.topKm}</b><span>{t("km/uge på toppen")}</span></div>
                  <dl>
                    <div><dt>{t("Uger")}</dt><dd>{t("{n} fra {date}", { n: coach.weeks, date: shortDate(coach.start) })}</dd></div>
                    <div><dt>{t("Nu")}</dt><dd>{coach.now ? t("uge {i} af {n}", { i: coach.now, n: coach.weeks }) : t("ikke startet")}</dd></div>
                    <div><dt>{t("Start")}</dt><dd>{t("{km} km/uge", { km: coach.first })}</dd></div>
                    <div><dt>{t("Længste tur")}</dt><dd>{coach.longest} km</dd></div>
                  </dl>
                  <p className="muted">{t("Trænerens uger som de er. Tallene er et loft.")}</p>
                  <button className="btn" onClick={chooseCoach}>{t("Brug trænerplanen")}</button>
                </div>
              )}
              {models.map((m) => (
                <div key={m.key} className={`model ${m.key === "bal" && !coach ? "rec" : ""}`}>
                  {m.key === "bal" && !coach && <div className="model-tag">{t("Anbefalet")}</div>}
                  <h3>{t(m.name)}</h3>
                  <div className="model-num"><b>{m.topKm}</b><span>{t("km/uge på toppen")}</span></div>
                  <dl>
                    <div><dt>{t("Start")}</dt><dd>{t("ca. {km} km/uge", { km: m.first })}</dd></div>
                    <div><dt>{t("Længste tur")}</dt><dd>{m.longest} km</dd></div>
                    <div><dt>{t("Tid på toppen")}</dt><dd>{t("ca. {h} t/uge", { h: m.hours })}</dd></div>
                  </dl>
                  {m.short > 0 && <div className="advice warn" style={{ fontSize: 13 }}>{t("{a} af {b} uger kan ikke rummes i din hverdag. Planen viser, hvad der passer.", { a: m.short, b: m.plan.weeks })}</div>}
                  <button className="btn" onClick={() => choose(m)}>{t("Vælg {name}", { name: t(m.name).toLowerCase() })}</button>
                </div>
              ))}
            </div>
          </div>
          <p className="muted" style={{ margin: "0 4px" }}>{t("Kost og styrke følger med: dagens tal på I dag, alt under Mere.")}</p>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>{t("Tilbage")}</button></div>
        </section>
      )}
    </div>
  );
}
