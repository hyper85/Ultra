import { useEffect, useMemo, useRef, useState } from "react";
import { ymd, parseLocal, addDays, mondayOf, parseFile, weeklyTotals } from "./import.js";

/* ================= storage (swappable) ================= */
const store = {
  async get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/* ================= helpers ================= */
const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const PH = {
  Genopbygning: "var(--blue)",
  Opbygning: "var(--green)",
  "Ultra-prep": "var(--orange)",
  Nedtrapning: "var(--violet)",
};
const thisMonday = () => mondayOf(new Date());
const fmt = (d) => d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
};

/* ================= plan engine ================= */
export function buildPlan(p) {
  const start = parseLocal(p.startDate);
  const race = parseLocal(p.raceDate);
  const weeks = Math.max(8, Math.floor(Math.round((race - start) / 86400000) / 7) + 1);
  const raceKm = +p.raceKm;
  const restart = p.breakWeeks >= 2 ? Math.max(20, Math.round(+p.currentKm * 0.65)) : +p.currentKm;
  const peakTarget = Math.min(120, Math.max(45, Math.round(raceKm * 0.95)));
  const peak = Math.min(peakTarget, Math.round(restart * 2.6));
  const longCap = Math.min(Math.round(raceKm * 0.5), 50);
  const taper = 3;
  const rebuild = p.breakWeeks >= 2 ? 4 : 0;
  const ramp = weeks - taper - rebuild;
  const ultra = Math.round(ramp * 0.45);
  const build = ramp - ultra;
  const rows = [];
  let km = restart;
  for (let i = 1; i <= weeks; i++) {
    const wkStart = addDays(start, (i - 1) * 7);
    const isRace = i === weeks;
    let phase, deload = false, quality, focus;
    if (i <= rebuild) {
      phase = "Genopbygning";
      km = Math.round(restart + restart * 0.35 * ((i - 1) / Math.max(1, rebuild - 1)));
      if (i === rebuild) { deload = true; km = Math.round(km * 0.72); }
      quality = i === 1 ? "Kun roligt" : i === 2 ? "Stigninger 4×20 s" : "6×2 min tærskel";
      focus = i === 1 ? "Returuge. Alt roligt, blødt underlag, ankelarbejde dagligt." : "Rolig genopbygning. Ingen smerte, der ændrer skridtet.";
    } else if (i <= rebuild + build) {
      phase = "Opbygning";
      const j = i - rebuild;
      km = Math.round(restart * 1.35 + (peak * 0.65 - restart * 1.35) * (j / build));
      if (j % 4 === 0 && j !== build) { deload = true; km = Math.round(km * 0.72); }
      quality = ["8×2 min tærskel", "20 min tempo", "Bakker 6×90 s", "5×3 min tærskel", "25 min tempo"][j % 5];
      focus = deload ? "Nedtrapningsuge. Lad tilpasningen sætte sig." : "Stak aerob volumen. Lang tur på trail med 40–60 g kulhydrat/t.";
    } else if (i <= weeks - taper) {
      phase = "Ultra-prep";
      const j = i - rebuild - build;
      km = Math.round(peak * 0.7 + peak * 0.3 * Math.min(1, j / Math.max(1, ultra - 1)));
      if (j % 3 === 0 && j !== ultra) { deload = true; km = Math.round(km * 0.68); }
      quality = ["Bakker 8×90 s", "2×15 min tempo", "Løbstempo 2×15 min", "3×10 min tærskel", "2×20 min tempo"][j % 5];
      focus = deload ? "Nedtrapningsuge før de store weekender." : "Back-to-back weekend. Kit- og lygtetest. 60–90 g kulhydrat/t.";
    } else {
      phase = "Nedtrapning";
      const j = i - (weeks - taper);
      km = Math.round(peak * [0.65, 0.45, 0.3][j - 1]); deload = true;
      quality = ["2×12 min tempo", "Løbstempo 2×10 min", "Åbnere 3×1 min"][j - 1];
      focus = isRace ? "Løbsuge. Start absurd roligt, gå hver stigning, spis fra minut 30." : "Volumen ned, friskhed op. Logistik og kit på plads.";
    }
    let lng = Math.min(longCap, Math.round(km * (phase === "Ultra-prep" ? 0.5 : 0.42)));
    if (isRace) lng = raceKm;
    if (phase === "Genopbygning" && i === 1) lng = Math.min(lng, 12);
    let sun = phase === "Ultra-prep" && !deload ? Math.round(lng * 0.45) : 0;
    if (phase === "Nedtrapning" && i === weeks - taper + 1) sun = Math.round(lng * 0.4);
    const pool = Math.max(0, km - lng - sun);
    const runDays = p.runDays.length ? p.runDays : [0, 2, 3];
    const share = runDays.map((d) => (d === p.qualityDay ? 1.15 : 1));
    const tot = share.reduce((a, b) => a + b, 0);
    const days = [0, 0, 0, 0, 0, 0, 0];
    runDays.forEach((d, k) => (days[d] = Math.round((pool * share[k]) / tot)));
    days[p.longDay] = lng; days[p.longDay === 5 ? 6 : 5] = sun;
    const total = days.reduce((a, b) => a + b, 0);
    rows.push({ i, wkStart, key: ymd(wkStart), iso: isoWeek(wkStart), phase, km: total, lng, sun, deload, isRace, quality, focus, days });
  }
  return { rows, weeks, peak, restart };
}

/* ================= app ================= */
const PLAN_START = "2026-08-24"; // mandag i uge 35
const PROFILE_VERSION = 2;
const DEFAULT = {
  v: PROFILE_VERSION,
  name: "", age: 41, height: 181, weight: 89, restHR: 49, maxHR: 186,
  currentKm: 35, breakWeeks: 0, startDate: PLAN_START, includeHikes: false,
  raceName: "Hammer Trail Winter 50 miles", raceDate: "2027-01-30", raceKm: 83, raceVert: 3400,
  runDays: [0, 2, 3], qualityDay: 2, longDay: 5, liftDays: [1, 3],
};

export default function App() {
  const [p, setP] = useState(DEFAULT);
  const [log, setLog] = useState({});          // keyed by the Monday of the week ("YYYY-MM-DD")
  const [acts, setActs] = useState({});        // imported activities keyed by id
  const [importMsg, setImportMsg] = useState(null);
  const [tab, setTab] = useState("plan");
  const [ready, setReady] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { (async () => {
    const sp = await store.get("ultraplan-profile");
    if (sp) {
      // Profiles saved before v2 carried an auto-generated start date; move them to the fixed plan start.
      const migrated = (sp.v || 1) < PROFILE_VERSION ? { ...sp, startDate: PLAN_START, v: PROFILE_VERSION } : sp;
      setP({ ...DEFAULT, ...migrated });
    }
    const sl = await store.get("ultraplan-log");
    if (sl) {
      // Logs saved before v2 were keyed by week number; re-key them by the week's Monday using the start date they were logged against.
      const legacy = Object.keys(sl).some((k) => /^\d+$/.test(k));
      if (legacy) {
        const start = parseLocal(sp?.startDate || PLAN_START);
        const n = {};
        for (const [k, v] of Object.entries(sl)) n[/^\d+$/.test(k) ? ymd(addDays(start, (+k - 1) * 7)) : k] = v;
        setLog(n); store.set("ultraplan-log", n);
      } else setLog(sl);
    }
    const sa = await store.get("ultraplan-activities"); if (sa) setActs(sa);
    setReady(true);
  })(); }, []);
  useEffect(() => { if (ready) store.set("ultraplan-profile", p); }, [p, ready]);
  const saveLog = (n) => { setLog(n); store.set("ultraplan-log", n); };
  const saveActs = (n) => { setActs(n); store.set("ultraplan-activities", n); };

  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === "number" ? +e.target.value : e.target.value });
  // Any chosen date snaps to the Monday of its week so the plan always starts on a Monday.
  const setStart = (str) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return; setP({ ...p, startDate: ymd(mondayOf(parseLocal(str))) }); };
  const shiftStart = (weeks) => setStart(ymd(addDays(parseLocal(p.startDate), weeks * 7)));
  const toggle = (key, d) => { const s = new Set(p[key]); s.has(d) ? s.delete(d) : s.add(d); setP({ ...p, [key]: [...s].sort() }); };

  const plan = useMemo(() => buildPlan(p), [p]);
  const maxHR = p.maxHR || Math.round(211 - 0.64 * p.age);
  const bmr = Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + 5);
  const daysToRace = Math.max(0, Math.round((parseLocal(p.raceDate) - new Date()) / 86400000));
  const todayKey = ymd(thisMonday());
  const cur = plan.rows.find((r) => r.key === todayKey) || plan.rows[0];
  const startD = parseLocal(p.startDate);

  /* ---- Strava / Garmin import ---- */
  // Write weekly totals from the imported activities into the log. Imported km always win for weeks that have activities;
  // RPE is only estimated where the user has not typed one.
  const applyActivities = (nextActs, includeHikes, base = log) => {
    const weeks = weeklyTotals(nextActs, { includeHikes, maxHR });
    const n = { ...base };
    for (const [k, v] of Object.entries(n)) if (v.auto && !weeks[k]) { const { km, auto, rpeAuto, rpe, n: _n, ...rest } = v; n[k] = rpeAuto ? rest : { ...rest, ...(rpe != null ? { rpe } : {}) }; }
    for (const [k, w] of Object.entries(weeks)) {
      const l = n[k] || {};
      const rpe = l.rpe != null && l.rpe !== "" && !l.rpeAuto ? l.rpe : w.rpe ?? l.rpe;
      n[k] = { ...l, km: w.km, n: w.n, auto: true, ...(rpe != null ? { rpe, rpeAuto: !(l.rpe != null && l.rpe !== "" && !l.rpeAuto) } : {}) };
    }
    saveLog(n);
    return weeks;
  };
  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const errors = []; let parsed = [];
    for (const f of files) { try { parsed = parsed.concat(await parseFile(f)); } catch (err) { errors.push(err.message); } }
    const next = { ...acts }; let added = 0;
    for (const a of parsed) { if (!next[a.id]) added++; next[a.id] = a; }
    saveActs(next);
    const weeks = applyActivities(next, p.includeHikes);
    const runs = parsed.filter((a) => a.kind === "run").length, hikes = parsed.filter((a) => a.kind === "hike").length, other = parsed.length - runs - hikes;
    setImportMsg({
      warn: errors.length > 0 || parsed.length === 0,
      text: parsed.length === 0 && !errors.length ? "Ingen aktiviteter fundet i filen. Tjek at det er Stravas activities.csv, Garmins CSV-eksport eller en GPX/TCX-fil."
        : `Læste ${parsed.length} aktiviteter (${runs} løb${hikes ? `, ${hikes} vandring` : ""}${other ? `, ${other} andet` : ""}), ${added} nye. ${Object.keys(weeks).length} uger i loggen har nu km fra dit ur.${errors.length ? " " + errors.join(" ") : ""}`,
    });
    if (fileRef.current) fileRef.current.value = "";
  };
  const setHikes = (v) => { setP({ ...p, includeHikes: v }); applyActivities(acts, v); };
  const clearImports = () => { if (!confirm("Fjern alle importerede aktiviteter? Tal du selv har skrevet, bliver stående.")) return; applyActivities({}, p.includeHikes); saveActs({}); setImportMsg(null); };
  const nActs = Object.keys(acts).length;
  const recentAvg = useMemo(() => {
    const weeks = weeklyTotals(acts, { includeHikes: p.includeHikes, maxHR });
    const keys = [1, 2, 3, 4].map((w) => ymd(addDays(thisMonday(), -7 * w))).filter((k) => weeks[k]);
    return keys.length ? Math.round(keys.reduce((a, k) => a + weeks[k].km, 0) / keys.length) : null;
  }, [acts, p.includeHikes, maxHR]);
  const curLog = log[cur.key] || {};

  const loads = plan.rows.map((r) => { const l = log[r.key] || {}; return l.km && l.rpe ? l.km * l.rpe : null; });
  const acwr = plan.rows.map((r, i) => {
    if (loads[i] == null) return null;
    const prev = loads.slice(Math.max(0, i - 4), i).filter((x) => x != null);
    return prev.length ? loads[i] / (prev.reduce((a, b) => a + b, 0) / prev.length) : null;
  });
  const cls = (v) => (v == null ? "l" : v > 1.5 ? "r" : v > 1.3 ? "a" : v < 0.8 ? "l" : "g");

  // coach advice for the current week, based on last logged week
  const lastIdx = [...plan.rows.keys()].reverse().find((i) => loads[i] != null);
  let advice = `Denne uge: ${cur.km} km, hård session ${DAYS[p.qualityDay].toLowerCase()} (${cur.quality}), lang tur ${cur.lng} km. Rolige ture under ${Math.round(maxHR * 0.7)} i puls.`;
  let warn = false;
  if (lastIdx != null) {
    const a = acwr[lastIdx]; const l = log[plan.rows[lastIdx].key];
    if (a > 1.5) { advice = `ACWR sidste uge var ${a.toFixed(2)} – rødt. Hold denne uge på max ${Math.round(plan.rows[lastIdx].km * 0.75)} km, ingen hårde pas, og lad belastningen falde. Det er ikke at give op; det er at lade betonen hærde.`; warn = true; }
    else if (l?.km && l.km > plan.rows[lastIdx].km * 1.4) { advice = `Du løb ${l.km} km mod ${plan.rows[lastIdx].km} planlagt. Planens tal er et loft. Ram ugens ${cur.km} km – og ikke mere.`; warn = true; }
    else if (l?.hr && p.restHR && l.hr >= p.restHR + 7) { advice = `Hvilepuls ${l.hr} er 7+ over din normal. Skær 30–50 % af ugens km, sov mere, spis mere.`; warn = true; }
  }

  const zones = [["Z1 restitution", .5, .6, "Gang, nedjog"], ["Z2 aerob", .6, .7, "80 % af al løb. Hele sætninger."], ["Z3 tempo", .7, .8, "Behageligt hårdt"], ["Z4 tærskel", .8, .9, "Én sætning ad gangen"], ["Z5 VO2", .9, 1, "Kun korte intervaller"]];
  const nut = [["Lang tur / løbsdag", bmr * 1.95], ["Kvalitet / styrke", bmr * 1.7], ["Rolig løbedag", bmr * 1.45 - 400], ["Hviledag", bmr * 1.3 - 450]].map(([n, c]) => [n, Math.round(c / 10) * 10]);
  const maxKm = Math.max(...plan.rows.map((r) => r.km));

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div>
            <h1>Ultraplan</h1>
            <div className="muted">{p.raceName || "Dit løb"} · {p.raceKm} km · {p.raceVert} m+ · {plan.weeks} uger · top {plan.peak} km/uge</div>
          </div>
          <div className="count"><b>{daysToRace}</b><span>dage til start</span></div>
        </div>
      </header>

      <main className="wrap grid">
        <aside style={{ display: "grid", gap: 16 }}>
          <section className="panel">
            <h2>Start</h2>
            <label>Startdato – vælg en hvilken som helst dag, planen begynder mandag i den uge
              <input type="date" value={p.startDate} max={p.raceDate} onChange={(e) => setStart(e.target.value)} />
            </label>
            <div className="quick">
              <button onClick={() => setStart(ymd(addDays(thisMonday(), -7)))}>Sidste uge</button>
              <button className={p.startDate === todayKey ? "on" : ""} onClick={() => setStart(todayKey)}>Denne uge</button>
              <button onClick={() => setStart(ymd(addDays(thisMonday(), 7)))}>Næste uge</button>
            </div>
            <div className="quick">
              <button onClick={() => shiftStart(-1)}>− 1 uge</button>
              <button onClick={() => shiftStart(1)}>+ 1 uge</button>
            </div>
            <div className="muted">Planen starter mandag {fmt(startD)} (uge {isoWeek(startD)}) og løber {plan.weeks} uger frem til løbet.</div>
          </section>

          <section className="panel">
            <h2>Dig</h2>
            <div className="row2">
              <label>Alder<input type="number" value={p.age} onChange={set("age")} /></label>
              <label>Vægt (kg)<input type="number" value={p.weight} onChange={set("weight")} /></label>
              <label>Højde (cm)<input type="number" value={p.height} onChange={set("height")} /></label>
              <label>Hvilepuls<input type="number" value={p.restHR} onChange={set("restHR")} /></label>
              <label>Makspuls<input type="number" value={p.maxHR} onChange={set("maxHR")} placeholder="tom = estimat" /></label>
              <label>Km/uge nu<input type="number" value={p.currentKm} onChange={set("currentKm")} /></label>
            </div>
            <label>Uger uden løb for nylig
              <select value={p.breakWeeks} onChange={(e) => setP({ ...p, breakWeeks: +e.target.value })}>
                <option value={0}>Ingen pause</option><option value={1}>1 uge</option><option value={2}>2 uger</option><option value={4}>4+ uger</option>
              </select>
            </label>
          </section>

          <section className="panel">
            <h2>Løbet</h2>
            <label>Navn<input value={p.raceName} onChange={set("raceName")} /></label>
            <div className="row2">
              <label>Løbsdato<input type="date" value={p.raceDate} min={p.startDate} onChange={set("raceDate")} /></label>
              <label>Distance (km)<input type="number" value={p.raceKm} onChange={set("raceKm")} /></label>
              <label>Højdemeter<input type="number" value={p.raceVert} onChange={set("raceVert")} /></label>
            </div>
          </section>

          <section className="panel">
            <h2>Din uge</h2>
            <label>Hverdage du kan løbe</label>
            <div className="days">{DAYS.slice(0, 5).map((d, i) => <button key={d} className={p.runDays.includes(i) ? "on" : ""} onClick={() => toggle("runDays", i)}>{d}</button>)}</div>
            <label>Styrkedage</label>
            <div className="days">{DAYS.slice(0, 5).map((d, i) => <button key={d} className={p.liftDays.includes(i) ? "on" : ""} onClick={() => toggle("liftDays", i)}>{d}</button>)}</div>
            <div className="row2">
              <label>Hård dag<select value={p.qualityDay} onChange={(e) => setP({ ...p, qualityDay: +e.target.value })}>{p.runDays.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</select></label>
              <label>Lang tur<select value={p.longDay} onChange={(e) => setP({ ...p, longDay: +e.target.value })}><option value={5}>Lørdag</option><option value={6}>Søndag</option></select></label>
            </div>
          </section>
        </aside>

        <section style={{ display: "grid", gap: 16 }}>
          <div className="panel">
            <h2>Uge {cur.i} · u{cur.iso} · {cur.phase}{cur.deload ? " · nedtrapning" : ""}</h2>
            <div className="thisweek">
              {cur.days.map((v, i) => {
                const hard = i === p.qualityDay && v > 0; const long = i === p.longDay; const lift = p.liftDays.includes(i);
                return (
                  <div key={i} className={long ? "long" : hard ? "hard" : lift && !v ? "lift" : ""}>
                    <small>{DAYS[i]}</small>
                    <b>{v || (lift ? "S" : "–")}</b>
                    <small>{v ? (long ? "lang" : hard ? "hård" : i === 6 && v ? "B2B" : "rolig") : lift ? "styrke" : "hvile"}</small>
                    {v > 0 && lift && <small style={{ display: "block", color: "var(--violet)" }}>+ styrke</small>}
                  </div>
                );
              })}
            </div>
            {curLog.auto && curLog.km > 0 && <div className="muted" style={{ marginTop: 10 }}>Fra dit ur denne uge: <b style={{ color: "var(--text)" }}>{curLog.km} km</b> på {curLog.n} {curLog.n === 1 ? "tur" : "ture"} af {cur.km} km planlagt.</div>}
            <div className={`advice ${warn ? "warn" : ""}`}>{advice}</div>
          </div>

          <div className="panel">
            <h2>Hele planen</h2>
            <div className="ribbon">
              {plan.rows.map((r) => (
                <div key={r.i} className={r.i === cur.i ? "cur" : ""} title={`Uge ${r.i} · ${r.km} km`}
                  style={{ height: `${(r.km / maxKm) * 100}%`, background: PH[r.phase], opacity: r.deload ? 0.5 : 1 }}>
                  {r.isRace && <span className="star">★</span>}
                </div>
              ))}
            </div>
            <div className="legend">{Object.entries(PH).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}<span><i style={{ background: "var(--muted)", opacity: .5 }} />nedtrapning</span></div>
          </div>

          <div>
            <nav className="tabs">
              {[["plan", "Ugeplan"], ["zones", "Pulszoner"], ["nut", "Kost"], ["log", "Log & belastning"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
            </nav>

            {tab === "plan" && (
              <div className="panel scroll">
                <table>
                  <thead><tr><th>Uge</th><th>Fase</th><th className="num">Km</th>{DAYS.map((d) => <th key={d} className="num">{d}</th>)}<th>Hård session</th><th>Fokus</th></tr></thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.i} style={r.i === cur.i ? { background: "#1c1c1c" } : undefined}>
                        <td style={{ whiteSpace: "nowrap" }}><b>{r.i}</b>{r.deload ? "●" : ""}{r.isRace ? "★" : ""} <span className="muted">u{r.iso} · {fmt(r.wkStart)}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}><i className="phase-dot" style={{ background: PH[r.phase] }} />{r.phase}</td>
                        <td className="num"><b>{r.km}</b></td>
                        {r.days.map((v, i) => <td key={i} className="num" style={i === p.longDay ? { color: "var(--orange)", fontWeight: 700 } : undefined}>{v || ""}</td>)}
                        <td style={{ whiteSpace: "nowrap" }}>{r.quality}</td>
                        <td className="muted" style={{ minWidth: 220 }}>{r.focus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "zones" && (
              <div className="panel">
                <p>Makspuls brugt: <b>{maxHR}</b>{!p.maxHR && " (estimat – skriv din målte ind)"}. Hvilepuls {p.restHR}.</p>
                <table><tbody>{zones.map(([n, lo, hi, t]) => <tr key={n}><td><b>{n}</b></td><td className="num" style={{ whiteSpace: "nowrap" }}>{Math.round(maxHR * lo)}–{Math.round(maxHR * hi)}</td><td className="muted">{t}</td></tr>)}</tbody></table>
                <p className="muted">Rolige ture under {Math.round(maxHR * 0.7)}. Det føles for langsomt. Det er meningen.</p>
              </div>
            )}

            {tab === "nut" && (
              <div className="panel">
                <p>Hvilestofskifte ≈ <b>{bmr} kcal</b>. Protein <b>{Math.round(p.weight * 2)} g</b> hver dag. Kulhydrat følger arbejdet.</p>
                <table><tbody>{nut.map(([n, c]) => <tr key={n}><td>{n}</td><td className="num"><b>{c} kcal</b></td></tr>)}</tbody></table>
                <p className="muted">Under ture over 90 min: 40 g kulhydrat/t i starten, 60–90 g/t i ultra-prep. Max 0,5 kg vægttab/uge – ellers spis mere.</p>
              </div>
            )}

            {tab === "log" && (
              <div className="panel scroll">
                <div className="import">
                  <h3>Hent fra Strava eller Garmin</h3>
                  <p className="muted">Vælg en eller flere filer. Løb lægges sammen pr. uge i kolonnen "Løbet km", og RPE gættes ud fra din puls, hvis feltet er tomt. Du kan altid rette tallene bagefter. Samme tur importeret to gange tælles kun én gang.</p>
                  <div className="import-row">
                    <input ref={fileRef} type="file" multiple accept=".csv,.gpx,.tcx,text/csv,application/gpx+xml,application/vnd.garmin.tcx+xml" onChange={onFiles} />
                    <label className="check"><input type="checkbox" checked={!!p.includeHikes} onChange={(e) => setHikes(e.target.checked)} /> Tæl vandring og gang med</label>
                  </div>
                  {importMsg && <div className={`advice ${importMsg.warn ? "warn" : ""}`}>{importMsg.text}</div>}
                  {nActs > 0 && (
                    <div className="import-row muted">
                      <span>{nActs} aktiviteter gemt på telefonen{recentAvg != null ? ` · snit sidste 4 uger ${recentAvg} km/uge` : ""}</span>
                      {recentAvg != null && recentAvg !== p.currentKm && <button className="btn ghost" onClick={() => setP({ ...p, currentKm: recentAvg })}>Brug {recentAvg} som km/uge nu</button>}
                      <button className="btn ghost" onClick={clearImports}>Fjern importerede</button>
                    </div>
                  )}
                  <details>
                    <summary>Sådan finder du filerne</summary>
                    <ul>
                      <li><b>Strava, alle ture på én gang:</b> strava.com → Settings → My Account → "Download or Delete Your Account" → Request archive. Du får en zip på mail; pak den ud og vælg <code>activities.csv</code>.</li>
                      <li><b>Strava, én tur:</b> åbn turen → ⋯ → Export GPX.</li>
                      <li><b>Garmin Connect, mange ture:</b> connect.garmin.com → Aktiviteter → filtrér på løb → "Eksportér CSV" øverst til højre.</li>
                      <li><b>Garmin Connect, én tur:</b> åbn turen → tandhjul → Eksportér til GPX eller TCX. FIT-filer kan ikke læses.</li>
                    </ul>
                  </details>
                </div>
                <table>
                  <thead><tr><th>Uge</th><th className="num">Plan</th><th>Løbet km</th><th>RPE</th><th>Hvilepuls</th><th>Vægt</th><th>Søvn t</th><th className="num">Belastning</th><th className="num">ACWR</th></tr></thead>
                  <tbody>
                    {plan.rows.map((r, i) => {
                      const l = log[r.key] || {};
                      const cell = (k) => (
                        <span className="cellwrap">
                          <input type="number" value={l[k] ?? ""} title={k === "km" && l.auto ? `Fra dit ur (${l.n} ture)` : k === "rpe" && l.rpeAuto ? "Gættet ud fra puls – ret gerne" : undefined}
                            onChange={(e) => saveLog({ ...log, [r.key]: { ...l, [k]: e.target.value === "" ? "" : +e.target.value, ...(k === "rpe" ? { rpeAuto: false } : {}), ...(k === "km" ? { auto: false } : {}) } })} />
                          {((k === "km" && l.auto) || (k === "rpe" && l.rpeAuto)) && <i className="tag" aria-label="importeret">⌚</i>}
                        </span>
                      );
                      return (
                        <tr key={r.i} style={r.i === cur.i ? { background: "#1c1c1c" } : undefined}>
                          <td style={{ whiteSpace: "nowrap" }}><b>{r.i}</b> <span className="muted">u{r.iso}</span></td>
                          <td className="num">{r.km}</td>
                          <td>{cell("km")}</td><td>{cell("rpe")}</td><td>{cell("hr")}</td><td>{cell("wt")}</td><td>{cell("sleep")}</td>
                          <td className="num">{loads[i] ?? ""}</td>
                          <td className="num"><span className={`pill ${cls(acwr[i])}`}>{acwr[i] != null ? acwr[i].toFixed(2) : "–"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="foot">ACWR = ugens belastning (km × RPE) ÷ gennemsnittet af de sidste 4 uger. Grøn 0,8–1,3 · gul til 1,5 · rød over 1,5 = skær ned. ⌚ = tal fra dit ur. Alt gemmes på din telefon.</p>
                <button className="btn ghost" onClick={() => { if (confirm("Slet hele loggen?")) saveLog({}); }}>Nulstil log</button>
              </div>
            )}
          </div>
          <p className="foot">Planens tal er et loft, ikke et gulv. Ikke lægefaglig rådgivning.</p>
        </section>
      </main>
    </>
  );
}
