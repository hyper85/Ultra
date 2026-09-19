import { useMemo, useState } from "react";
import { ymd, parseLocal, mondayOf, addDays } from "./import.js";
import coachPlan from "./data/coach-plan.json";
import { BODY, GEAR, pickLiftDays, buildStrength, gearLabel } from "./strength.js";
import { weekTargets, bmrOf } from "./nutrition.js";
import { RACES, vertFor, distanceKm, myPosition } from "./races.js";
import { t, locale } from "./i18n.js";
import LangSwitch from "./LangSwitch.jsx";

// The coach's own plan (coach-plan.json) as a card next to the three computed models: fixed weeks and dates.
const coachCard = () => {
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
export const INJURY = [
  ["none", "Ingen skavanker", "Kroppen er klar. Planen kører som normalt."],
  ["sore", "Lidt ømhed, kan løbe", "De første 3 uger uden bakker og hårde intervaller. Toppen sænkes 5 %."],
  ["injured", "Skadet, kan ikke løbe lige nu", "4 ugers genopbygning med gå/løb, én løbedag mindre, toppen sænkes 10 %."],
];
// Stored in the profile as Danish strings (the plan engine reads them); shown through t().
export const AREAS = ["Knæ", "Akillessene", "Læg", "Skinneben", "Fod", "Hofte / ryg", "Andet"];
export const DIETS = [
  ["all", "Spiser alt", "Kød, fisk, æg og mejeri er på menuen."],
  ["veg", "Vegetarisk", "Ingen kød og fisk. Æg og mejeri ok."],
  ["vegan", "Vegansk", "Kun plantebaseret."],
  ["lowcarb", "Lavkulhydrat i hverdagen", "Få kulhydrater til daglig. Lange ture kræver stadig sukker."],
];
export const INTOL = ["Laktose", "Gluten", "Nødder"];
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

export default function Onboarding({ initial, DAYS, AVAIL, LEVELS, FAMILY, buildPlan, onDone, rerun }) {
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState(null); const [posMsg, setPosMsg] = useState(null);
  const findNear = async () => { setPosMsg(t("Finder din position…")); const p0 = await myPosition(); if (!p0) { setPos(null); setPosMsg(t("Kunne ikke få din position. Tillad placering i browseren, eller vælg et løb i listen.")); return; } setPos(p0); setPosMsg(null); };
  const raceList = pos ? [...RACES].map((r) => ({ ...r, dist: distanceKm(pos.lat, pos.lon, r.lat, r.lon) })).sort((a, b) => a.dist - b.dist) : RACES;
  const [d, setD] = useState(() => ({ ...initial, body: initial.body || "keep", gear: initial.gear || "home", liftCount: initial.liftDays ? initial.liftDays.length : 2, startDate: rerun ? initial.startDate : ymd(mondayOf(new Date())) }));
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value });
  const setDay = (i, patch) => { const A = (d.sched?.A || []).map((x, j) => (j === i ? { ...x, ...patch } : x)); setD({ ...d, sched: { ...(d.sched || {}), A, B: d.sched?.B || A.map((x) => ({ ...x })) } }); };
  const STEPS = ["Velkommen", "Løbet", "Dig", "Din form", "Din krop", "Din hverdag", "Kost", "Din plan"];
  const shortDate = (date) => date.toLocaleDateString(locale(), { day: "numeric", month: "short" });

  const maxHR = d.maxHR || Math.round(d.sex === "f" ? 206 - 0.88 * (d.age || 40) : 211 - 0.64 * (d.age || 40));
  const bmr = Math.round(10 * (d.weight || 80) + 6.25 * (d.height || 178) - 5 * (d.age || 40) + (d.sex === "f" ? -161 : 5));
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

  const canNext = step === 1 ? raceOk && +d.raceKm > 0 : step === 2 ? d.age > 0 && d.weight > 0 && d.height > 0 : step === 3 ? d.currentKm >= 0 && d.currentKm !== "" : true;
  const toggleIntol = (x) => { const cur = d.intol || []; setD({ ...d, intol: cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x] }); };
  const tips = dietTips(d.diet || "all", d.intol || []);
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const liftDaysFor = (x) => pickLiftDays(x.sched?.A || [], { longDay: x.longDay, qualityDay: x.qualityDay ?? 2, count: x.liftCount ?? 2 });
  const finish = (x) => { const { liftCount, ...rest } = x; return { ...rest, liftDays: liftDaysFor(x), onboarded: true }; };
  const choose = (m) => onDone({ ...finish(m.v), coachMode: false });
  // Same race as the coach's plan (or already on it): offer the coach's fixed weeks as the first choice.
  const coach = d.raceDate === coachPlan.race.date || initial.coachMode !== false ? coachCard() : null;
  const chooseCoach = () => onDone({ ...finish(d), raceName: coachPlan.race.name, raceDate: coachPlan.race.date, raceKm: coachPlan.race.km, raceVert: coachPlan.race.vert, startDate: coachPlan.weeks[0].start, coachMode: true });
  const strengthPreview = useMemo(() => buildStrength({ body: d.body, gear: d.gear, phase: "Opbygning", count: d.liftCount ?? 2 }), [d.body, d.gear, d.liftCount]);
  const macroRows = useMemo(() => weekTargets({ bmr: bmrOf({ weight: d.weight || 80, height: d.height || 178, age: d.age || 40, sex: d.sex }), weight: d.weight || 80, body: d.body, goal: d.goal, diet: d.diet || "all" }), [d.weight, d.height, d.age, d.sex, d.body, d.goal, d.diet]);
  const sched = d.sched?.A || [];
  const longDays = DAYS.map((n, i) => [n, i]).filter(([, i]) => sched[i]?.avail === "long");
  const liftDayNames = (x) => liftDaysFor(x).map((i) => DAYS[i]).join(", ");
  const navBtns = (last) => <div className="ob-nav"><button className="btn ghost" onClick={back}>{t("Tilbage")}</button>{last === undefined ? <button className="btn" onClick={next} disabled={!canNext}>{t("Næste")}</button> : last}</div>;

  return (
    <div className="ob">
      <div className="ob-head">
        <h1>Ultraplan</h1>
        {step > 0 && <div className="ob-progress" aria-label={t("Trin {step} af {n}", { step, n: STEPS.length - 1 })}><span style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>}
        {step > 0 && <div className="muted">{t("{step} af {n} · {title}", { step, n: STEPS.length - 1, title: t(STEPS[step]) })}</div>}
      </div>

      {step === 0 && (
        <section className="panel ob-panel" style={{ position: "relative" }}>
          <LangSwitch className="corner" />
          <h2 style={{ paddingRight: 150 }}>{t("Lad os bygge din plan")}</h2>
          <p className="lead">{t("Seks korte trin, så får du en periodiseret plan frem til dit løb, pulszoner og kosttal, der passer til din hverdag.")}</p>
          <ul className="landing-list">
            <li><b>{t("Tager 3 minutter.")}</b> {t("Alt kan ændres bagefter.")}</li>
            <li><b>{t("Du vælger selv modellen.")}</b> {t("Til sidst ser du tre bud på en plan og vælger den, der passer.")}</li>
            <li><b>{t("Ærlige tal.")}</b> {t("Har din uge ikke plads til planen, får du det at vide med det samme.")}</li>
          </ul>
          {rerun && <p className="muted">{t("Dine nuværende svar er udfyldt på forhånd.")}</p>}
          <div className="ob-nav"><button className="btn" onClick={next}>{t("Start")}</button></div>
        </section>
      )}

      {step === 1 && (
        <section className="panel ob-panel">
          <h2>{t("Løbet")}</h2>
          <p className="muted">{t("Målet først. Datoen bestemmer, hvor mange uger planen har at arbejde med.")}</p>
          <div className="row-between"><span className="muted">{t("Vælg et kendt løb, eller skriv dit eget.")}</span><button type="button" className="linkbtn" onClick={findNear}>{pos ? t("Sorteret efter afstand") : t("Find løb nær mig")}</button></div>
          {posMsg && <div className="muted" style={{ marginTop: 4 }}>{posMsg}</div>}
          <div className="muted race-links">{t("Alle løb i Danmark med datoer:")} <a href="https://www.motionsloeb.dk" target="_blank" rel="noopener">motionsloeb.dk</a> · <a href="https://www.sportstiming.dk" target="_blank" rel="noopener">sportstiming.dk</a> · {t("ultraløb:")} <a href="https://statistik.d-u-v.org" target="_blank" rel="noopener">d-u-v.org</a> · trail: <a href="https://itra.run" target="_blank" rel="noopener">itra.run</a>. {t("Skriv navn, dato og distance her bagefter.")}</div>
          <div className="chips race-chips">{raceList.map((r) => <button key={r.name} type="button" className={d.raceName === r.name ? "on" : ""} onClick={() => setD({ ...d, raceName: r.name, raceKm: r.km[r.km.length - 1], raceVert: vertFor(r, r.km[r.km.length - 1]) })}>{r.name}{r.dist != null ? <span className="muted"> · {r.dist} km</span> : null}</button>)}</div>
          {(() => { const r = RACES.find((x) => x.name === d.raceName); return r ? (
            <div className="advice">
              <div>{r.where} · {r.url}</div>
              <div className="chips" style={{ marginTop: 6 }}>{r.km.map((k) => <button key={k} type="button" className={+d.raceKm === k ? "on" : ""} onClick={() => setD({ ...d, raceKm: k, raceVert: vertFor(r, k) })}>{k === 83 ? "50 miles" : k === 161 ? "100 miles" : `${k} km`}</button>)}</div>
              <div className="muted" style={{ marginTop: 6 }}>{t("Datoen skifter hvert år: tjek den på løbets side og skriv den nedenfor. Højdemeter er et skøn, ret dem gerne.")}</div>
            </div>) : null; })()}
          <label>{t("Navn på løbet")}<input value={d.raceName} onChange={set("raceName")} placeholder={t("fx Hammer Trail Winter 50 miles")} /></label>
          <div className="row2">
            <label>{t("Løbsdato")}<input type="date" value={d.raceDate} onChange={set("raceDate")} min={ymd(addDays(new Date(), 1))} required /></label>
            <label>{t("Distance (km)")}<input type="number" inputMode="decimal" value={d.raceKm} onChange={set("raceKm")} placeholder={t("fx 50")} /></label>
          </div>
          <label>{t("Højdemeter (m+)")}<input type="number" inputMode="numeric" value={d.raceVert} onChange={set("raceVert")} placeholder={t("fx 1200")} /></label>
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
          <div className="muted" style={{ marginTop: 8 }}>{t("Uden målt makspuls bruger vi {hr}. Hvilestofskifte ≈ {bmr} kcal.", { hr: maxHR, bmr })}</div>
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
            <label style={{ gridColumn: "1 / -1" }}>{t("Km de sidste 4 uger (ældste først)")}
              <div className="row4">{[0, 1, 2, 3].map((k) => <input key={k} type="number" inputMode="numeric" placeholder={t("uge -{n}", { n: 4 - k })} value={(d.last4 || [])[k] ?? ""} onChange={(e) => { const l4 = [...(d.last4 || ["", "", "", ""])]; l4[k] = e.target.value === "" ? "" : +e.target.value; const vals = l4.filter((x) => x !== "" && x != null); setD({ ...d, last4: l4, currentKm: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0 }); }} />)}</div>
            </label>
            <label>{t("Uger uden løb for nylig")}
              <select value={d.breakWeeks} onChange={(e) => setD({ ...d, breakWeeks: +e.target.value })}>
                <option value={0}>{t("Ingen pause")}</option><option value={1}>{t("1 uge")}</option><option value={2}>{t("2 uger")}</option><option value={4}>{t("4+ uger")}</option>
              </select>
            </label>
          </div>
          <div className="advice">{t("Base")} <b>{t("{km} km/uge", { km: d.currentKm || 0 })}</b> {t("(gennemsnit af de 4 uger), start ca. {km} km. En balanceret plan topper på ca.", { km: Math.round((d.currentKm || 0) * 1.1) })} <b>{t("{km} km/uge", { km: balanced.peak })}</b>{d.breakWeeks >= 2 ? t(", efter 4 ugers rolig genopbygning") : ""}. {t("Bruger du dit ur, kan appen senere hente det rigtige tal fra Strava eller Garmin.")}</div>
          {navBtns()}
        </section>
      )}

      {step === 4 && (
        <section className="panel ob-panel">
          <h2>{t("Din krop")}</h2>
          <p className="muted">{t("Hvad vil du med kroppen, ud over løbet? Det styrer kosten og styrketræningen.")}</p>
          <div className="ob-cards two">
            {BODY.map(([k, n, s]) => <button key={k} type="button" className={(d.body || "keep") === k ? "on" : ""} onClick={() => setD({ ...d, body: k, liftCount: k === "muscle" ? Math.max(3, d.liftCount ?? 2) : k === "keep" || k === "fit" ? Math.max(1, Math.min(2, d.liftCount ?? 2)) : (d.liftCount ?? 2) })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
          </div>
          <div className="muted" style={{ marginTop: 14 }}>{t("Og hvordan har den det lige nu? Ærligt svar giver en plan, du kan holde til.")}</div>
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
          <p className="muted">{t("Det her gør planen din. Sig ærligt, hvor meget tid du har, så lægger vi kun løb, hvor der er plads.")}</p>
          <div className="row2">
            <label>{t("Familie")}<select value={d.family} onChange={set("family")}>{FAMILY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>{t("Løbedage om ugen")}<select value={d.maxRunDays} onChange={(e) => setD({ ...d, maxRunDays: +e.target.value })}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{t("{n} dage", { n })}</option>)}</select></label>
          </div>
          <div className="muted" style={{ marginTop: 12 }}>{t("Start med et mønster, og ret kun de dage, der er anderledes.")}</div>
          <div className="chips">
            {PRESETS.map(([k, label, mk]) => <button key={k} type="button" className={presetKey(sched) === k ? "on" : ""} onClick={() => setD({ ...d, sched: { A: mk(), B: mk() }, longDay: mk().findIndex((x) => x.avail === "long") })}>{t(label)}</button>)}
          </div>
          <div className="sched" style={{ marginTop: 10 }}>
            {DAYS.map((n, i) => (
              <div key={n} className={`sched-row ${sched[i]?.avail === "none" ? "off" : ""}`}>
                <b>{n}</b>
                <select value={sched[i]?.avail || "none"} onChange={(e) => setDay(i, { avail: e.target.value })}>{AVAIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input value={sched[i]?.note || ""} maxLength={40} placeholder={i === 2 ? t("fx hente børn 15.30") : t("note")} onChange={(e) => setDay(i, { note: e.target.value })} />
              </div>
            ))}
          </div>
          <label>{t("Lang tur helst")}
            <select value={d.longDay} onChange={(e) => setD({ ...d, longDay: +e.target.value })}>
              {longDays.length ? longDays.map(([n, i]) => <option key={i} value={i}>{n}</option>) : <option value={d.longDay}>{t('Sæt en dag til "Lang" ovenfor')}</option>}
            </select>
          </label>
          <div className="muted" style={{ marginTop: 14 }}>{t("Styrke om ugen. Korte pas på 30–45 min, lagt på dage uden lang tur.")}</div>
          <div className="chips">{LIFTS.map(([n, l]) => <button key={n} type="button" className={(d.liftCount ?? 2) === n ? "on" : ""} onClick={() => setD({ ...d, liftCount: n })}>{t(l)}</button>)}</div>
          {(d.liftCount ?? 2) > 0 && (
            <div className="ob-cards" style={{ marginTop: 8 }}>
              {GEAR.map(([k, n, s]) => <button key={k} type="button" className={(d.gear || "home") === k ? "on" : ""} onClick={() => setD({ ...d, gear: k })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
            </div>
          )}
          {(d.liftCount ?? 2) > 0 && <div className="muted" style={{ marginTop: 8 }}>{t('Styrkedage: {days}. Kan flyttes bagefter under "Din hverdag".', { days: liftDayNames(d) || t("ingen ledige") })}</div>}
          <div className="muted" style={{ marginTop: 8 }}>{t('Deleordning med uge A/B og tidspunkt på dagen kan sættes bagefter under "Din hverdag".')}</div>
          {navBtns()}
        </section>
      )}

      {step === 6 && (
        <section className="panel ob-panel">
          <h2>{t("Kost")}</h2>
          <p className="muted">{t("Kosten følger planen: mere på hårde dage, mindre på hviledage. Fortæl, hvad du spiser, så passer forslagene til dig.")}</p>
          <div className="ob-cards">
            {DIETS.map(([k, n, s]) => <button key={k} type="button" className={(d.diet || "all") === k ? "on" : ""} onClick={() => setD({ ...d, diet: k })}><b>{t(n)}</b><span>{t(s)}</span></button>)}
          </div>
          <div className="muted" style={{ marginTop: 12 }}>{t("Noget du ikke tåler?")}</div>
          <div className="chips">{INTOL.map((x) => <button key={x} type="button" className={(d.intol || []).includes(x) ? "on" : ""} onClick={() => toggleIntol(x)}>{t(x)}</button>)}</div>
          <div className="advice">{t("Protein ca.")} <b>{proteinG(d.weight || 80, d.body)} g</b> {t("om dagen, fx fra {list}. På lange ture: {fuel}.", { list: tips.protein.slice(0, 3).join(", ").toLowerCase(), fuel: tips.fuel[0]?.toLowerCase() })}</div>
          {navBtns(<button className="btn" onClick={next}>{t("Vis min plan")}</button>)}
        </section>
      )}

      {step === 7 && (
        <section className="ob-result">
          <div className="panel ob-panel">
            <h2>{t("Din plan")}</h2>
            <p className="muted">{coach ? t("Din træners plan, eller tre bud beregnet ud fra dine svar.") : t("Tre bud ud fra dine svar.")} {t("Tallene er ugens km på toppen, længste tur og cirka-timer om ugen, når det er hårdest. Vælg den, du kan holde i {n} uger.", { n: weeksToRace || t("alle") })}</p>
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
                    <div><dt>{t("Løbedage")}</dt><dd>{t("{n} om ugen", { n: coach.runDays })}</dd></div>
                    <div><dt>{t("Start")}</dt><dd>{t("{km} km/uge", { km: coach.first })}</dd></div>
                    <div><dt>{t("Længste tur")}</dt><dd>{coach.longest} km</dd></div>
                  </dl>
                  <p className="muted">{t("Trænerens uger som de er, med faste datoer og dage. Tallene er et loft, ikke et gulv. Trænerrådet justerer stadig ugen efter dine tal.")}</p>
                  <button className="btn" onClick={chooseCoach}>{t("Brug trænerplanen")}</button>
                </div>
              )}
              {models.map((m) => (
                <div key={m.key} className={`model ${m.key === "bal" && !coach ? "rec" : ""}`}>
                  {m.key === "bal" && !coach && <div className="model-tag">{t("Anbefalet")}</div>}
                  <h3>{t(m.name)}</h3>
                  <div className="model-num"><b>{m.topKm}</b><span>{t("km/uge på toppen")}</span></div>
                  <dl>
                    <div><dt>{t("Løbedage")}</dt><dd>{t("{n} om ugen", { n: m.v.maxRunDays })}</dd></div>
                    <div><dt>{t("Start")}</dt><dd>{t("ca. {km} km/uge", { km: m.first })}</dd></div>
                    <div><dt>{t("Længste tur")}</dt><dd>{m.longest} km</dd></div>
                    <div><dt>{t("Tid på toppen")}</dt><dd>{t("ca. {h} t/uge", { h: m.hours })}</dd></div>
                    <div><dt>{t("Progression")}</dt><dd>{LEVELS.find(([v]) => v === m.v.level)?.[1].split(" – ")[0]}</dd></div>
                  </dl>
                  <p className="muted">{t(m.who)}</p>
                  {m.short > 0 && <div className="advice warn" style={{ fontSize: 13 }}>{t("{a} af {b} uger kan ikke rummes i din hverdag. Planen viser, hvad der passer.", { a: m.short, b: m.plan.weeks })}</div>}
                  <button className="btn" onClick={() => choose(m)}>{t("Vælg {name}", { name: t(m.name).toLowerCase() })}</button>
                </div>
              ))}
            </div>
          </div>
          <div className="panel ob-panel">
            <h2>{t("Kost")}</h2>
            <p>{t("Hvilestofskifte ≈")} <b>{bmr} kcal</b>. {t("Protein")} <b>{proteinG(d.weight || 80, d.body)} g</b> {t("hver dag.")} {t(BODY.find(([k]) => k === (d.body || "keep"))?.[2])}</p>
            <div className="scroll"><table className="macro-table"><thead><tr><th>{t("Dag")}</th><th className="num">kcal</th><th className="num">{t("Protein")}</th><th className="num">{t("Kulhydrat")}</th><th className="num">{t("Fedt")}</th></tr></thead><tbody>{macroRows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num"><b>{r.kcal}</b></td><td className="num">{r.protein} g</td><td className="num">{r.carbs} g</td><td className="num">{r.fat} g</td></tr>)}</tbody></table></div>
            <div className="tips">
              <div><b>{t("Protein fra")}</b><span>{tips.protein.join(" · ")}</span></div>
              <div><b>{t("På lange ture")}</b><span>{tips.fuel.join(" · ")}</span></div>
              {tips.swaps.length > 0 && <div><b>{t("Bytte-tips")}</b><span>{tips.swaps.join(" ")}</span></div>}
            </div>
            <p className="muted">{t('Under ture over 90 min: 40 g kulhydrat/t i starten, 60–90 g/t i ultra-prep. Dagens tal og måltidsforslag står på "I dag", alt sammen under "Mere", Kost.')}</p>
          </div>
          <div className="panel ob-panel">
            <h2>{t("Styrke")}</h2>
            {strengthPreview.sessions.length ? (
              <>
                <p>{t("{n} pas om ugen ({days}) med {gear}.", { n: d.liftCount, days: liftDayNames(d), gear: gearLabel(d.gear).toLowerCase() })} {strengthPreview.note}</p>
                <div className="tips">{strengthPreview.sessions.map((x) => <div key={x.key}><b>{x.name} · {x.focus} · {t("ca. {n} min", { n: x.minutes })}</b><span>{x.exercises.map((e) => e.label).join(" · ")}</span></div>)}</div>
                <p className="muted">{t('Øvelserne med tegninger og teknik står på "I dag" på styrkedage og under "Mere", Styrke. Ankelrutinen hver dag: {list}.', { list: strengthPreview.daily.join(", ").toLowerCase() })}</p>
              </>
            ) : <p className="muted">{strengthPreview.note}</p>}
          </div>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>{t("Tilbage")}</button></div>
        </section>
      )}
    </div>
  );
}
