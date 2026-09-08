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

/* ================= everyday life ================= */
// How much time a day realistically offers. Drives which days get sessions and how big they may be.
export const AVAIL = [["none", "Ingen tid"], ["short", "Kort (≤ 45 min)"], ["normal", "Normal (1–1½ t)"], ["long", "Lang (2 t+)"]];
const AV = { none: 0, short: 1, normal: 2, long: 3 };
export const TIMES = [["", "Når det passer"], ["morning", "Morgen"], ["noon", "Middag"], ["evening", "Aften"]];
const TIME_ICON = { morning: "☀", noon: "◐", evening: "☾" };
export const LEVELS = [[1, "Begynder – løber under 1 år"], [2, "Motionist – løber jævnt"], [3, "Erfaren – har løbet maraton/ultra"], [4, "Konkurrence – høj volumen i årevis"]];
const PEAK_MULT = { 1: 2.0, 2: 2.6, 3: 3.0, 4: 3.3 };
const LONG_FRAC = { 1: 0.4, 2: 0.5, 3: 0.55, 4: 0.6 };
export const FAMILY = [["single", "Single"], ["partner", "Par uden børn"], ["kids", "Børn hjemme"]];
const day = (avail, time = "", note = "") => ({ avail, time, note });
export const defaultSched = () => [day("normal", "morning"), day("none"), day("normal"), day("normal"), day("none"), day("long"), day("normal")];
// Build a schedule from the old Mon–Fri run-day toggles so existing profiles keep their plan.
const schedFromLegacy = (runDays = [0, 2, 3], longDay = 5) => [0, 1, 2, 3, 4, 5, 6].map((d) => d === longDay ? day("long") : d >= 5 ? day("normal") : day(runDays.includes(d) ? "normal" : "none"));
const schedFor = (p, wkStart) => {
  const A = p.sched?.A || defaultSched();
  if (!p.altWeeks || !p.sched?.B) return { sched: A, label: "" };
  const diff = Math.round((wkStart - parseLocal(p.altStart || p.startDate)) / 86400000 / 7);
  const isA = ((diff % 2) + 2) % 2 === 0;
  return { sched: isA ? A : p.sched.B, label: isA ? "A" : "B" };
};

/* ================= plan engine ================= */
export function buildPlan(p) {
  const level = p.level || 2;
  const start = parseLocal(p.startDate);
  const race = parseLocal(p.raceDate);
  const weeks = Math.max(8, Math.floor(Math.round((race - start) / 86400000) / 7) + 1);
  const raceKm = +p.raceKm;
  const restart = p.breakWeeks >= 2 ? Math.max(20, Math.round(+p.currentKm * 0.65)) : +p.currentKm;
  const peakTarget = Math.min(120, Math.max(45, Math.round(raceKm * 0.95)));
  const peak = Math.min(peakTarget, Math.round(restart * PEAK_MULT[level]));
  const longCap = Math.min(Math.round(raceKm * LONG_FRAC[level]), 50);
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
    // ---- fit the week into the days everyday life actually offers
    const { sched, label: schedLabel } = schedFor(p, wkStart);
    const avail = sched.map((d) => AV[d.avail] ?? 0);
    const order = [5, 6, 0, 1, 2, 3, 4]; // weekend first when we have to pick
    let longDay = avail[p.longDay] >= 3 ? p.longDay : order.find((d) => avail[d] >= 3);
    if (longDay == null) { longDay = order.find((d) => avail[d] >= 2); if (longDay != null && !isRace) lng = Math.min(lng, 16); } // no long slot: long run is capped
    if (longDay == null) { longDay = order.find((d) => avail[d] >= 1); if (longDay != null && !isRace) lng = Math.min(lng, 8); }
    const b2bDay = longDay == null ? null : (longDay + 1) % 7;
    if (b2bDay == null || avail[b2bDay] < 2) sun = 0;
    const maxRun = Math.min(7, Math.max(2, p.maxRunDays || 4));
    const slots = Math.max(0, maxRun - (longDay == null ? 0 : 1)); // the back-to-back run in ultra-prep comes on top
    const cands = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== longDay && !(sun && d === b2bDay) && avail[d] >= 1)
      .sort((a, b) => (b === p.qualityDay) - (a === p.qualityDay) || avail[b] - avail[a] || a - b);
    const runDays = cands.slice(0, slots).sort((a, b) => a - b);
    const qDay = runDays.includes(p.qualityDay) && avail[p.qualityDay] >= 2 ? p.qualityDay : runDays.find((d) => avail[d] >= 2) ?? null;
    const pool = Math.max(0, km - (longDay == null ? 0 : lng) - sun);
    const days = [0, 0, 0, 0, 0, 0, 0];
    const cap = (d) => (avail[d] === 1 ? Math.min(8, Math.max(4, Math.round(km * 0.15))) : Infinity);
    let left = pool, open = [...runDays];
    for (let pass = 0; pass < 3 && left > 0 && open.length; pass++) {
      const w = open.map((d) => (d === qDay ? 1.15 : avail[d] === 1 ? 0.6 : 1));
      const tot = w.reduce((a, b) => a + b, 0);
      const give = open.map((d, k) => Math.min(cap(d) - days[d], Math.round((left * w[k]) / tot)));
      open.forEach((d, k) => (days[d] += give[k]));
      left = pool - runDays.reduce((a, d) => a + days[d], 0);
      open = open.filter((d) => days[d] < cap(d));
    }
    if (longDay != null) days[longDay] = lng;
    if (sun && b2bDay != null) days[b2bDay] = sun;
    const total = days.reduce((a, b) => a + b, 0);
    const unplaced = Math.max(0, km - total);
    rows.push({ i, wkStart, key: ymd(wkStart), iso: isoWeek(wkStart), phase, km: total, target: km, unplaced, lng, sun, deload, isRace, quality, focus, days, longDay, qDay, runDays, sched, schedLabel });
  }
  return { rows, weeks, peak, restart };
}

/* ================= app ================= */
const PLAN_START = "2026-08-24"; // mandag i uge 35
const PROFILE_VERSION = 3;
const DEFAULT = {
  v: PROFILE_VERSION,
  name: "", age: 41, height: 181, weight: 89, restHR: 49, maxHR: 186,
  currentKm: 35, breakWeeks: 0, startDate: PLAN_START, includeHikes: false,
  raceName: "Hammer Trail Winter 50 miles", raceDate: "2027-01-30", raceKm: 83, raceVert: 3400,
  qualityDay: 2, longDay: 5, liftDays: [1, 3],
  sex: "m", level: 2, maxRunDays: 4, family: "single", altWeeks: false, altStart: PLAN_START,
  sched: { A: defaultSched(), B: defaultSched() },
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
      const v = sp.v || 1;
      let migrated = sp;
      // v1 carried an auto-generated start date; move it to the fixed plan start.
      if (v < 2) migrated = { ...migrated, startDate: PLAN_START };
      // v2 had Mon–Fri run toggles; turn them into a 7-day availability schedule.
      if (v < 3) { const A = schedFromLegacy(migrated.runDays, migrated.longDay); const { runDays, ...rest } = migrated; migrated = { ...rest, sched: { A, B: A.map((d) => ({ ...d })) }, maxRunDays: Math.min(6, (runDays?.length ?? 3) + 1) }; }
      setP({ ...DEFAULT, ...migrated, v: PROFILE_VERSION });
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
  const [schedTab, setSchedTab] = useState("A");
  const sched = (p.altWeeks ? p.sched?.[schedTab] : p.sched?.A) || defaultSched();
  const setDay = (i, patch) => { const k = p.altWeeks ? schedTab : "A"; const next = sched.map((d, j) => (j === i ? { ...d, ...patch } : d)); setP({ ...p, sched: { ...(p.sched || {}), [k]: next } }); };
  const toggle = (key, d) => { const s = new Set(p[key]); s.has(d) ? s.delete(d) : s.add(d); setP({ ...p, [key]: [...s].sort() }); };

  const plan = useMemo(() => buildPlan(p), [p]);
  const maxHR = p.maxHR || Math.round(p.sex === "f" ? 206 - 0.88 * p.age : 211 - 0.64 * p.age);
  const bmr = Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5));
  const daysToRace = Math.max(0, Math.round((parseLocal(p.raceDate) - new Date()) / 86400000));
  const todayKey = ymd(thisMonday());
  const cur = plan.rows.find((r) => r.key === todayKey) || plan.rows[0];
  const startD = parseLocal(p.startDate);
  const curSchedLabel = cur.schedLabel;

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
    for (const f of files) { try { parsed = parsed.concat(await parseFile(f)); } catch (err) { errors.push(err?.message || `${f.name}: kunne ikke læses.`); console.error("import", f.name, err); } }
    const next = { ...acts }; let added = 0;
    for (const a of parsed) { if (!next[a.id]) added++; next[a.id] = a; }
    saveActs(next);
    const weeks = applyActivities(next, p.includeHikes);
    const runs = parsed.filter((a) => a.kind === "run").length, hikes = parsed.filter((a) => a.kind === "hike").length, other = parsed.length - runs - hikes;
    setImportMsg({
      warn: errors.length > 0 || parsed.length === 0,
      text: parsed.length === 0 && errors.length ? errors.join(" ")
        : parsed.length === 0 ? "Filen blev læst, men ingen rækker havde både dato og distance over 0. Tjek at det er Stravas activities.csv, Garmins CSV-eksport eller en GPX/TCX-fil."
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

  /* ---- load & ACWR ----
     Chronic load is the mean of the 4 previous calendar weeks. Weeks before the plan start count too (typed in or
     imported from Strava/Garmin); a missing pre-plan week falls back to "Km/uge nu" × RPE 5 so week 1 gets a real ratio. */
  const loadOf = (l) => (l && l.km && l.rpe ? Math.round(l.km * l.rpe) : null);
  const baseline = (+p.currentKm || 0) * 5;
  const acwrFor = (key) => {
    const own = loadOf(log[key]);
    if (own == null) return null;
    const d = parseLocal(key); const prev = []; let est = false;
    for (let k = 1; k <= 4; k++) {
      const pk = ymd(addDays(d, -7 * k)); const l = log[pk]; const v = loadOf(l);
      if (v != null) { prev.push(v); if (l.rpeAuto) est = true; }
      else if (pk < p.startDate && baseline) { prev.push(baseline); est = true; }
    }
    return prev.length ? { v: own / (prev.reduce((a, b) => a + b, 0) / prev.length), est } : null;
  };
  const preRows = [4, 3, 2, 1].map((k) => { const d = addDays(startD, -7 * k); return { i: -k, key: ymd(d), wkStart: d, iso: isoWeek(d), pre: true }; });
  const preLogged = preRows.filter((r) => loadOf(log[r.key]) != null).length;
  const loads = plan.rows.map((r) => loadOf(log[r.key]));
  const acwr = plan.rows.map((r) => acwrFor(r.key));
  const cls = (v) => (v == null ? "l" : v > 1.5 ? "r" : v > 1.3 ? "a" : v < 0.8 ? "l" : "g");

  // coach advice for the current week, based on last logged week
  const lastIdx = [...plan.rows.keys()].reverse().find((i) => loads[i] != null);
  let advice = `Denne uge: ${cur.km} km, ${cur.qDay != null ? `hård session ${DAYS[cur.qDay].toLowerCase()} (${cur.quality})` : "ingen hård session – ingen dag med tid nok"}, lang tur ${cur.lng} km${cur.longDay != null ? ` ${DAYS[cur.longDay].toLowerCase()}` : ""}. Rolige ture under ${Math.round(maxHR * 0.7)} i puls.`;
  let warn = false;
  if (cur.unplaced >= 3) { advice = `Din hverdag giver plads til ${cur.km} af de ${cur.target} km, planen gerne vil have i denne uge. Enten åbner du en dag mere under "Din hverdag", eller også accepterer du de ${cur.km} km – det er ikke en fejl at leve et normalt liv.`; warn = true; }
  if (lastIdx != null) {
    const a = acwr[lastIdx]?.v; const l = log[plan.rows[lastIdx].key];
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
            <div className="row2">
              <label>Køn<select value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value })}><option value="m">Mand</option><option value="f">Kvinde</option><option value="x">Andet</option></select></label>
              <label>Uger uden løb for nylig
                <select value={p.breakWeeks} onChange={(e) => setP({ ...p, breakWeeks: +e.target.value })}>
                  <option value={0}>Ingen pause</option><option value={1}>1 uge</option><option value={2}>2 uger</option><option value={4}>4+ uger</option>
                </select>
              </label>
            </div>
            <label>Form og erfaring
              <select value={p.level} onChange={(e) => setP({ ...p, level: +e.target.value })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <div className="muted" style={{ marginTop: 6 }}>Køn bruges til kalorier og pulsestimat. Form styrer hvor stejlt planen må stige.</div>
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
            <h2>Din hverdag</h2>
            <div className="row2">
              <label>Familie<select value={p.family} onChange={(e) => setP({ ...p, family: e.target.value, altWeeks: e.target.value === "kids" ? p.altWeeks : false })}>{FAMILY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Løbedage om ugen (inkl. lang tur)<select value={p.maxRunDays} onChange={(e) => setP({ ...p, maxRunDays: +e.target.value })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} dage</option>)}</select></label>
            </div>
            {p.family === "kids" && (
              <div style={{ marginTop: 8 }}>
                <label className="check"><input type="checkbox" checked={!!p.altWeeks} onChange={(e) => setP({ ...p, altWeeks: e.target.checked })} /> Deleordning – ugerne skifter (uge A / uge B)</label>
                {p.altWeeks && <label style={{ marginTop: 6 }}>Første uge A starter mandag<input type="date" value={p.altStart} onChange={(e) => { if (e.target.value) setP({ ...p, altStart: ymd(mondayOf(parseLocal(e.target.value))) }); }} /></label>}
              </div>
            )}
            {p.altWeeks && <div className="tabs" style={{ margin: "10px 0 6px" }}>{["A", "B"].map((k) => <button key={k} className={schedTab === k ? "on" : ""} onClick={() => setSchedTab(k)}>Uge {k}{k === curSchedLabel ? " · nu" : ""}</button>)}</div>}
            <div className="muted" style={{ margin: "8px 0 4px" }}>Hvor meget tid har du hver dag, og hvad skal der ellers ske?</div>
            <div className="sched">
              {DAYS.map((d, i) => {
                const row = sched[i] || day("none");
                return (
                  <div key={d} className={`sched-row ${row.avail === "none" ? "off" : ""}`}>
                    <b>{d}</b>
                    <select value={row.avail} onChange={(e) => setDay(i, { avail: e.target.value })}>{AVAIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <select value={row.time} onChange={(e) => setDay(i, { time: e.target.value })} disabled={row.avail === "none"}>{TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <input value={row.note} placeholder={i === 2 ? "fx hente børn 15.30" : i === 5 ? "fx børn hos den anden" : "note"} maxLength={40} onChange={(e) => setDay(i, { note: e.target.value })} />
                  </div>
                );
              })}
            </div>
            <label>Styrkedage</label>
            <div className="days">{DAYS.map((d, i) => <button key={d} className={p.liftDays.includes(i) ? "on" : ""} onClick={() => toggle("liftDays", i)}>{d}</button>)}</div>
            <div className="row2">
              <label>Hård dag (ønsket)<select value={p.qualityDay} onChange={(e) => setP({ ...p, qualityDay: +e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i} disabled={(AV[sched[i]?.avail] ?? 0) < 2}>{d}</option>)}</select></label>
              <label>Lang tur (ønsket)<select value={p.longDay} onChange={(e) => setP({ ...p, longDay: +e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i} disabled={(AV[sched[i]?.avail] ?? 0) < 3}>{d}</option>)}</select></label>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>Planen lægger kun løb på dage med tid. Korte dage får max 8 km, den lange tur lander på en dag med "Lang", og back-to-back-turen dagen efter i ultra-prep kommer oveni. Har ugen ikke plads til alle km, får du besked i stedet for et umuligt program.</div>
          </section>
        </aside>

        <section style={{ display: "grid", gap: 16 }}>
          <div className="panel">
            <h2>Uge {cur.i} · u{cur.iso} · {cur.phase}{cur.deload ? " · nedtrapning" : ""}{cur.schedLabel ? ` · uge ${cur.schedLabel}` : ""}</h2>
            <div className="thisweek">
              {cur.days.map((v, i) => {
                const hard = i === cur.qDay && v > 0; const long = i === cur.longDay && v > 0; const lift = p.liftDays.includes(i);
                const b2b = cur.sun > 0 && i === (cur.longDay + 1) % 7 && v > 0;
                const d = cur.sched[i] || {};
                return (
                  <div key={i} className={long ? "long" : hard ? "hard" : lift && !v ? "lift" : ""}>
                    <small>{DAYS[i]}{d.time && v > 0 ? ` ${TIME_ICON[d.time]}` : ""}</small>
                    <b>{v || (lift ? "S" : "–")}</b>
                    <small>{v ? (long ? "lang" : hard ? "hård" : b2b ? "B2B" : "rolig") : lift ? "styrke" : d.avail === "none" ? "fri" : "hvile"}</small>
                    {v > 0 && lift && <small style={{ display: "block", color: "var(--violet)" }}>+ styrke</small>}
                    {d.note && <small className="note">{d.note}</small>}
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
                        <td className="num"><b style={r.unplaced >= 3 ? { color: "var(--amber)" } : undefined} title={r.unplaced >= 3 ? `Planen ville gerne ${r.target} km – hverdagen giver plads til ${r.km}` : undefined}>{r.km}</b>{r.unplaced >= 3 ? <span className="muted"> /{r.target}</span> : ""}</td>
                        {r.days.map((v, i) => <td key={i} className="num" style={i === r.longDay && v ? { color: "var(--orange)", fontWeight: 700 } : i === r.qDay && v ? { color: "var(--volt)", fontWeight: 600 } : undefined}>{v || ""}</td>)}
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
                    <input ref={fileRef} type="file" multiple onChange={onFiles} />
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
                  <div className="muted" style={{ margin: "6px 0 10px" }}>
                    Baseline til ACWR: {preLogged} af de 4 uger før planstart har rigtige tal{preLogged < 4 ? `; resten antages til ${p.currentKm} km × RPE 5` : ""}.
                    {preLogged < 4 && " Hent dit Strava-arkiv eller Garmins CSV med de sidste uger, så bliver de første ACWR-tal ægte."}
                  </div>
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
                    {[...preRows, ...plan.rows].map((r) => {
                      const l = log[r.key] || {};
                      const a = acwrFor(r.key); const ld = loadOf(l);
                      const cell = (k) => (
                        <span className="cellwrap">
                          <input type="number" value={l[k] ?? ""} title={k === "km" && l.auto ? `Fra dit ur (${l.n} ture)` : k === "rpe" && l.rpeAuto ? "Gættet ud fra puls – ret gerne" : undefined}
                            onChange={(e) => saveLog({ ...log, [r.key]: { ...l, [k]: e.target.value === "" ? "" : +e.target.value, ...(k === "rpe" ? { rpeAuto: false } : {}), ...(k === "km" ? { auto: false } : {}) } })} />
                          {((k === "km" && l.auto) || (k === "rpe" && l.rpeAuto)) && <i className="tag" aria-label="importeret">⌚</i>}
                        </span>
                      );
                      return (
                        <tr key={r.key} className={r.pre ? "pre" : ""} style={!r.pre && r.i === cur.i ? { background: "#1c1c1c" } : undefined}>
                          <td style={{ whiteSpace: "nowrap" }}>{r.pre ? <><span className="muted">før</span> <b>{r.i}</b></> : <b>{r.i}</b>} <span className="muted">u{r.iso}</span></td>
                          <td className="num">{r.pre ? (ld == null && baseline ? <span className="muted" title="Antaget: km/uge nu × RPE 5">~{p.currentKm}</span> : "") : r.km}</td>
                          <td>{cell("km")}</td><td>{cell("rpe")}</td><td>{cell("hr")}</td><td>{cell("wt")}</td><td>{cell("sleep")}</td>
                          <td className="num">{ld ?? (r.pre && baseline ? <span className="muted" title="Antaget belastning">~{baseline}</span> : "")}</td>
                          <td className="num"><span className={`pill ${cls(a?.v)}`} title={a?.est ? "Bygger delvist på estimater (antaget baseline eller RPE fra puls)" : undefined}>{a ? (a.est ? "~" : "") + a.v.toFixed(2) : "–"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="foot">ACWR = ugens belastning (km × RPE) ÷ gennemsnittet af de 4 foregående uger. Grøn 0,8–1,3 · gul til 1,5 · rød over 1,5 = skær ned. ⌚ = tal fra dit ur · ~ = bygger på estimat. Alt gemmes på din telefon.</p>
                <button className="btn ghost" onClick={() => { if (confirm("Slet hele loggen?")) saveLog({}); }}>Nulstil log</button>
              </div>
            )}
          </div>
          <p className="foot">Planens tal er et loft, ikke et gulv. Ikke lægefaglig rådgivning. <span style={{ float: "right", opacity: .7 }}>Ultraplan {__APP_VERSION__}</span></p>
        </section>
      </main>
    </>
  );
}
