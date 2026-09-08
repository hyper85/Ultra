import { useMemo, useState } from "react";
import { ymd, parseLocal, mondayOf, addDays } from "./import.js";

/* First-login questionnaire. Six short screens, one topic each, ending in a choice between three
   plan models computed from the answers. See docs/ux-first-login.md for the brief. */

const GOALS = [
  ["finish", "Gennemføre", "Kom i mål hel og glad. Kosten holder vægten stabil."],
  ["perform", "Gennemføre på tid", "Lidt mere kvalitet, lidt mere mad på de hårde dage."],
  ["lean", "Gennemføre og blive lettere", "Roligt underskud på ca. 300 kcal/dag, max 0,5 kg/uge."],
];
const MODELS = [
  { key: "min", name: "Minimum", dLevel: -1, dDays: -1, peakScale: 0.85, who: "Til dig med lidt tid eller skavanker. Færrest dage, mest restitution, lavere top." },
  { key: "bal", name: "Balanceret", dLevel: 0, dDays: 0, peakScale: 1, who: "Den vi anbefaler ud fra dine svar. Stiger roligt og passer i din uge." },
  { key: "vol", name: "Volumen", dLevel: 1, dDays: 1, peakScale: 1.15, who: "Til dig der har tiden og disciplinen. Flere dage, højere top, mindre margin." },
];
const PACE = { 1: 7.0, 2: 6.25, 3: 5.75, 4: 5.25 }; // min/km used only for the hours estimate
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const goalKcal = (bmr, goal) => {
  const adj = goal === "lean" ? -300 : 0;
  const q = goal === "perform" ? 100 : 0;
  const rows = [["Lang tur / løbsdag", bmr * 1.95 + adj], ["Kvalitet / styrke", bmr * 1.7 + adj + q], ["Rolig løbedag", bmr * 1.45 - 400 + adj], ["Hviledag", bmr * 1.3 - 450 + adj]];
  return rows.map(([n, c]) => [n, Math.max(Math.round(bmr * 1.15 / 10) * 10, Math.round(c / 10) * 10)]);
};
export const proteinG = (weight, goal) => Math.round(weight * (goal === "lean" ? 2.2 : 2));

export default function Onboarding({ initial, DAYS, AVAIL, LEVELS, FAMILY, buildPlan, onDone, rerun }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(() => ({ ...initial, startDate: rerun ? initial.startDate : ymd(mondayOf(new Date())) }));
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value });
  const setDay = (i, patch) => { const A = (d.sched?.A || []).map((x, j) => (j === i ? { ...x, ...patch } : x)); setD({ ...d, sched: { ...(d.sched || {}), A, B: d.sched?.B || A.map((x) => ({ ...x })) } }); };
  const STEPS = ["Velkommen", "Løbet", "Dig", "Din form", "Din hverdag", "Din plan"];

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
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const choose = (m) => onDone({ ...m.v, onboarded: true });
  const sched = d.sched?.A || [];
  const longDays = DAYS.map((n, i) => [n, i]).filter(([, i]) => sched[i]?.avail === "long");

  return (
    <div className="ob">
      <div className="ob-head">
        <h1>Ultraplan</h1>
        {step > 0 && <div className="ob-progress" aria-label={`Trin ${step} af ${STEPS.length - 1}`}><span style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>}
        {step > 0 && <div className="muted">{step} af {STEPS.length - 1} · {STEPS[step]}</div>}
      </div>

      {step === 0 && (
        <section className="panel ob-panel">
          <h2>Lad os bygge din plan</h2>
          <p className="lead">Fem korte spørgsmål, så får du en periodiseret plan frem til dit løb, pulszoner og kosttal, der passer til din hverdag.</p>
          <ul className="landing-list">
            <li><b>Tager 3 minutter.</b> Alt kan ændres bagefter.</li>
            <li><b>Du vælger selv modellen.</b> Til sidst ser du tre bud på en plan og vælger den, der passer.</li>
            <li><b>Ærlige tal.</b> Har din uge ikke plads til planen, får du det at vide med det samme.</li>
          </ul>
          {rerun && <p className="muted">Dine nuværende svar er udfyldt på forhånd.</p>}
          <div className="ob-nav"><button className="btn" onClick={next}>Start</button></div>
        </section>
      )}

      {step === 1 && (
        <section className="panel ob-panel">
          <h2>Løbet</h2>
          <p className="muted">Målet først. Datoen bestemmer, hvor mange uger planen har at arbejde med.</p>
          <label>Navn på løbet<input value={d.raceName} onChange={set("raceName")} placeholder="fx Hammer Trail Winter 50 miles" /></label>
          <div className="row2">
            <label>Løbsdato<input type="date" value={d.raceDate} onChange={set("raceDate")} min={ymd(addDays(new Date(), 1))} required /></label>
            <label>Distance (km)<input type="number" inputMode="decimal" value={d.raceKm} onChange={set("raceKm")} /></label>
          </div>
          <label>Højdemeter (m+)<input type="number" inputMode="numeric" value={d.raceVert} onChange={set("raceVert")} /></label>
          {d.raceDate && !raceOk && <div className="advice warn">Datoen skal ligge efter i dag.</div>}
          {raceOk && weeksToRace < 8 && <div className="advice warn">Kun {weeksToRace} uger til løbet. Planen bliver komprimeret til minimum 8 uger, så hold igen med ambitionerne.</div>}
          {raceOk && weeksToRace >= 8 && <div className="muted" style={{ marginTop: 8 }}>{weeksToRace} uger fra mandag {parseLocal(d.startDate).toLocaleDateString("da-DK", { day: "numeric", month: "short" })} til løbet.</div>}
          <div className="muted" style={{ marginTop: 12 }}>Hvad vil du med det?</div>
          <div className="ob-cards">
            {GOALS.map(([k, n, t]) => <button key={k} type="button" className={d.goal === k ? "on" : ""} onClick={() => setD({ ...d, goal: k })}><b>{n}</b><span>{t}</span></button>)}
          </div>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>Tilbage</button><button className="btn" onClick={next} disabled={!canNext}>Næste</button></div>
        </section>
      )}

      {step === 2 && (
        <section className="panel ob-panel">
          <h2>Dig</h2>
          <p className="muted">Bruges til pulszoner og kalorier. Intet af det deles.</p>
          <div className="row2">
            <label>Køn<select value={d.sex} onChange={set("sex")}><option value="m">Mand</option><option value="f">Kvinde</option><option value="x">Andet</option></select></label>
            <label>Alder<input type="number" inputMode="numeric" value={d.age} onChange={set("age")} /></label>
            <label>Højde (cm)<input type="number" inputMode="numeric" value={d.height} onChange={set("height")} /></label>
            <label>Vægt (kg)<input type="number" inputMode="decimal" value={d.weight} onChange={set("weight")} /></label>
            <label>Hvilepuls<input type="number" inputMode="numeric" value={d.restHR} onChange={set("restHR")} /></label>
            <label>Makspuls (valgfri)<input type="number" inputMode="numeric" value={d.maxHR || ""} onChange={(e) => setD({ ...d, maxHR: e.target.value === "" ? 0 : +e.target.value })} placeholder={`estimat ${maxHR}`} /></label>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>Uden målt makspuls bruger vi {maxHR}. Hvilestofskifte ≈ {bmr} kcal.</div>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>Tilbage</button><button className="btn" onClick={next} disabled={!canNext}>Næste</button></div>
        </section>
      )}

      {step === 3 && (
        <section className="panel ob-panel">
          <h2>Din form</h2>
          <div className="ob-cards">
            {LEVELS.map(([v, l]) => { const [n, t] = l.split(" – "); return <button key={v} type="button" className={d.level === v ? "on" : ""} onClick={() => setD({ ...d, level: v })}><b>{n}</b><span>{t}</span></button>; })}
          </div>
          <div className="row2" style={{ marginTop: 10 }}>
            <label>Km om ugen lige nu<input type="number" inputMode="numeric" value={d.currentKm} onChange={set("currentKm")} /></label>
            <label>Uger uden løb for nylig
              <select value={d.breakWeeks} onChange={(e) => setD({ ...d, breakWeeks: +e.target.value })}>
                <option value={0}>Ingen pause</option><option value={1}>1 uge</option><option value={2}>2 uger</option><option value={4}>4+ uger</option>
              </select>
            </label>
          </div>
          <div className="advice">Med {d.currentKm || 0} km/uge nu topper en balanceret plan på ca. <b>{balanced.peak} km/uge</b>{d.breakWeeks >= 2 ? ", efter 4 ugers rolig genopbygning" : ""}. Bruger du dit ur, kan appen senere hente det rigtige tal fra Strava eller Garmin.</div>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>Tilbage</button><button className="btn" onClick={next} disabled={!canNext}>Næste</button></div>
        </section>
      )}

      {step === 4 && (
        <section className="panel ob-panel">
          <h2>Din hverdag</h2>
          <p className="muted">Det her gør planen din. Sig ærligt, hvor meget tid du har, så lægger vi kun løb, hvor der er plads.</p>
          <div className="row2">
            <label>Familie<select value={d.family} onChange={set("family")}>{FAMILY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Løbedage om ugen<select value={d.maxRunDays} onChange={(e) => setD({ ...d, maxRunDays: +e.target.value })}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} dage</option>)}</select></label>
          </div>
          <div className="sched" style={{ marginTop: 10 }}>
            {DAYS.map((n, i) => (
              <div key={n} className={`sched-row ${sched[i]?.avail === "none" ? "off" : ""}`}>
                <b>{n}</b>
                <select value={sched[i]?.avail || "none"} onChange={(e) => setDay(i, { avail: e.target.value })}>{AVAIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input value={sched[i]?.note || ""} maxLength={40} placeholder={i === 2 ? "fx hente børn 15.30" : "note"} onChange={(e) => setDay(i, { note: e.target.value })} />
              </div>
            ))}
          </div>
          <label>Lang tur helst
            <select value={d.longDay} onChange={(e) => setD({ ...d, longDay: +e.target.value })}>
              {longDays.length ? longDays.map(([n, i]) => <option key={i} value={i}>{n}</option>) : <option value={d.longDay}>Sæt en dag til "Lang" ovenfor</option>}
            </select>
          </label>
          <div className="muted" style={{ marginTop: 8 }}>Deleordning med uge A/B, tidspunkt på dagen og styrkedage kan sættes bagefter under "Din hverdag".</div>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>Tilbage</button><button className="btn" onClick={next}>Vis min plan</button></div>
        </section>
      )}

      {step === 5 && (
        <section className="ob-result">
          <div className="panel ob-panel">
            <h2>Din plan</h2>
            <p className="muted">Tre bud ud fra dine svar. Tallene er ugens km på toppen, længste tur og cirka-timer om ugen, når det er hårdest. Vælg den, du kan holde i {weeksToRace || "alle"} uger.</p>
            <div className="model-grid">
              {models.map((m) => (
                <div key={m.key} className={`model ${m.key === "bal" ? "rec" : ""}`}>
                  {m.key === "bal" && <div className="model-tag">Anbefalet</div>}
                  <h3>{m.name}</h3>
                  <div className="model-num"><b>{m.topKm}</b><span>km/uge på toppen</span></div>
                  <dl>
                    <div><dt>Løbedage</dt><dd>{m.v.maxRunDays} om ugen</dd></div>
                    <div><dt>Start</dt><dd>ca. {m.first} km/uge</dd></div>
                    <div><dt>Længste tur</dt><dd>{m.longest} km</dd></div>
                    <div><dt>Tid på toppen</dt><dd>ca. {m.hours} t/uge</dd></div>
                    <div><dt>Progression</dt><dd>{LEVELS.find(([v]) => v === m.v.level)?.[1].split(" – ")[0]}</dd></div>
                  </dl>
                  <p className="muted">{m.who}</p>
                  {m.short > 0 && <div className="advice warn" style={{ fontSize: 13 }}>{m.short} af {m.plan.weeks} uger kan ikke rummes i din hverdag. Planen viser, hvad der passer.</div>}
                  <button className="btn" onClick={() => choose(m)}>Vælg {m.name.toLowerCase()}</button>
                </div>
              ))}
            </div>
          </div>
          <div className="panel ob-panel">
            <h2>Kost</h2>
            <p>Hvilestofskifte ≈ <b>{bmr} kcal</b>. Protein <b>{proteinG(d.weight || 80, d.goal)} g</b> hver dag. {GOALS.find(([k]) => k === d.goal)?.[2]}</p>
            <table><tbody>{goalKcal(bmr, d.goal).map(([n, c]) => <tr key={n}><td>{n}</td><td className="num"><b>{c} kcal</b></td></tr>)}</tbody></table>
            <p className="muted">Under ture over 90 min: 40 g kulhydrat/t i starten, 60–90 g/t i ultra-prep. Kosttallene følger den model, du vælger, i fanen "Kost".</p>
          </div>
          <div className="ob-nav"><button className="btn ghost" onClick={back}>Tilbage</button></div>
        </section>
      )}
    </div>
  );
}
