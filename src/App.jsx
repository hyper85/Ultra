import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ymd, parseLocal, addDays, mondayOf, parseFile, weeklyTotals, kind, mergeActivities, dedupeStore, manualActivity, isWellnessCSV, isReportCSV, wellnessFromCSV, readExcel, decodeText, activitiesFromCSV, XTYPES, xLabel, activityFromStrava } from "./import.js";
import { supabase, syncEnabled, sendLoginLink, signOut, pullRemote, pushRemote, verifyCode, inviteFriend, stravaConnectURL, stravaExchange, stravaStatus, stravaSync, stravaDisconnect, STRAVA_STATE_KEY } from "./sync.js";
import Onboarding, { proteinG, dietTips, INJURY, AREAS, DIETS, INTOL } from "./Onboarding.jsx";
import { BODY, GEAR, buildStrength, DAILY_ANKLE, gearLabel } from "./strength.js";
import { dayTargets, dayTypeOf, weekTargets, mealIdeas, DAY_TYPES } from "./nutrition.js";
import { StrengthSession, NutritionCard } from "./Strength.jsx";
import Dashboard from "./Dashboard.jsx";
import { quoteFor } from "./quotes.js";
import { fitnessReport } from "./fitness.js";
import { shareWeek } from "./share.js";
const actKind = kind; // the today screen shadows `kind` with the day's label
import coachPlan from "./data/coach-plan.json";
import { buildInsights, coachContext } from "./insights.js";
import { describeSession, describeLong, describeEasy } from "./sessions.js";
import { askCoach, proposePlan, loadChat, saveChat, SUGGESTED } from "./coach.js";
import { t, tn, locale, getLang } from "./i18n.js";
import LangSwitch from "./LangSwitch.jsx";
import RaceDay from "./RaceDay.jsx";
import { planToICS, downloadICS } from "./ics.js";

/* ================= storage (swappable) ================= */
const store = {
  async get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/* ================= helpers ================= */
// Danish day names; App() builds the translated copy (DAYS) from these at render time.
const DAYS_DA = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const PH = {
  Genopbygning: "var(--blue)",
  Opbygning: "var(--green)",
  "Ultra-prep": "var(--orange)",
  Nedtrapning: "var(--violet)",
};
const thisMonday = () => mondayOf(new Date());
const fmt = (d) => d.toLocaleDateString(locale(), { day: "numeric", month: "short" });
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

/* ================= coach plan (trænerplan) =================
   The real plan from the coach, week by week, used as-is. Principle 1: its numbers are a ceiling, not a floor.
   Principle 3: the days are fixed (run Mon/Wed/Thu/Sat, lift Tue/Thu, long Sat, back-to-back Sun). */
const PHASE_DA = { Rebuild: "Genopbygning", Build: "Opbygning", "Ultra Prep": "Ultra-prep", Taper: "Nedtrapning" };
export function buildCoachPlan(p) {
  const sched = p.sched?.A || defaultSched();
  const W = coachPlan.week;
  const rows = coachPlan.weeks.map((w) => {
    const days = [...w.days];
    const runDays = days.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const qDay = /kun roligt/i.test(w.session) || w.race ? null : W.qualityDay;
    return { i: w.n, wkStart: parseLocal(w.start), key: w.start, iso: w.iso, phase: PHASE_DA[w.phase] || w.phase, km: w.km, target: w.km, unplaced: 0,
      lng: days[W.longDay], sun: days[W.b2bDay], deload: !!w.deload, isRace: !!w.race, quality: w.session, focus: w.focus, days, longDay: W.longDay, qDay, runDays, sched, schedLabel: "", coach: true };
  });
  return { rows, weeks: rows.length, peak: Math.max(...rows.filter((r) => !r.isRace).map((r) => r.km)), restart: rows[0].km, coach: true };
}

/* ================= plan engine ================= */
export function buildPlan(p) {
  const level = p.level || 2;
  const start = parseLocal(p.startDate || PLAN_START);
  // A profile without a race yet (the questionnaire is not done): plan 16 weeks for 50 km, so nothing divides by NaN.
  const raceD = p.raceDate ? parseLocal(p.raceDate) : null;
  const race = raceD && !isNaN(raceD) && raceD > start ? raceD : addDays(start, 16 * 7);
  const weeks = Math.max(8, Math.floor(Math.round((race - start) / 86400000) / 7) + 1);
  const raceKm = +p.raceKm > 0 ? +p.raceKm : 50;
  const injured = p.injury === "injured", sore = p.injury === "sore";
  // Never below a small floor: a runner who types 0 km still needs a plan that starts somewhere.
  const restart = p.breakWeeks >= 2 || injured ? Math.max(20, Math.round(+p.currentKm * 0.65)) : Math.max(level === 1 ? 12 : 15, Math.round(+p.currentKm * 1.1));
  // Peak volume: enough for the race, never below what the runner already handles, scaled by the chosen model and by injury status.
  const peakTarget = Math.round(Math.max(45, raceKm * 0.95, restart * 1.2) * (injured ? 0.9 : sore ? 0.95 : 1));
  // The model's scale (Minimum 0.8 / Balanceret 1.0 / Volumen 1.15) applies to the final top, after the experience cap,
  // so the three models always differ. Never below a small step above the restart volume, never above 120 km.
  const peak = Math.min(120, Math.max(Math.round(restart * 1.1), Math.round(Math.min(peakTarget, restart * PEAK_MULT[level]) * (p.peakScale || 1))));
  const longCap = Math.min(Math.round(raceKm * LONG_FRAC[level]), 50);
  const taper = 3;
  const rebuild = p.breakWeeks >= 2 || injured ? 4 : 0;
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
      quality = injured ? ["Gå/løb 8×(3 min løb / 1 min gang)", "Gå/løb 6×(5 min løb / 1 min gang)", "Rolig 30 min + stigninger 4×15 s", "Rolig 40 min, kun hvis smertefri"][i - 1]
        : i === 1 ? "Kun roligt" : i === 2 ? "Stigninger 4×20 s" : "6×2 min tærskel";
      focus = injured ? t("Skadesfase{area}: stop ved smerte, der ændrer skridtet. Fod- og hoftestyrke 3×/uge.", { area: p.injuryArea ? ` (${t(p.injuryArea).toLowerCase()})` : "" })
        : i === 1 ? "Returuge. Alt roligt, blødt underlag, ankelarbejde dagligt." : "Rolig genopbygning. Ingen smerte, der ændrer skridtet.";
    } else if (i <= rebuild + build) {
      phase = "Opbygning";
      const j = i - rebuild;
      // Build phase: from a step above current volume (but not above 85 % of peak) up to 65 % of peak.
      // Week 1 of the build sits at the restart volume (after a rebuild block: a step above it), never a 35 % jump.
      const b0 = Math.min(rebuild ? restart * 1.35 : restart, peak * 0.85), b1 = Math.max(peak * 0.65, b0);
      km = Math.round(b0 + (b1 - b0) * ((j - 1) / Math.max(1, build - 1)));
      if (j % 4 === 0 && j !== build) { deload = true; km = Math.round(km * 0.72); }
      quality = sore && j <= 3 ? ["Rolig tempo 12 min", "Rolig tempo 15 min", "Stigninger 6×20 s"][j - 1] : ["8×2 min tærskel", "20 min tempo", "Bakker 6×90 s", "5×3 min tærskel", "25 min tempo"][j % 5];
      focus = sore && j <= 3 ? "Øm: RPE under 6, ingen bakker. Bliver det værre, skift til 'Skadet' under Mere." : deload ? "Nedtrapningsuge. Lad tilpasningen sætte sig." : "Stak aerob volumen. Lang tur på trail med 40–60 g kulhydrat/t.";
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
    if (phase === "Genopbygning") lng = Math.min(lng, injured ? 5 + 3 * i : i === 1 ? 12 : lng);
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
    const maxRun = Math.min(7, Math.max(2, (p.maxRunDays || 4) - (injured ? 1 : 0)));
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
const PROFILE_VERSION = 5;
const DEFAULT = {
  v: PROFILE_VERSION,
  // Blank for a new user: the questionnaire asks for everything. Nothing here belongs to any one runner.
  name: "", age: "", height: "", weight: "", restHR: "", maxHR: 0,
  currentKm: 0, breakWeeks: 0, startDate: PLAN_START, includeHikes: false,
  raceName: "", raceDate: "", raceKm: "", raceVert: "",
  qualityDay: 2, longDay: 5, liftDays: [1, 3],
  sex: "m", level: 2, maxRunDays: 4, family: "single", altWeeks: false, altStart: PLAN_START,
  goal: "finish", body: "keep", gear: "home", onboarded: false, injury: "none", injuryArea: "", injuryNote: "", diet: "all", intol: [], coachMode: false,
  sched: { A: defaultSched(), B: defaultSched() },
};

export default function App() {
  // Translated copies of the label arrays. Built here, not at module level, because the app remounts on a language change.
  const DAYS = DAYS_DA.map((x) => t(x));
  const AVAIL_T = AVAIL.map(([k, l]) => [k, t(l)]);
  const TIMES_T = TIMES.map(([k, l]) => [k, t(l)]);
  const LEVELS_T = LEVELS.map(([k, l]) => [k, t(l)]);
  const FAMILY_T = FAMILY.map(([k, l]) => [k, t(l)]);
  // Day name in running text: lower-case in Danish ("hård session ons"), as-is in English ("hard session Wed").
  const dayLow = (i) => (getLang() === "da" ? DAYS[i].toLowerCase() : DAYS[i]);
  const [p, setPRaw] = useState(DEFAULT);
  // Every user-driven change goes through setP/saveLog/saveActs, which stamp updatedAt for cloud sync.
  const metaRef = useRef({ updatedAt: 0 });
  const [dirty, setDirty] = useState(0);
  const touch = () => { metaRef.current = { updatedAt: Date.now() }; store.set("ultraplan-meta", metaRef.current); setDirty((x) => x + 1); };
  const setP = (v) => { touch(); setPRaw(v); };
  const [log, setLog] = useState({});          // keyed by the Monday of the week ("YYYY-MM-DD")
  const [acts, setActs] = useState({});        // imported activities keyed by id
  const [importMsg, setImportMsg] = useState(null);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState("today");
  const [openMore, setOpenMore] = useState(null); // which "Mere" section to open when arriving from another screen
  const [ready, setReady] = useState(false);
  const fileRef = useRef(null);

  const migrateProfile = (sp) => {
    const v = sp.v || 1;
    let migrated = sp;
    // v1 carried an auto-generated start date; move it to the fixed plan start.
    if (v < 2) migrated = { ...migrated, startDate: PLAN_START };
    // v2 had Mon–Fri run toggles; turn them into a 7-day availability schedule.
    if (v < 3) { const A = schedFromLegacy(migrated.runDays, migrated.longDay); const { runDays, ...rest } = migrated; migrated = { ...rest, sched: { A, B: A.map((d) => ({ ...d })) }, maxRunDays: Math.min(6, (runDays?.length ?? 3) + 1) }; }
    // v3 predates the questionnaire; a profile that already exists has been set up by hand, so don't force it.
    if (v < 4 && Object.keys(sp).length > 0) migrated = { ...migrated, onboarded: true };
    // v4 mixed the race goal and the body goal in one field; "lettere" becomes the body goal "lean".
    if (v < 5 && migrated.goal === "lean") migrated = { ...migrated, goal: "finish", body: "lean" };
    return { ...DEFAULT, ...migrated, v: PROFILE_VERSION };
  };
  useEffect(() => { (async () => {
    const meta = await store.get("ultraplan-meta"); if (meta?.updatedAt) metaRef.current = meta;
    const sp = await store.get("ultraplan-profile");
    if (sp) setPRaw(migrateProfile(sp));
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
  const saveLog = (n) => { touch(); setLog(n); store.set("ultraplan-log", n); };
  const saveActs = (n) => { touch(); setActs(n); store.set("ultraplan-activities", n); };

  /* ---- account & cloud sync (Supabase, optional) ---- */
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!syncEnabled); // without Supabase there is nothing to wait for
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState(null);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const tmr = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(tmr); }, [cooldown]);
  const [syncMsg, setSyncMsg] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviting, setInviting] = useState(false);
  const invite = async (e) => {
    e.preventDefault();
    if (inviting || !inviteEmail.trim()) return;
    setInviting(true); setInviteMsg(null);
    try { await inviteFriend(inviteEmail.trim()); setInviteMsg({ text: t("Invitation sendt til {email}. Linket i mailen virker i 24 timer.", { email: inviteEmail.trim() }) }); setInviteEmail(""); }
    catch (err) { setInviteMsg({ warn: true, text: err.message }); }
    setInviting(false);
  };
  const pulledRef = useRef(false);
  const [pulled, setPulled] = useState(false);
  const prevUserRef = useRef(null); // the account this tab last synced for
  /* ---- Strava ---- */
  const [strava, setStrava] = useState({ connected: null, athlete: null, lastSync: null, busy: false, msg: null });
  const stravaRef = useRef({ synced: false, exchanging: false });
  // Pull new activities from Strava and merge them like a file import (same dedupe, same weekly totals).
  const runStravaSync = async (silent = false) => {
    setStrava((x) => ({ ...x, busy: true, msg: silent ? x.msg : null }));
    try {
      const r = await stravaSync();
      const parsed = (r.activities || []).map(activityFromStrava).filter(Boolean);
      const merged = mergeActivities(actsRef.current, parsed);
      const { next, removed } = dedupeStore(merged.next);
      const { added, replaced } = merged;
      if (added || replaced || removed) { saveActs(next); applyActivities(next, p.includeHikes); }
      const runs = parsed.filter((a) => a.kind === "run").length, others = parsed.length - runs;
      const swapped = replaced + removed;
      setStrava((x) => ({ ...x, connected: true, athlete: r.athlete || x.athlete, lastSync: r.lastSync, busy: false, msg: { text: added ? t("Hentede {added} nye fra Strava ({runs} løb{others}).", { added, runs, others: others ? t(", {n} andet", { n: others }) : "" }) + (swapped ? " " + t("{n} indtastede pas erstattet af urets udgave.", { n: swapped }) : "") : swapped ? t("Strava: ingen nye, men {n} indtastede pas erstattet af urets udgave.", { n: swapped }) : t("Strava: ingen nye aktiviteter.") } }));
    } catch (e) { setStrava((x) => ({ ...x, busy: false, connected: e.connected === false ? false : x.connected, msg: silent && e.status === 404 ? null : { warn: true, text: e.message } })); }
  };
  const actsRef = useRef(acts); actsRef.current = acts;
  const connectStrava = async () => {
    setStrava((x) => ({ ...x, busy: true, msg: null }));
    try { window.location.assign(await stravaConnectURL()); } catch (e) { setStrava((x) => ({ ...x, busy: false, msg: { warn: true, text: e.message } })); }
  };
  const disconnectStrava = async () => {
    if (!confirm(t("Afbryd forbindelsen til Strava? Hentede ture bliver stående."))) return;
    setStrava((x) => ({ ...x, busy: true }));
    try { await stravaDisconnect(); setStrava({ connected: false, athlete: null, lastSync: null, busy: false, msg: { text: t("Strava er afbrudt.") } }); }
    catch (e) { setStrava((x) => ({ ...x, busy: false, msg: { warn: true, text: e.message } })); }
  };
  // Back from Strava (?code=…&state=…): exchange the code once the session is known, then sync.
  useEffect(() => {
    if (!user || !ready || !pulled) return;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code"), state = q.get("state"), scope = q.get("scope") || "";
    if (code && !stravaRef.current.exchanging) {
      stravaRef.current.exchanging = true;
      let expected = null; try { expected = localStorage.getItem(STRAVA_STATE_KEY); localStorage.removeItem(STRAVA_STATE_KEY); } catch { /* ignore */ }
      window.history.replaceState(null, "", window.location.pathname);
      setView("log");
      if (expected && state && expected !== state) { setStrava((x) => ({ ...x, msg: { warn: true, text: t("Strava-svaret passede ikke til denne enhed. Prøv igen.") } })); return; }
      (async () => {
        setStrava((x) => ({ ...x, busy: true }));
        try { const r = await stravaExchange(code, scope); setStrava((x) => ({ ...x, connected: true, athlete: r.athlete, busy: false })); await runStravaSync(); }
        catch (e) { setStrava((x) => ({ ...x, busy: false, msg: { warn: true, text: e.message } })); }
      })();
      return;
    }
    if (stravaRef.current.synced) return;
    stravaRef.current.synced = true;
    (async () => {
      try { const st = await stravaStatus(); setStrava((x) => ({ ...x, connected: st.connected, athlete: st.athlete, lastSync: st.lastSync })); if (st.connected) await runStravaSync(true); }
      catch { setStrava((x) => ({ ...x, connected: false })); }
    })();
  }, [user?.id, ready, pulled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const clock = () => new Date().toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  // Wipe everything stored on this device. Used at logout and when a different account logs in, so two people
  // sharing a phone never see or upload each other's data.
  const clearLocal = () => {
    setPRaw(DEFAULT); setLog({}); setActs({}); metaRef.current = { updatedAt: 0 };
    for (const k of ["ultraplan-profile", "ultraplan-log", "ultraplan-activities", "ultraplan-meta", "ultraplan-owner"]) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const logout = async () => { await signOut(); clearLocal(); setSyncMsg(""); setAuthMsg(null); };
  // On login: newest copy wins. A device that has never been used keeps nothing local, so the cloud copy is taken.
  useEffect(() => {
    if (!user || !ready) { pulledRef.current = false; setPulled(false); return; }
    (async () => {
      try {
        // Another account than the one this device's data belongs to (a friend's invitation link opened on a phone
        // that is already logged in, or a shared phone): wipe the device first, so nothing is shown to or uploaded
        // for the wrong person. The owner mark on disk catches it across restarts; the previous user in this tab
        // catches it when the session is swapped while the app is open.
        const owner = await store.get("ultraplan-owner");
        const switched = (owner && owner !== user.id) || (prevUserRef.current && prevUserRef.current !== user.id);
        if (switched) { clearLocal(); setSyncMsg(t("Skiftet til {who}. Data fra den tidligere konto er fjernet fra denne enhed.", { who: user.email || t("en anden konto") })); }
        prevUserRef.current = user.id;
        store.set("ultraplan-owner", user.id);
        // A pull that never answers (captive portal, flaky network) must not leave the app on the splash screen forever.
        const remote = await Promise.race([pullRemote(user.id), new Promise((_, rej) => setTimeout(() => rej(new Error(t("skyen svarede ikke – viser det, der ligger på enheden"))), 12000))]);
        const localAt = switched ? 0 : metaRef.current.updatedAt || 0;
        if (remote && remote.updatedAt >= localAt) {
          setPRaw(migrateProfile(remote.profile || {})); setLog(remote.log || {}); setActs(remote.activities || {});
          store.set("ultraplan-profile", remote.profile || {}); store.set("ultraplan-log", remote.log || {}); store.set("ultraplan-activities", remote.activities || {});
          metaRef.current = { updatedAt: remote.updatedAt }; store.set("ultraplan-meta", metaRef.current);
          setSyncMsg(t("Hentet fra skyen {time}", { time: clock() }));
        } else if (localAt > 0) {
          await pushRemote(user.id, { profile: p, log, activities: acts, updatedAt: localAt });
          setSyncMsg(t("Gemt i skyen {time}", { time: clock() }));
        }
        pulledRef.current = true;
      } catch (e) { setSyncMsg(t("Synk fejlede: {msg}", { msg: e.message })); }
      setPulled(true);
    })();
  }, [user?.id, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // After any change: push, debounced.
  useEffect(() => {
    if (!user || !pulledRef.current || !dirty) return;
    const snap = { profile: p, log, activities: acts, updatedAt: metaRef.current.updatedAt };
    const tmr = setTimeout(() => pushRemote(user.id, snap).then(() => setSyncMsg(t("Gemt i skyen {time}", { time: clock() }))).catch((e) => setSyncMsg(t("Synk fejlede: {msg}", { msg: e.message }))), 1500);
    return () => clearTimeout(tmr);
  }, [dirty, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const login = async (e) => {
    e?.preventDefault();
    if (cooldown > 0) return;
    try {
      await sendLoginLink(email.trim());
      setCodeSent(true); setCode(""); setCooldown(60);
      setAuthMsg({ text: t("Vi har sendt en mail til {email}. Står der en 6-cifret kode, så skriv den herunder. Ellers tryk på linket i mailen. Kig i spam, hvis den ikke dukker op inden for et minut.", { email: email.trim() }) });
    } catch (err) {
      const m = /after (\d+) seconds/i.exec(err.message || "");
      if (m) { setCooldown(+m[1]); setAuthMsg({ warn: true, text: t("Vent lidt, før du beder om en ny kode. Har du allerede fået en, kan du skrive den herunder.") }); setCodeSent(true); }
      else setAuthMsg({ warn: true, text: /fetch|network/i.test(err.message) ? t("Kunne ikke kontakte login-serveren. Tjek din internetforbindelse og prøv igen.") : err.message });
    }
  };
  const verify = async (e) => {
    e.preventDefault();
    if (code.replace(/\D/g, "").length < 6) { setAuthMsg({ warn: true, text: t("Koden har 6 cifre.") }); return; }
    try { await verifyCode(email.trim(), code); setAuthMsg(null); }
    catch (err) { setAuthMsg({ warn: true, text: /expired|invalid|otp/i.test(err.message) ? t("Koden er forkert eller udløbet. Bed om en ny.") : err.message }); }
  };
  const loginForm = (
    <>
      {!codeSent ? (
        <form onSubmit={login}>
          <label>{t("E-mail")}<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("dig@eksempel.dk")} autoFocus /></label>
          <button className="btn" type="submit" style={{ marginTop: 10, width: "100%" }} disabled={cooldown > 0}>{cooldown > 0 ? t("Send kode ({s} s)", { s: cooldown }) : t("Send kode")}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <div className="muted" style={{ marginBottom: 6 }}>{t("Kode sendt til")} <b style={{ color: "var(--text)" }}>{email.trim()}</b></div>
          <label>{t("Kode fra mailen")}<input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus className="code" /></label>
          <button className="btn" type="submit" style={{ marginTop: 10, width: "100%" }}>{t("Log ind")}</button>
          <div className="import-row" style={{ justifyContent: "space-between", marginTop: 10 }}>
            <button className="btn ghost" type="button" onClick={login} disabled={cooldown > 0}>{cooldown > 0 ? t("Send ny kode om {s} s", { s: cooldown }) : t("Send ny kode")}</button>
            <button className="btn ghost" type="button" onClick={() => { setCodeSent(false); setCode(""); setAuthMsg(null); }}>{t("Anden e-mail")}</button>
          </div>
        </form>
      )}
      {authMsg && <div className={`advice ${authMsg.warn ? "warn" : ""}`}>{authMsg.text}</div>}
    </>
  );

  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === "number" ? +e.target.value : e.target.value });
  // Any chosen date snaps to the Monday of its week so the plan always starts on a Monday.
  const setStart = (str) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return; setP({ ...p, startDate: ymd(mondayOf(parseLocal(str))) }); };
  const shiftStart = (weeks) => setStart(ymd(addDays(parseLocal(p.startDate), weeks * 7)));
  const [schedTab, setSchedTab] = useState("A");
  const sched = (p.altWeeks ? p.sched?.[schedTab] : p.sched?.A) || defaultSched();
  const setDay = (i, patch) => { const k = p.altWeeks ? schedTab : "A"; const next = sched.map((d, j) => (j === i ? { ...d, ...patch } : d)); setP({ ...p, sched: { ...(p.sched || {}), [k]: next } }); };
  const toggle = (key, d) => { const s = new Set(p[key]); s.has(d) ? s.delete(d) : s.add(d); setP({ ...p, [key]: [...s].sort() }); };

  const plan = useMemo(() => (p.coachMode !== false ? buildCoachPlan(p) : buildPlan(p)), [p]);
  const liftDays = plan.coach ? coachPlan.week.liftDays : p.liftDays;
  const liftName = (i) => { const k = liftDays.indexOf(i); return t(k === 0 ? "Styrke A" : k === 1 ? "Styrke B" : k === 2 ? "Styrke C" : "Styrke"); };
  const liftShort = (i) => { const k = liftDays.indexOf(i); return k >= 0 && k < 3 ? "S" + "ABC"[k] : "S"; }; // "SA"/"SB" in the small week strip
  const maxHR = p.maxHR || Math.round(p.sex === "f" ? 206 - 0.88 * p.age : 211 - 0.64 * p.age);
  const bmr = Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5));
  const daysToRace = Math.max(0, Math.round((parseLocal(p.raceDate) - new Date()) / 86400000));
  const todayKey = ymd(thisMonday());
  const lastPlanRow = plan.rows[plan.rows.length - 1];
  const curBase = plan.rows.find((r) => r.key === todayKey) || (todayKey > lastPlanRow.key ? lastPlanRow : plan.rows[0]);
  const todayStr = ymd(new Date());
  const beforePlan = todayKey < plan.rows[0].key;   // the plan has not started yet
  // The coach's plan covers this race but is switched off (the questionnaire and an applied AI proposal switch it off):
  // say so on "I dag" and "Plan", with the week the coach's plan is at, and one tap to switch back.
  const coachNow = coachPlan.weeks.filter((w) => w.start <= todayKey).length;
  const coachOffer = !plan.coach && p.raceDate === coachPlan.race.date && todayKey <= coachPlan.race.date ? { now: coachNow, weeks: coachPlan.weeks.length, start: parseLocal(coachPlan.weeks[0].start) } : null;
  const useCoachPlan = () => setP({ ...p, coachMode: true });
  const coachOfferBox = coachOffer && (
    <div className="advice warn coach-offer">
      <b>{t("Du ser en plan, appen har beregnet")}</b> {t("({n} uger fra {date}).", { n: plan.weeks, date: fmt(plan.rows[0].wkStart) })} {t("Din træners plan har {n} uger fra {date}{today}. Skift, hvis du følger træneren.", { n: coachOffer.weeks, date: fmt(coachOffer.start), today: coachOffer.now >= 1 && coachOffer.now <= coachOffer.weeks ? t(" og er i dag på uge {i} af {n}", { i: coachOffer.now, n: coachOffer.weeks }) : "" })}
      <div style={{ marginTop: 8 }}><button type="button" className="btn" onClick={useCoachPlan}>{t("Brug trænerplanen")}</button></div>
    </div>
  );
  const afterRace = todayStr > p.raceDate;            // the race is behind us
  const startD = parseLocal(p.startDate);
  const curSchedLabel = curBase.schedLabel;

  /* ---- Strava / Garmin import ---- */
  // Write weekly totals from the imported activities into the log. Imported km always win for weeks that have activities;
  // RPE is only estimated where the user has not typed one.
  const applyActivities = (nextActs, includeHikes, base = log) => {
    const weeks = weeklyTotals(nextActs, { includeHikes, maxHR });
    const n = { ...base };
    for (const [k, v] of Object.entries(n)) if (v.auto && !weeks[k]) { const { km, auto, rpeAuto, rpe, n: _n, xmin, xn, xload, ...rest } = v; n[k] = rpeAuto ? rest : { ...rest, ...(rpe != null ? { rpe } : {}) }; }
    for (const [k, w] of Object.entries(weeks)) {
      const l = n[k] || {};
      const rpe = l.rpe != null && l.rpe !== "" && !l.rpeAuto ? l.rpe : w.rpe ?? l.rpe;
      const { xmin, xn, xload, ...keep } = l;
      // km and RPE only when the week has runs; a week with only strength keeps a typed km untouched.
      const runPart = w.n ? { km: w.km, n: w.n, auto: true, ...(rpe != null ? { rpe, rpeAuto: !(l.rpe != null && l.rpe !== "" && !l.rpeAuto) } : {}) } : (l.auto ? (() => { const { km, auto, rpeAuto, rpe: r0, n: _n, ...rest } = l; return { ...rest, ...(!rpeAuto && r0 != null ? { rpe: r0 } : {}) }; })() : {});
      n[k] = { ...keep, ...runPart, ...(w.xn ? { xmin: w.xmin, xn: w.xn, xload: w.xload } : {}) };
    }
    saveLog(n);
    return weeks;
  };
  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImporting(true); setImportMsg(null);
    await new Promise((r) => setTimeout(r, 50)); // let the "Læser…" state paint
    const errors = []; let parsed = []; const wellness = [];
    for (const f of files) {
      try {
        // Garmin's Sleep.csv or a resting-HR table goes into the weekly log; everything else is activities.
        // Reports (Sleep.csv, VO2 max, HRV, resting HR, weight …) go into the weekly log; a report the app has no numbers
        // from (pace, distance, fitness age …) throws a clear message instead of falling into the activity parser.
        // An Excel file is read sheet by sheet; each sheet is routed like a CSV file would be.
        const sheets = /\.xlsx$|\.xlsm$/i.test(f.name) ? await readExcel(f) : /\.csv$/i.test(f.name) ? [{ name: f.name, text: decodeText(await f.arrayBuffer()) }] : null;
        if (!sheets) { parsed = parsed.concat(await parseFile(f)); continue; }
        // A workbook may carry side sheets (notes, goals); their errors are only shown when no sheet gave anything.
        const sheetErrors = []; let gotSheet = false;
        for (const sh of sheets) {
          try {
            if (isWellnessCSV(sh.text) || isReportCSV(sh.text)) wellness.push(wellnessFromCSV(sh.text, sh.name));
            else parsed = parsed.concat(activitiesFromCSV(sh.text, sh.name));
            gotSheet = true;
          } catch (err) { sheetErrors.push(err?.message || t("{name}: kunne ikke læses.", { name: sh.name })); }
        }
        if (!gotSheet) errors.push(...sheetErrors);
      } catch (err) { errors.push(err?.message || t("{name}: kunne ikke læses.", { name: f.name })); console.error("import", f.name, err); }
    }
    let logBase = log; const got = {}; const skippedCols = [];
    if (wellness.length) {
      const n = { ...log };
      for (const w of wellness) {
        for (const [k, v] of Object.entries(w.weeks)) {
          const l = { ...(n[k] || {}) };
          // imported values win where the user has not typed a number
          for (const [key, val] of Object.entries(v)) if (l[key] == null || l[key] === "" || l[`${key}Auto`]) { l[key] = val; l[`${key}Auto`] = true; }
          n[k] = l;
        }
        for (const [key, c] of Object.entries(w.counts)) got[key] = { n: Math.max(got[key]?.n || 0, c), label: w.labels[key] };
        skippedCols.push(...w.skipped);
      }
      logBase = n; if (!parsed.length) saveLog(n);
    }
    const merged = mergeActivities(acts, parsed);
    const { next, removed } = dedupeStore(merged.next);
    const added = merged.added, swapped = merged.replaced + removed;
    let weeks = {};
    if (parsed.length) { saveActs(next); weeks = applyActivities(next, p.includeHikes, logBase); }
    const runs = parsed.filter((a) => a.kind === "run").length, hikes = parsed.filter((a) => a.kind === "hike").length, other = parsed.length - runs - hikes;
    const gotText = Object.values(got).map((g) => t("{label} for {n} uger", { label: g.label, n: g.n })).join(", ");
    const wellText = wellness.length ? " " + t("{got} lagt i loggen.", { got: gotText.charAt(0).toUpperCase() + gotText.slice(1) }) + (skippedCols.length ? " " + t("Sprunget over: {list}.", { list: [...new Set(skippedCols)].slice(0, 5).join(", ") }) : "") : "";
    setImportMsg({
      warn: errors.length > 0 || (parsed.length === 0 && !wellness.length),
      text: parsed.length === 0 && !wellness.length && errors.length ? errors.join(" ")
        : parsed.length === 0 && !wellness.length ? t("Filen blev læst, men ingen rækker havde både dato og distance over 0. Tjek at det er Stravas activities.csv, Garmins CSV-eksport eller en GPX/TCX-fil.")
        : parsed.length === 0 ? wellText.trim() + (errors.length ? " " + errors.join(" ") : "")
        : t("Læste {n} aktiviteter ({runs} løb{hikes}{other}), {added} nye{swapped}. {weeks} uger i loggen har nu km fra dit ur.", { n: parsed.length, runs, hikes: hikes ? t(", {n} vandring", { n: hikes }) : "", other: other ? t(", {n} andet", { n: other }) : "", added, swapped: swapped ? t(", {n} indtastede erstattet af urets udgave", { n: swapped }) : "", weeks: Object.keys(weeks).length }) + wellText + (errors.length ? " " + errors.join(" ") : ""),
    });
    if (fileRef.current) fileRef.current.value = "";
    setImporting(false);
  };
  const actList = useMemo(() => Object.values(acts).sort((x, y) => (x.date < y.date ? 1 : -1)), [acts]);
  const removeActivity = (id) => { const next = { ...acts }; delete next[id]; saveActs(next); applyActivities(next, p.includeHikes); };

  /* ---- day-by-day logging for the current week ---- */
  const [dayEdit, setDayEdit] = useState(null); // { key: Monday of the week, i: weekday index }
  const [dayForm, setDayForm] = useState({ km: "", min: "", rpe: "", type: "Run" });
  const [dayMsg, setDayMsg] = useState(null);
  const [openWeek, setOpenWeek] = useState(null); // week expanded day-by-day in the log
  const [showPre, setShowPre] = useState(false);
  // How to run the week: the hard session with its zone, the long run, the easy runs with the runner's own pace.
  // Used for the current week on Plan and for any week unfolded under "Alle uger".
  const renderGuide = (r) => (
    <div className="guide">
      {r.isRace ? <div><b>{t("Løbsuge")}</b><p>{t(r.focus)}</p></div>
        : r.qDay != null && r.days[r.qDay] > 0 ? (() => { const g = describeSession(r.quality, { maxHR, easyPace: insights.summary.easyPace }); return <div><b>{t("Hård session {day} · {quality}", { day: dayLow(r.qDay), quality: t(r.quality) })}</b><span className="zone">{g.zone}</span><p>{g.text}</p></div>; })()
        : <div><b>{t("Ingen hård session")}</b><p>{describeSession("Kun roligt", { maxHR, easyPace: insights.summary.easyPace }).text}</p></div>}
      {r.longDay != null && r.lng > 0 && !r.isRace && <div><b>{t("Lang tur {day} · {km} km", { day: dayLow(r.longDay), km: r.lng })}</b><p>{describeLong({ km: r.lng, carbs: r.phase === "Ultra-prep" ? "60–90" : "40–60", maxHR, phase: r.phase })}</p></div>}
      {r.sun > 0 && r.longDay != null && <div><b>{t("Back-to-back {day} · {km} km", { day: dayLow((r.longDay + 1) % 7), km: r.sun })}</b><p>{t("Dagen efter den lange tur, på trætte ben: puls under {hr}, gå stigningerne, {carbs} g kulhydrat i timen.", { hr: Math.round(maxHR * 0.7), carbs: r.phase === "Ultra-prep" ? "60–90" : "40–60" })}</p></div>}
      {(() => { const easy = r.days.filter((v, i) => v > 0 && i !== r.qDay && i !== r.longDay && !(r.sun > 0 && i === (r.longDay + 1) % 7)); if (!easy.length) return null; const list = easy.length > 1 ? `${easy.slice(0, -1).join(", ")} ${t("og")} ${easy[easy.length - 1]}` : String(easy[0]); return <div><b>{t("Rolige ture")}</b><p>{describeEasy({ km: list, maxHR, easyPace: insights.summary.easyPace })}</p></div>; })()}
    </div>
  );
  const [openRace, setOpenRace] = useState(false); // "Løbsdag" under Plan; opened from the race card on I dag
  const exportICS = () => downloadICS(planToICS({ rows: plan.rows, liftDays, liftName, race: { name: p.raceName, km: p.raceKm }, dayFor: (key, i) => ymd(addDays(parseLocal(key), i)) }), `ultraplan-${p.raceName ? p.raceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "plan"}.ics`);
  const [openPlanWeek, setOpenPlanWeek] = useState(null); // week expanded in "Alle uger"   // weeks before the plan in the log (empty ones hidden by default)
  const counted = (x) => { const k = kind(x.type); return k === "run" || (k === "hike" && p.includeHikes); };
  const actsByDay = useMemo(() => { const m = {}; for (const x of Object.values(acts)) { if (!counted(x)) continue; (m[x.day] ||= []).push(x); } return m; }, [acts, p.includeHikes]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sessions without km (strength, HIIT, cycling …) by day, so a day with one is not shown as skipped.
  const otherByDay = useMemo(() => { const m = {}; for (const x of Object.values(acts)) { if (counted(x) || kind(x.type) === "hike" || !(x.min > 0)) continue; (m[x.day] ||= []).push(x); } return m; }, [acts, p.includeHikes]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherText = (list) => (list || []).map((x) => `${xLabel(x.type)}${x.km > 0 ? ` ${x.km} km` : ""}${x.min ? ` ${x.min} min` : ""}`).join(", ");
  const dayKmFor = (key) => { const d0 = parseLocal(key); return [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round((actsByDay[ymd(addDays(d0, i))] || []).reduce((s, x) => s + x.km, 0) * 10) / 10); };
  const dayKm = dayKmFor(curBase.key);
  const isEditing = (key, i) => dayEdit?.key === key && dayEdit.i === i;
  const openDay = (key, i, type = "Run") => { setDayEdit(isEditing(key, i) ? null : { key, i }); setDayForm({ km: "", min: "", rpe: "", type }); setDayMsg(null); };
  const saveDay = (e) => {
    e.preventDefault();
    const isRun = dayForm.type === "Run";
    if (!dayEdit || (isRun ? !(+dayForm.km > 0) : !(+dayForm.min > 0))) return;
    const act = manualActivity({ day: ymd(addDays(parseLocal(dayEdit.key), dayEdit.i)), km: isRun ? dayForm.km : 0, min: dayForm.min, rpe: dayForm.rpe, type: dayForm.type });
    const { next, added } = mergeActivities(acts, [act]);
    if (!added) { setDayMsg({ warn: true, text: isRun ? t("Der er allerede en tur den dag med omtrent samme distance. Slet den først, hvis den er forkert.") : t("Der er allerede et pas af den slags den dag med omtrent samme varighed. Slet det først, hvis det er forkert.") }); return; }
    saveActs(next); applyActivities(next, p.includeHikes);
    setDayForm({ km: "", min: "", rpe: "", type: "Run" }); setDayMsg(null); setDayEdit(null); // saved: close the form, the day tile shows the result
  };
  // The small form for one day. planKm is what the plan asked for that day (null for weeks before the plan).
  const renderDayForm = (planKm) => {
    if (!dayEdit) return null;
    const day = ymd(addDays(parseLocal(dayEdit.key), dayEdit.i));
    return (
      <form className="dayform" onSubmit={saveDay}>
        <div className="dayform-head"><b>{DAYS[dayEdit.i]} {fmt(parseLocal(day))}</b> <span className="muted">{planKm != null ? t("· plan {km} km", { km: planKm || 0 }) : t("· før planen")}</span></div>
        {[...(actsByDay[day] || []), ...(otherByDay[day] || [])].map((x) => (
          <div key={x.id} className="dayform-item"><span>✓ {x.km > 0 ? `${x.km} km` : xLabel(x.type)}{x.min ? ` · ${x.min} min` : ""}{x.hr ? ` · ${t("puls")} ${x.hr}` : ""}{x.rpe ? ` · RPE ${x.rpe}` : ""} <span className="muted">· {t(x.source)}</span></span><button type="button" className="btn ghost" onClick={() => removeActivity(x.id)}>{t("Slet")}</button></div>
        ))}
        {((actsByDay[day] || []).length > 0 || (otherByDay[day] || []).length > 0) && <div className="muted" style={{ margin: "8px 0 2px" }}>{t("Tilføj et pas mere:")}</div>}
        <div className="chips dayform-types">{[["Run", "Løb"], ...XTYPES].map(([k, l]) => <button key={k} type="button" className={dayForm.type === k ? "on" : ""} onClick={() => setDayForm({ ...dayForm, type: k })}>{t(l)}</button>)}</div>
        <div className="dayform-row">
          {dayForm.type === "Run" && <label>Km<input type="number" step="0.1" min="0.1" required inputMode="decimal" value={dayForm.km} onChange={(e) => setDayForm({ ...dayForm, km: e.target.value })} autoFocus /></label>}
          <label>{t("Minutter")}<input type="number" min="1" inputMode="numeric" required={dayForm.type !== "Run"} value={dayForm.min} onChange={(e) => setDayForm({ ...dayForm, min: e.target.value })} autoFocus={dayForm.type !== "Run"} /></label>
          <label>RPE 1–10<input type="number" min="1" max="10" inputMode="numeric" value={dayForm.rpe} onChange={(e) => setDayForm({ ...dayForm, rpe: e.target.value })} placeholder={dayForm.type === "Run" ? t("valgfri") : t("fx 7")} /></label>
        </div>
        {dayForm.type !== "Run" && <div className="muted" style={{ marginBottom: 8 }}>{t("Tæller i ugens belastning som minutter × RPE med halv vægt i forhold til løb. En time HIIT ved RPE 8 vejer som 8 km rolig tur.")}</div>}
        <div className="dayform-row">
          <button className="btn" type="submit">{dayForm.type === "Run" ? t("Gem tur") : t("Gem {type}", { type: xLabel(dayForm.type).toLowerCase() })}</button>
          <button className="btn ghost" type="button" onClick={() => setDayEdit(null)}>{t("Luk")}</button>
        </div>
        {dayMsg && <div className={`advice ${dayMsg.warn ? "warn" : ""}`}>{dayMsg.text}</div>}
      </form>
    );
  };
  // Day-by-day strip for one week: plan on top, what was actually run below. Tap a day to log or edit.
  const renderDayGrid = (r) => {
    const km = dayKmFor(r.key);
    return (
      <div className="daygrid">
        {DAYS.map((n, i) => {
          const planKm = r.pre ? null : r.days[i];
          const ok = planKm != null && planKm > 0 && km[i] >= planKm * 0.9;
          const other = otherByDay[ymd(addDays(parseLocal(r.key), i))] || [];
          return (
            <div key={n} role="button" tabIndex={0} className={`${km[i] > 0 ? (ok || planKm === null || !planKm ? "done" : "part") : other.length ? "done" : ""} ${isEditing(r.key, i) ? "edit" : ""}`}
              onClick={() => openDay(r.key, i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDay(r.key, i); } }} title={other.length ? otherText(other) : t("Tryk for at logge eller rette")}>
              <small>{n}</small>
              <b>{km[i] > 0 ? km[i] : other.length ? "✓" : "–"}</b>
              <small className="muted">{other.length && !(km[i] > 0) ? xLabel(other[0].type).toLowerCase() : planKm != null ? (planKm ? t("plan {km}", { km: planKm }) : t("hvile")) : "\u00a0"}</small>
            </div>
          );
        })}
      </div>
    );
  };
  const setHikes = (v) => { setP({ ...p, includeHikes: v }); applyActivities(acts, v); };
  const clearImports = () => { if (!confirm(t("Fjern alle importerede aktiviteter? Tal du selv har skrevet, bliver stående."))) return; applyActivities({}, p.includeHikes); saveActs({}); setImportMsg(null); };
  const nActs = Object.keys(acts).length;
  const recentAvg = useMemo(() => {
    const weeks = weeklyTotals(acts, { includeHikes: p.includeHikes, maxHR });
    const keys = [1, 2, 3, 4].map((w) => ymd(addDays(thisMonday(), -7 * w))).filter((k) => weeks[k]);
    return keys.length ? Math.round(keys.reduce((a, k) => a + weeks[k].km, 0) / keys.length) : null;
  }, [acts, p.includeHikes, maxHR]);
  const curLog = log[curBase.key] || {};

  /* ---- load & ACWR ----
     Chronic load is the mean of the 4 previous calendar weeks. Weeks before the plan start count too (typed in or
     imported from Strava/Garmin); a missing pre-plan week falls back to "Km/uge nu" × RPE 5 so week 1 gets a real ratio. */
  // Week load = km × RPE for the runs, plus other sessions at half weight: minutes × RPE ÷ 12 (an hour of HIIT at
  // RPE 8 counts like an 8 km run at RPE 5). Strength and HIIT tire the body, but not the running tissues as much.
  // A week with km but no RPE (imported runs without heart rate) is estimated at RPE 5 and marked as an estimate.
  const loadOf = (l) => { if (!l) return null; const run = l.km ? l.km * (l.rpe || 5) : 0; const x = l.xload ? l.xload / 12 : 0; return run || x ? Math.round(run + x) : null; };
  const baseline = (+p.currentKm || 0) * 5;
  const acwrFor = (key) => {
    const own = loadOf(log[key]);
    if (own == null) return null;
    const d = parseLocal(key); const prev = []; let est = false;
    for (let k = 1; k <= 4; k++) {
      const pk = ymd(addDays(d, -7 * k)); const l = log[pk]; const v = loadOf(l);
      if (v != null) { prev.push(v); if (l.rpeAuto || (l.km && !l.rpe)) est = true; }
      else if (pk < p.startDate && baseline) { prev.push(baseline); est = true; }
    }
    const ownEst = !!(log[key]?.rpeAuto || (log[key]?.km && !log[key]?.rpe));
    return prev.length ? { v: own / (prev.reduce((a, b) => a + b, 0) / prev.length), est: est || ownEst } : null;
  };
  const nPre = useMemo(() => {
    const keys = [...Object.keys(log).filter((k) => log[k]?.km), ...Object.values(acts).map((x) => ymd(mondayOf(parseLocal(x.day))))].filter((k) => k < p.startDate);
    const earliest = keys.length ? keys.reduce((a, b) => (a < b ? a : b)) : null;
    const back = earliest ? Math.round((startD - parseLocal(earliest)) / 86400000 / 7) : 0;
    return Math.min(30, Math.max(4, back));
  }, [log, acts, p.startDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const preRows = Array.from({ length: nPre }, (_, j) => nPre - j).map((k) => { const d = addDays(startD, -7 * k); return { i: -k, key: ymd(d), wkStart: d, iso: isoWeek(d), pre: true }; });
  const preLogged = preRows.filter((r) => loadOf(log[r.key]) != null).length;
  const loads = plan.rows.map((r) => loadOf(log[r.key]));
  const acwr = plan.rows.map((r) => acwrFor(r.key));
  const cls = (v) => (v == null ? "l" : v > 1.5 ? "r" : v > 1.3 ? "a" : v < 0.8 ? "l" : "g");

  // coach advice for the current week, based on last logged week
  /* ---- trænerråd: principle 2, the advice overrides the plan for the week in progress ----
     Triggers from the last completed week: ACWR > 1.5, or ran > 1.4 × its plan, or resting HR ≥ normal + 7.
     Cap = last week's plan km × 0.75 (× 0.6 when the trigger is resting HR). Run days scale to the cap (< 4 km → 0),
     the hard session becomes easy, the back-to-back run is dropped. Saved in log[week].adjusted so it stays. */
  const [showOriginal, setShowOriginal] = useState(false);
  const lastKey = ymd(addDays(parseLocal(curBase.key), -7));
  const lastRow = plan.rows.find((r) => r.key === lastKey) || null;
  const lastLog = log[lastKey] || null;
  const lastA = acwrFor(lastKey)?.v ?? null;
  const overKm = !!(lastLog?.km && lastRow && lastLog.km > 1.4 * lastRow.km);
  const hrHigh = !!(lastLog?.hr && p.restHR && lastLog.hr >= p.restHR + 7);
  const trigger = !!(lastRow && curBase.km > 0 && !curBase.isRace && ((lastA != null && lastA > 1.5) || overKm || hrHigh));
  const adjRow = useMemo(() => {
    if (!trigger) return null;
    const cap = Math.round(lastRow.km * (hrHigh ? 0.6 : 0.75));
    const base = curBase.days.map((v, i) => (i === 6 && curBase.sun > 0 ? 0 : v));
    let days = base.map((v) => { const s = v * Math.min(1, cap / curBase.km); return s >= 4 ? Math.round(s) : 0; });
    // days that fell under 4 km are dropped; the remaining days share the cap so the week is not far below it
    const kept = base.map((v, i) => (days[i] > 0 ? v : 0)); const keptSum = kept.reduce((x, y) => x + y, 0);
    if (keptSum > 0) days = kept.map((v) => Math.round(v * Math.min(1, cap / keptSum)));
    const km = days.reduce((x, y) => x + y, 0);
    const reason = hrHigh ? t("hvilepuls {hr}", { hr: lastLog.hr }) : lastA != null && lastA > 1.5 ? `ACWR ${lastA.toFixed(2)}` : t("{km} km mod {plan} planlagt", { km: lastLog.km, plan: lastRow.km });
    return { ...curBase, days, km, target: curBase.km, lng: days[curBase.longDay ?? 5] || 0, sun: 0, quality: "Rolig – ingen hård session", qDay: null,
      adjusted: { cap, reason, acwr: lastA, original: curBase.days, originalKm: curBase.km, originalQuality: curBase.quality } };
  }, [trigger, lastRow?.km, hrHigh, lastA, curBase.key, curBase.km, lastLog?.km, lastLog?.hr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready) return;
    const stored = log[curBase.key]?.adjusted || null; const next = adjRow?.adjusted || null;
    if (JSON.stringify(stored) !== JSON.stringify(next)) { const l = { ...(log[curBase.key] || {}) }; if (next) l.adjusted = next; else delete l.adjusted; const n = { ...log, [curBase.key]: l }; setLog(n); store.set("ultraplan-log", n); }
  }, [adjRow, curBase.key, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = adjRow && !showOriginal ? adjRow : curBase;
  // Strength this week: the coach's fixed sessions, or the app's program dosed by phase, body goal and equipment.
  const strengthPlan = useMemo(() => {
    if (plan.coach) { const st = coachPlan.strength; const mk = (key, name, focus, list) => ({ key, name, focus, exercises: list.map((x) => ({ name: x, label: t(x) })) }); return { sessions: [mk("A", t("Styrke A"), t("Ben og hofte"), st.A_tue), mk("B", t("Styrke B"), t("Overkrop og core"), st.B_thu)], daily: st.daily_ankle.map((x) => t(x)), note: t("Trænerens styrkepas, som de er.") }; }
    return buildStrength({ body: p.body, gear: p.gear, phase: cur.phase, deload: cur.deload, isRace: cur.isRace, count: liftDays.length });
  }, [plan.coach, p.body, p.gear, cur.phase, cur.deload, cur.isRace, liftDays.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionFor = (ti) => { const k = liftDays.indexOf(ti); if (k < 0 || !strengthPlan.sessions.length) return null; return strengthPlan.sessions[k % strengthPlan.sessions.length]; };
  // Form against age and sex norms: measured VO2 max from the log when there is one, else estimated from heart rates.
  const latestVo2 = (() => { const keys = Object.keys(log).filter((k) => log[k]?.vo2 > 0).sort(); return keys.length ? +log[keys[keys.length - 1]].vo2 : null; })();
  const fitness = useMemo(() => fitnessReport({ age: p.age, sex: p.sex, restHR: p.restHR, maxHR, vo2: latestVo2 }), [p.age, p.sex, p.restHR, maxHR, latestVo2]);
  // Streak: weeks in a row with logged training (runs or other sessions), counting back from the last completed
  // week; the current week joins once it has something logged.
  const streak = useMemo(() => {
    const trained = (k) => (log[k]?.km > 0) || (log[k]?.xn > 0);
    const done = plan.rows.filter((r) => r.key < cur.key);
    let n = 0;
    for (let k = done.length - 1; k >= 0; k--) { if (trained(done[k].key)) n++; else break; }
    return trained(cur.key) ? n + 1 : n;
  }, [plan.rows, cur.key, log]);
  const [shareMsg, setShareMsg] = useState(null);
  const doShareWeek = async () => {
    const days = DAYS.map((_, i) => { const day = ymd(addDays(parseLocal(cur.key), i)); const other = otherByDay[day] || []; return { km: dayKmFor(cur.key)[i], plan: cur.days[i] || 0, lift: liftDays.includes(i), other: other.length ? xLabel(other[0].type) : null }; });
    const ti = (new Date().getDay() + 6) % 7; const v = cur.days[ti] || 0;
    try {
      const r = await shareWeek({ week: { i: cur.i, n: plan.weeks, deload: cur.deload }, days, ran: (log[cur.key]?.km || 0), plan: cur.km, phase: cur.phase, streak, acwr: acwrFor(cur.key)?.v ?? null, other: log[cur.key]?.xn || 0, race: p.raceName, raceMeta: `${p.raceKm} km · ${p.raceVert || 0} m+ · ${p.raceDate ? new Date(p.raceDate).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) : ""}`, daysToRace: p.raceDate ? daysToRace : null, quote: quoteFor({ type: v > 0 ? (ti === cur.longDay ? "long" : ti === cur.qDay ? "hard" : "easy") : liftDays.includes(ti) ? "lift" : "rest", phase: cur.phase, deload: cur.deload }) });
      setShareMsg(r === "shared" ? t("Delt.") : r === "saved" ? t("Billedet er gemt som PNG. Del det, hvor du vil.") : null);
    } catch (e) { setShareMsg(t("Kunne ikke lave billedet: {msg}", { msg: e.message })); }
    setTimeout(() => setShareMsg(null), 4000);
  };
  // Last week in one line, shown on I dag in the first days of a new week.
  const lastWeek = useMemo(() => {
    const prev = plan.rows.find((r) => r.key === ymd(addDays(parseLocal(cur.key), -7)));
    if (!prev) return null;
    const l = log[prev.key] || {}; const a = acwrFor(prev.key);
    if (!(l.km > 0) && !(l.xn > 0)) return null;
    const pct = prev.km ? Math.round(((l.km || 0) / prev.km) * 100) : null;
    const verdict = pct == null ? "" : pct >= 85 && pct <= 120 ? t("Lige på planen. Bliv ved.") : pct > 120 ? t("Over planen. Planens tal er et loft, så hold igen i denne uge.") : pct >= 60 ? t("Lidt under planen. Det er fint, hvis kroppen havde brug for det.") : t("Langt under planen. Kig på, om dagene passer, eller om ugen bare var svær.");
    return { i: prev.i, km: l.km || 0, plan: prev.km, pct, acwr: a?.v ?? null, xn: l.xn || 0, xmin: l.xmin || 0, sleep: l.sleep, verdict };
  }, [plan.rows, cur.key, log]); // eslint-disable-line react-hooks/exhaustive-deps
  const nutritionFor = (dayType) => ({ targets: dayTargets({ bmr, weight: p.weight, body: p.body, goal: p.goal, diet: p.diet || "all", dayType }), meals: mealIdeas({ diet: p.diet || "all", intol: p.intol || [], dayType, body: p.body }) });
  const planRows = plan.rows.map((r) => (r.key === cur.key ? cur : r));

  const lastIdx = [...plan.rows.keys()].reverse().find((i) => loads[i] != null && plan.rows[i].key < todayKey); // last completed week
  const hrCap70 = Math.round(maxHR * 0.7);
  let advice = t("Denne uge: {km} km, {hard}, lang tur {lng} km{longDay}. Rolige ture under {hr} i puls.", { km: cur.km, hard: cur.qDay != null ? t("hård session {day} ({quality})", { day: dayLow(cur.qDay), quality: t(cur.quality) }) : t("ingen hård session – ingen dag med tid nok"), lng: cur.lng, longDay: cur.longDay != null ? ` ${dayLow(cur.longDay)}` : "", hr: hrCap70 });
  let warn = false;
  if (adjRow) { advice = t("Trænerråd: {reason} i sidste uge – rødt. Ugen er sat ned til {km} km (loft {cap} km), ingen hård session, ingen back-to-back. Rolige ture under {hr} i puls.", { reason: adjRow.adjusted.reason, km: adjRow.km, cap: adjRow.adjusted.cap, hr: hrCap70 }); warn = true; }
  else if (cur.unplaced >= 3) { advice = t('Din hverdag giver plads til {km} af de {target} km, planen gerne vil have i denne uge. Enten åbner du en dag mere under "Din hverdag", eller også accepterer du de {km} km – det er ikke en fejl at leve et normalt liv.', { km: cur.km, target: cur.target }); warn = true; }
  if (lastIdx != null && !adjRow) {
    const a = acwr[lastIdx]?.v; const l = log[plan.rows[lastIdx].key];
    if (a > 1.5) { advice = t("ACWR sidste uge var {acwr} – rødt. Hold denne uge på max {km} km, ingen hårde pas, og lad belastningen falde. Det er ikke at give op; det er at lade betonen hærde.", { acwr: a.toFixed(2), km: Math.round(plan.rows[lastIdx].km * 0.75) }); warn = true; }
    else if (l?.km && l.km > plan.rows[lastIdx].km * 1.4) { advice = t("Du løb {km} km mod {plan} planlagt. Planens tal er et loft. Ram ugens {week} km – og ikke mere.", { km: l.km, plan: plan.rows[lastIdx].km, week: cur.km }); warn = true; }
    else if (l?.hr && p.restHR && l.hr >= p.restHR + 7) { advice = t("Hvilepuls {hr} er 7+ over din normal. Skær 30–50 % af ugens km, sov mere, spis mere.", { hr: l.hr }); warn = true; }
  }

  /* ---- what the app has learned about the runner (deterministic, see insights.js) ---- */
  const insights = useMemo(() => buildInsights({ plan, log, acts, p, todayKey, maxHR, includeHikes: p.includeHikes }), [plan, log, acts, p, todayKey, maxHR]);
  const topInsight = insights.findings.find((f) => f.id !== "empty") || null;
  const applyInsight = (f) => { setP({ ...p, ...f.action.patch }); };

  /* ---- AI coach (Claude via /api/coach; the chat stays on this device) ---- */
  const [chat, setChat] = useState(() => loadChat());
  const [coachQ, setCoachQ] = useState("");
  // Body goal, strength and today's nutrition targets, so the coach can answer about lifting and food too.
  const coachExtra = () => { const ti = (new Date().getDay() + 6) % 7; const v = cur.days[ti] || 0; const dt = dayTypeOf({ km: v, isLong: ti === cur.longDay, isHard: ti === cur.qDay, isRace: cur.isRace && ti === 5, lift: liftDays.includes(ti) }); const n = nutritionFor(dt); return { form: fitness ? { vo2max: fitness.vo2, målt: fitness.measured, kategori: fitness.category, percentil_for_alder_og_køn: fitness.percentile, fitnessalder: fitness.fitnessAge } : null, krop_mål: p.body || "keep", styrke: { pas_pr_uge: liftDays.length, dage: liftDays.map((i) => DAYS[i]), udstyr: gearLabel(p.gear), pas: strengthPlan.sessions.map((x) => `${x.name}: ${x.exercises.map((e) => e.label || e.name).join(", ")}`) }, kost_i_dag: { dagtype: n.targets.dayType, kcal: n.targets.kcal, protein_g: n.targets.protein, kulhydrat_g: n.targets.carbs, fedt_g: n.targets.fat } }; };
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachErr, setCoachErr] = useState(null);
  // The chat is a window of fixed height, like any chat: newest message at the bottom, scrolled into view.
  const chatRef = useRef(null);
  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat, coachBusy, view]);
  const ask = async (q) => {
    const question = (q ?? coachQ).trim();
    if (!question || coachBusy) return;
    setCoachBusy(true); setCoachErr(null); setCoachQ("");
    const history = chat.slice(-8).map(({ role, text }) => ({ role, text }));
    const next = [...chat, { role: "user", text: question, at: Date.now() }];
    setChat(next);
    try {
      const context = coachContext({ p, plan, cur, log, acts, acwrFor, insights, todayStr, maxHR, advice, extra: coachExtra() });
      const text = await askCoach({ question, history, context });
      const done = [...next, { role: "assistant", text, at: Date.now() }];
      setChat(done); saveChat(done);
    } catch (e) { setCoachErr({ text: e.message, setup: !!e.setup }); setChat(chat); }
    setCoachBusy(false);
  };
  // Let the coach propose plan parameters from the watch data; the engine builds the plan, the runner applies it.
  const [proposal, setProposal] = useState(null);
  const [proposing, setProposing] = useState(false);
  const PLAN_KEYS = [["peakScale", t("Top"), (v) => `${Math.round(v * 100)} %`], ["level", t("Niveau"), (v) => LEVELS_T.find(([k]) => k === v)?.[1].split(" – ")[0] || v], ["maxRunDays", t("Løbedage"), (v) => t("{n}/uge", { n: v })], ["longDay", t("Lang tur"), (v) => DAYS[v]], ["currentKm", t("Base"), (v) => t("{n} km/uge", { n: v })]];
  const proposalDiff = (pr) => PLAN_KEYS.filter(([k]) => pr[k] !== (k === "peakScale" ? p.peakScale || 1 : p[k])).map(([k, label, f]) => ({ k, label, from: f(k === "peakScale" ? p.peakScale || 1 : p[k]), to: f(pr[k]) }));
  const askForPlan = async () => {
    if (proposing) return;
    setProposing(true); setCoachErr(null); setProposal(null);
    try {
      const context = coachContext({ p, plan, cur, log, acts, acwrFor, insights, todayStr, maxHR, advice, extra: coachExtra() });
      const { proposal: pr, text } = await proposePlan({ context });
      setProposal({ ...pr, note: text || pr.note, diff: proposalDiff(pr) });
    } catch (e) { setCoachErr({ text: e.message, setup: !!e.setup }); }
    setProposing(false);
  };
  const applyProposal = () => {
    if (!proposal) return;
    const { note, diff, ...patch } = proposal;
    // The long run only lands on the proposed day if that day offers time for it.
    const A = (p.sched?.A || defaultSched()).map((d, i) => (i === patch.longDay && AV[d.avail] < 3 ? { ...d, avail: "long" } : d));
    setP({ ...p, ...patch, sched: { ...(p.sched || {}), A }, coachMode: false }); setProposal(null);
  };

  const zones = [[t("Z1 restitution"), .5, .6, t("Gang, nedjog")], [t("Z2 aerob"), .6, .7, t("80 % af al løb. Hele sætninger.")], [t("Z3 tempo"), .7, .8, t("Behageligt hårdt")], [t("Z4 tærskel"), .8, .9, t("Én sætning ad gangen")], [t("Z5 VO2"), .9, 1, t("Kun korte intervaller")]];
  const macroRows = weekTargets({ bmr, weight: p.weight, body: p.body, goal: p.goal, diet: p.diet || "all" });
  const maxKm = Math.max(...planRows.map((r) => r.km));

  if (!authReady || !ready || (user && !pulled)) return <div className="splash"><h1>Ultraplan</h1><p className="muted">{t("Et øjeblik…")}</p></div>;
  if (syncEnabled && !user) return (
    <div className="landing">
      <div className="landing-hero">
        <LangSwitch className="center" />
        <h1>Ultraplan</h1>
        <p className="lead">{t("Din ultraplan, bygget om din hverdag. Periodiseret træning, pulszoner, kost og belastningstjek, der regner selv ud fra dine tal.")}</p>
        <ul className="landing-list">
          <li><b>{t("Planen følger dit liv.")}</b> {t("Fortæl hvilke dage du har tid, hvornår børnene skal hentes, og hvor ofte du vil løbe. Planen lægger kun løb, hvor der er plads.")}</li>
          <li><b>{t("Dine ture fra uret.")}</b> {t("Hent Strava eller Garmin, eller tast turen på dagen. Ugens km og ACWR-belastning passer, også før ugen er slut.")}</li>
          <li><b>{t("Ærlige tal.")}</b> {t("Planens tal er et loft, ikke et gulv. Bliver belastningen for høj, siger appen det.")}</li>
        </ul>
      </div>
      <div className="panel landing-login">
        <h2>{t("Log ind")}</h2>
        <p className="muted">{t("Skriv din e-mail, så sender vi en kode eller et link. Der er ingen adgangskode, og derfor heller ingen at glemme: bed bare om en ny kode. Har du ikke en konto, oprettes den automatisk.")}</p>
        {loginForm}
        <p className="foot">{t("Dine data gemmes i din konto og følger med på alle enheder. Ikke lægefaglig rådgivning.")}</p>
      </div>
      <p className="foot" style={{ textAlign: "center" }}>Ultraplan {__APP_VERSION__}</p>
    </div>
  );

  if (!p.onboarded) return <Onboarding initial={p} rerun={!!p.rerun} DAYS={DAYS} AVAIL={AVAIL_T} LEVELS={LEVELS_T} FAMILY={FAMILY_T} buildPlan={buildPlan}
    onDone={(final) => { const { rerun, ...rest } = final; setP({ ...rest, onboarded: true, v: PROFILE_VERSION }); window.scrollTo(0, 0); }} />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand" onClick={() => { setView("today"); window.scrollTo(0, 0); }} aria-label={t("Til forsiden")}>Ultraplan</button>
          <button type="button" className="topbar-race" onClick={() => { setView("overblik"); window.scrollTo(0, 0); }} title={t("Se dit overblik")}><b>{daysToRace}</b> {tn(daysToRace, "dag til {race}", "dage til {race}", { race: p.raceName || t("løbet") })}</button>
        </div>
      </header>
      <nav className="tabbar" aria-label={t("Hovedmenu")}>
        {[
          ["today", "I dag", <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>],
          ["plan", "Plan", <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>],
          ["log", "Log", <svg viewBox="0 0 24 24"><path d="M4 12.5l4 4L20 5" /><path d="M4 19h16" opacity=".4" /></svg>],
          ["overblik", "Overblik", <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>],
          ["coach", "Træner", <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" opacity=".6" /></svg>],
          ["more", "Mere", <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="10" cy="17" r="2" fill="currentColor" stroke="none" /></svg>],
        ].map(([k, l, ic]) => (
          <button key={k} className={view === k ? "on" : ""} onClick={() => { setView(k); setOpenMore(null); window.scrollTo({ top: 0 }); }} aria-current={view === k ? "page" : undefined}><span className="ic" aria-hidden="true">{ic}</span>{t(l)}</button>
        ))}
      </nav>

      <main key={view} className="wrap stack view-in" data-view={view}>
        {view === "today" && (() => {
          const ti = (new Date().getDay() + 6) % 7;
          const v = cur.days[ti]; const d = cur.sched[ti] || {}; const lift = liftDays.includes(ti);
          const long = ti === cur.longDay && v > 0, hard = ti === cur.qDay && v > 0, b2b = cur.sun > 0 && ti === (cur.longDay + 1) % 7 && v > 0;
          const raceDay = todayStr === p.raceDate;
          const kind = raceDay ? t("Løbsdag") : v ? (long ? t("Lang tur") : hard ? t("Hård session") : b2b ? t("Back-to-back") : t("Rolig tur")) : lift ? liftName(ti) : t("Hvile");
          const easy = v > 0 && !long && !hard && !b2b; const hrCap = Math.round(maxHR * 0.7);
          const carbs = cur.phase === "Ultra-prep" ? "60–90" : "40–60";
          const session = lift ? sessionFor(ti) : null;
          const todayNut = nutritionFor(dayTypeOf({ km: v, isLong: long, isHard: hard, isRace: raceDay, lift }));
          const ran = dayKm[ti]; const didOther = otherByDay[todayStr] || []; const didStrength = didOther.some((x) => actKind(x.type) === "strength");
          const done = v > 0 ? ran >= v * 0.9 : lift ? didStrength : didOther.length > 0;
          const pct = Math.min(100, Math.round(((curLog.km || 0) / Math.max(1, cur.km)) * 100));
          const dateStr = new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
          if (afterRace) return (
            <>
              <div className="today-date">{dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</div>
              <section className="panel today done">
                <h2 className="today-kind">{t("{race} er overstået", { race: p.raceName || t("Løbet") })}</h2>
                <div className="today-km"><b className="today-rest text">{t("Tillykke")}</b></div>
                <div className="today-sub">{t("Tag mindst en uge helt fri, og løb kun roligt de næste 2–3 uger. Så er du klar til at sætte et nyt mål.")}</div>
                <button className="btn big" type="button" onClick={() => setP({ ...p, onboarded: false, rerun: true })}>{t("Sæt et nyt løb")}</button>
              </section>
            </>
          );
          if (beforePlan) { const days = Math.round((parseLocal(plan.rows[0].key) - parseLocal(todayStr)) / 86400000); return (
            <>
              <div className="today-date">{dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</div>
              <section className="panel today">
                <h2 className="today-kind">{t("Planen starter mandag {date}", { date: fmt(plan.rows[0].wkStart) })}</h2>
                <div className="today-km"><b>{days}</b><span>{days === 1 ? t("dag") : t("dage")}</span></div>
                <div className="today-sub">{t("Uge 1 er {km} km i {phase}. Indtil da: løb roligt, sov godt, og log det du løber, så ACWR-tallet bliver ægte fra dag ét.", { km: plan.rows[0].km, phase: t(plan.rows[0].phase).toLowerCase() })}</div>
                <button className="btn big" type="button" onClick={() => setView("plan")}>{t("Se planen")}</button>
                <button className="btn ghost" type="button" style={{ marginTop: 8 }} onClick={() => setView("more")}>{t("Flyt startdato")}</button>
              </section>
            </>
          ); }
          return (
            <>
              <div className="today-date">{dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} · {t("uge {i} af {n}", { i: cur.i, n: plan.weeks })} · {t(cur.phase)}{plan.coach ? ` · ${t("trænerplan")}` : ""}</div>
              <div className="quote-row">
                <div className="quote">{quoteFor({ type: raceDay ? "race" : v > 0 ? (long ? "long" : hard ? "hard" : "easy") : lift ? "lift" : "rest", phase: cur.phase, deload: cur.deload })}</div>
                {streak >= 2 && <span className="streak" title={t("Uger i træk med logget træning")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-9z" /></svg>{t("{n} uger i træk", { n: streak })}</span>}
              </div>
              {coachOfferBox}
              {lastWeek && ti <= 2 && (
                <div className="advice recap">
                  <b>{t("Sidste uge (uge {i}):", { i: lastWeek.i })}</b> {t("{km} af {plan} km", { km: lastWeek.km, plan: lastWeek.plan })}{lastWeek.pct != null ? ` (${lastWeek.pct} %)` : ""}{lastWeek.xn ? ` · ${t("{n} andre pas, {min} min", { n: lastWeek.xn, min: lastWeek.xmin })}` : ""}{lastWeek.acwr != null ? ` · ACWR ${lastWeek.acwr.toFixed(2)}` : ""}{lastWeek.sleep ? ` · ${t("søvn {h} t", { h: lastWeek.sleep })}` : ""}. {lastWeek.verdict}
                </div>
              )}
              <section className={`panel today ${done ? "done" : ""}`}>
                {(v > 0 || raceDay || (lift && session)) && <h2 className="today-kind">{kind}{d.time && v > 0 ? ` · ${TIME_ICON[d.time]} ${TIMES_T.find(([k]) => k === d.time)?.[1].toLowerCase()}` : ""}</h2>}
                <div className="today-km">{raceDay && !(ran > 0) ? <><b>{p.raceKm}</b><span>km</span></> : ran > 0 ? <><b>{ran}</b><span>km</span></> : v > 0 ? <><b>{v}</b><span>km</span></> : <b className="today-rest text">{lift && session ? session.focus : kind}</b>}</div>
                {hard && <div className="today-sub"><b>{t(cur.quality)}</b></div>}
                {hard && <div className="today-guide">{describeSession(cur.quality, { maxHR, easyPace: insights.summary.easyPace }).text}</div>}
                {easy && <div className="today-sub">{describeEasy({ km: v, maxHR, easyPace: insights.summary.easyPace })}</div>}
                {raceDay && <div className="today-sub">{t("Start absurd roligt, gå hver stigning, spis fra minut 30. Ingen nye sko, intet nyt mad.")}</div>}
                {long && !raceDay && <div className="today-sub">{describeLong({ km: v, carbs, maxHR, phase: cur.phase })}</div>}
                {b2b && <div className="today-sub">{t("Back-to-back på trætte ben. Puls under {hr}. {carbs} g kulhydrat/t.", { hr: hrCap, carbs })}</div>}
                {!v && !raceDay && lift && session && <><div className="today-sub">{session.minutes ? t("Ca. {min} min{rest}. ", { min: session.minutes, rest: session.rest ? t(", pause {rest}", { rest: session.rest }) : "" }) : ""}{strengthPlan.note}</div><StrengthSession session={session} rest={session.rest} compact /></>}
                {!v && !raceDay && lift && !session && <div className="today-sub">{strengthPlan.note || t("Styrkedag. Kort og tungt, ingen løb.")}</div>}
                {!v && !lift && !raceDay && <div className="today-sub">{t("Hviledag. Sov, spis, gå en tur.")}</div>}
                {!raceDay && <div className="today-ankle">{t("Ankel i dag:")} {strengthPlan.daily.join(" · ")}</div>}
                {adjRow && !showOriginal && adjRow.adjusted.original[ti] !== v && <div className="today-sub" style={{ color: "var(--amber)" }}>{t("Justeret af trænerråd ({reason}).", { reason: adjRow.adjusted.reason })} {t("Original:")} {adjRow.adjusted.original[ti] || t("hvile")}{adjRow.adjusted.original[ti] ? " km" : ""}.</div>}
                {v > 0 && p.injury === "injured" && cur.phase === "Genopbygning" && <div className="today-sub" style={{ color: "var(--amber)" }}>{t("Skadesfase: {quality}. Stop ved smerte, der ændrer skridtet.", { quality: t(cur.quality) })}</div>}
                {v > 0 && lift && session && <div className="today-sub">{t("+ {name} i dag efter løbet:", { name: session.name })} {session.exercises.map((e) => e.label || e.name).join(", ")}</div>}
                {d.note && <div className="today-note">{d.note}</div>}
                {ran > 0 && <div className="today-ran">✓ {t("Logget")}{v > 0 ? ` · ${t("planen sagde {km} km", { km: v })}` : lift ? ` · ${t("planen havde {name}", { name: liftName(ti) })}` : ` · ${t("planen havde hvile")}`}{v > 0 && ran > v * 1.4 ? `. ${t("Planens tal er et loft, ikke et gulv.")}` : ""}</div>}
                {didOther.length > 0 && <div className="today-ran">✓ {otherText(didOther)}{lift && !didStrength ? ` · ${t("styrken mangler stadig")}` : !lift && v > 0 && !(ran > 0) ? ` · ${t("i stedet for løbeturen")}` : ""}</div>}
                <button className="btn big" type="button" onClick={() => openDay(cur.key, ti, v > 0 || raceDay || ran > 0 ? "Run" : lift ? "Strength" : "Run")}>{ran > 0 && !(lift && !didStrength) ? t("Ret dagens tur") : lift && !(v > 0) ? (didStrength ? t("Ret dagens styrke") : t("Log styrke")) : v > 0 || raceDay ? t("Log dagens tur") : t("Log et pas alligevel")}</button>
                {v > 0 && lift && !(ran > 0 && didStrength) && <button className="btn ghost" type="button" style={{ marginTop: 8 }} onClick={() => openDay(cur.key, ti, "Strength")}>{didStrength ? t("Ret styrken") : t("Log styrken")}</button>}
                {!lift && !(v > 0) && !raceDay && <button className="btn ghost" type="button" style={{ marginTop: 8 }} onClick={() => openDay(cur.key, ti, "Workout")}>{t("Log styrke, HIIT eller andet")}</button>}
                {dayEdit?.key === cur.key && dayEdit.i === ti && renderDayForm(v)}
              </section>
              {shareMsg && <div className="advice">{shareMsg}</div>}
              <NutritionCard targets={todayNut.targets} meals={todayNut.meals} />

              <section className="panel">
                <div className="row-between"><h2 style={{ margin: 0 }}>{t("Ugen")}</h2><span className="muted">{t("{km} af {plan} km", { km: curLog.km || 0, plan: cur.km })} · <button type="button" className="linkbtn" onClick={doShareWeek}>{t("Del ugen")}</button> · <button type="button" className="linkbtn" onClick={() => setView("overblik")}>{t("Overblik ›")}</button></span></div>
                <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                <div className="thisweek mini">
                  {cur.days.map((w, i) => (
                    <div key={i} className={`${dayKm[i] > 0 && w > 0 && dayKm[i] >= w * 0.9 ? "done" : dayKm[i] > 0 ? "part" : ""} ${i === ti ? "now" : ""} ${isEditing(cur.key, i) && i !== ti ? "edit" : ""}`} onClick={() => (i === ti ? openDay(cur.key, ti) : openDay(cur.key, i))} role="button" tabIndex={0} title={t("Tryk for at logge en tur")}>
                      <small>{DAYS[i]}</small><b>{w || (liftDays.includes(i) ? (plan.coach ? liftShort(i) : "S") : "–")}</b>{dayKm[i] > 0 ? <small className="ran">{dayKm[i]}</small> : (otherByDay[ymd(addDays(parseLocal(cur.key), i))] || []).length > 0 ? <small className="ran">✓</small> : null}
                    </div>
                  ))}
                </div>
                {dayEdit?.key === cur.key && dayEdit.i !== ti && renderDayForm(cur.days[dayEdit.i])}
                <div className={`advice ${warn ? "warn" : ""}`}>{advice}</div>
                {topInsight && (
                  <div className={`insight ${topInsight.level}`}>
                    <span>{topInsight.text}</span>
                    {topInsight.action ? <button type="button" className="btn ghost" onClick={() => applyInsight(topInsight)}>{topInsight.action.label}</button>
                      : <button type="button" className="btn ghost" onClick={() => setView("coach")}>{t("Se alle")}</button>}
                  </div>
                )}
              </section>

              <section className="panel row-between" onClick={() => { setOpenRace(true); setView("plan"); }} role="button" tabIndex={0} style={{ cursor: "pointer" }} title={t("Pacing, mad og pakkeliste til løbet")}>
                <div><div className="muted">{p.raceName || t("Dit løb")}</div><div><b>{p.raceKm} km</b> · {p.raceVert} m+ · {t("top {km} km/uge", { km: plan.peak })}</div></div>
                <div className="count small"><b>{daysToRace}</b><span>{daysToRace === 1 ? t("dag") : t("dage")}</span></div>
              </section>
            </>
          );
        })()}

        {view === "coach" && (
        <section className="stack">
          <h1 className="screen-title">{t("Træner")}</h1>
          <div className="panel coach-grid">
            <div>
            <h3 className="sub">{t("Det appen har lært om dig")}</h3>
            <div className="findings">
              {insights.findings.map((f) => (
                <div key={f.id} className={`finding ${f.level}`}>
                  <span>{f.text}</span>
                  {f.action && <button type="button" className="btn ghost" onClick={() => applyInsight(f)}>{f.action.label}</button>}
                </div>
              ))}
            </div>
            <p className="muted">{t("Bygger på {weeks} i loggen og dine ture dag for dag. Alt kan efterregnes; knapperne ændrer kun det, de siger.", { weeks: tn(insights.summary.weeksLogged, "{n} afsluttet uge", "{n} afsluttede uger") })}</p>
            <h3 className="sub">{t("Lad træneren forme planen")}</h3>
            <p className="muted">{t("Ud fra hele din historik fra uret (måned for måned), de sidste 12 uger i detaljer, loggen og mønstrene foreslår AI-træneren top, niveau, løbedage og lang tur-dag. Appen bygger selv planen af tallene, og intet ændres, før du trykker Anvend.")}{plan.coach ? ` ${t("Trænerplanen har faste uger, så et forslag slår den fra.")}` : ""}</p>
            {!proposal && <button className="btn ghost" type="button" onClick={askForPlan} disabled={proposing || coachBusy}>{proposing ? t("Regner…") : t("Foreslå plan ud fra mine tal")}</button>}
            {proposal && (
              <div className="proposal">
                {proposal.diff.length ? (
                  <table><tbody>{proposal.diff.map((d) => <tr key={d.k}><td>{d.label}</td><td className="num"><span className="muted">{d.from}</span> → <b>{d.to}</b></td></tr>)}</tbody></table>
                ) : <div className="muted">{t("Træneren vil ikke ændre noget: tallene passer til din plan.")}</div>}
                {proposal.note && <p style={{ margin: "10px 0 0" }}>{proposal.note}</p>}
                <div className="import-row" style={{ marginTop: 10 }}>
                  {proposal.diff.length > 0 && <button className="btn" type="button" onClick={applyProposal}>{t("Anvend")}</button>}
                  <button className="btn ghost" type="button" onClick={() => setProposal(null)}>{proposal.diff.length ? t("Afvis") : t("Luk")}</button>
                </div>
              </div>
            )}
            </div>
            <div>
            <h3 className="sub">{t("Spørg træneren")}</h3>
            <p className="muted">{t("En AI-træner, der kender dine tal: plan, log, mønstre og hverdag. Den får aldrig dit navn eller din e-mail. Samtalen gemmes kun på denne enhed.")}</p>
            {chat.length === 0 && <div className="chips">{SUGGESTED.map((q) => <button key={q} type="button" onClick={() => ask(t(q))} disabled={coachBusy}>{t(q)}</button>)}</div>}
            <div className="chat" ref={chatRef} aria-live="polite">
              {chat.length === 0 && !coachBusy && <div className="muted chat-empty">{t("Stil et spørgsmål, eller vælg et af forslagene. Svaret kommer her.")}</div>}
              {chat.map((m, i) => <div key={m.at + "-" + i} className={`msg ${m.role}`}>{m.text}</div>)}
              {coachBusy && <div className="msg assistant muted">{t("Tænker…")}</div>}
            </div>
            {coachErr && <div className="advice warn">{coachErr.text}</div>}
            <form className="chatform" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <input value={coachQ} onChange={(e) => setCoachQ(e.target.value)} placeholder={t("fx Skal jeg løbe, når jeg er forkølet?")} maxLength={800} disabled={coachBusy} />
              <button className="btn" type="submit" disabled={coachBusy || !coachQ.trim()}>{t("Send")}</button>
            </form>
            {chat.length > 0 && <button className="btn ghost" type="button" style={{ marginTop: 10 }} onClick={() => { setChat([]); saveChat([]); setCoachErr(null); }}>{t("Ryd samtalen")}</button>}
            </div>
          </div>
        </section>
        )}

        {view === "more" && (
        <aside className="stack">
          <h1 className="screen-title">{t("Mere")}</h1>
          <details className="panel acc" open>
            <summary><h2>{t("Sprog")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            <div style={{ marginTop: 12 }}><LangSwitch /></div>
            <div className="muted" style={{ marginTop: 8 }}>{t("Valget gemmes på denne enhed.")}</div>
          </details>
          <details className="panel acc" open={syncEnabled}>
            <summary><h2>{t("Konto")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            {!syncEnabled ? (
              <div className="muted">{t("Login er ikke sat op endnu. Alt gemmes lokalt på denne enhed. Se README for opsætning af Supabase.")}</div>
            ) : user ? (
              <>
                <div>{t("Logget ind som")} <b>{user.email}</b></div>
                <div className="muted" style={{ margin: "6px 0 10px" }}>{syncMsg || t("Dine indstillinger, log og ture gemmes i skyen og følger med på alle dine enheder.")}</div>
                <button className="btn ghost" type="button" onClick={logout}>{t("Log ud")}</button>
                <h3 className="sub">{t("Inviter en ven")}</h3>
                <p className="muted">{t("Din ven får en mail med et link, der opretter kontoen. Ingen adgangskode, bare et tryk.")}</p>
                <form className="chatform" onSubmit={invite}>
                  <input type="email" required autoComplete="off" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder={t("ven@eksempel.dk")} disabled={inviting} />
                  <button className="btn" type="submit" disabled={inviting || !inviteEmail.trim()}>{inviting ? t("Sender…") : t("Inviter")}</button>
                </form>
                {inviteMsg && <div className={`advice ${inviteMsg.warn ? "warn" : ""}`}>{inviteMsg.text}</div>}
              </>
            ) : (
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>{t("Log ind for at gemme indstillinger, log og ture, så de følger med på alle dine enheder.")}</div>
                {loginForm}
              </div>
            )}
          </details>

          <details className="panel acc">
            <summary><h2>{t("Start")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={p.coachMode !== false} onChange={(e) => setP({ ...p, coachMode: e.target.checked })} /> {t("Trænerplan – brug trænerens uger som de er")}</label>
            {plan.coach && <div className="muted" style={{ margin: "6px 0 10px" }}>{t("Trænerplanen har faste datoer: uge 1 starter 24. aug. 2026, løbet er 30. jan. 2027. Startdato og dage nedenfor bruges kun, når trænerplanen er slået fra.")}</div>}
            <label>{t("Startdato – vælg en hvilken som helst dag, planen begynder mandag i den uge")}
              <input type="date" value={p.startDate} max={p.raceDate} onChange={(e) => setStart(e.target.value)} />
            </label>
            <div className="quick">
              <button onClick={() => setStart(ymd(addDays(thisMonday(), -7)))}>{t("Sidste uge")}</button>
              <button className={p.startDate === todayKey ? "on" : ""} onClick={() => setStart(todayKey)}>{t("Denne uge")}</button>
              <button onClick={() => setStart(ymd(addDays(thisMonday(), 7)))}>{t("Næste uge")}</button>
            </div>
            <div className="quick">
              <button onClick={() => shiftStart(-1)}>{t("− 1 uge")}</button>
              <button onClick={() => shiftStart(1)}>{t("+ 1 uge")}</button>
            </div>
            <div className="muted">{t("Planen starter mandag {date} og løber {n} uger frem til løbet.", { date: fmt(startD), n: plan.weeks })}</div>
          </details>

          <details className="panel acc">
            <summary><h2>{t("Dig")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            <div className="row2">
              <label>{t("Alder")}<input type="number" value={p.age} onChange={set("age")} /></label>
              <label>{t("Vægt (kg)")}<input type="number" value={p.weight} onChange={set("weight")} /></label>
              <label>{t("Højde (cm)")}<input type="number" value={p.height} onChange={set("height")} /></label>
              <label>{t("Hvilepuls")}<input type="number" value={p.restHR} onChange={set("restHR")} /></label>
              <label>{t("Makspuls")}<input type="number" value={p.maxHR || ""} onChange={set("maxHR")} placeholder={t("tom = estimat")} /></label>
              <label>{t("Km/uge nu")}<input type="number" value={p.currentKm} onChange={set("currentKm")} /></label>
            </div>
            <div className="row2">
              <label>{t("Køn")}<select value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value })}><option value="m">{t("Mand")}</option><option value="f">{t("Kvinde")}</option><option value="x">{t("Andet")}</option></select></label>
              <label>{t("Uger uden løb for nylig")}
                <select value={p.breakWeeks} onChange={(e) => setP({ ...p, breakWeeks: +e.target.value })}>
                  <option value={0}>{t("Ingen pause")}</option><option value={1}>{t("1 uge")}</option><option value={2}>{t("2 uger")}</option><option value={4}>{t("4+ uger")}</option>
                </select>
              </label>
            </div>
            <label>{t("Form og erfaring")}
              <select value={p.level} onChange={(e) => setP({ ...p, level: +e.target.value })}>{LEVELS_T.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <div className="row2" style={{ marginTop: 8 }}>
              <label>{t("Krop")}<select value={p.injury || "none"} onChange={(e) => setP({ ...p, injury: e.target.value })}>{INJURY.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}</select></label>
              {(p.injury || "none") !== "none" && <label>{t("Hvor")}<select value={p.injuryArea || ""} onChange={(e) => setP({ ...p, injuryArea: e.target.value })}><option value="">{t("Vælg")}</option>{AREAS.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></label>}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>{t('Køn bruges til kalorier og pulsestimat. Form styrer hvor stejlt planen må stige. "Skadet" giver 4 ugers genopbygning med gå/løb.')}</div>
          </details>

          <details className="panel acc">
            <summary><h2>{t("Løbet")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            <label>{t("Navn")}<input value={p.raceName} onChange={set("raceName")} /></label>
            <div className="row2">
              <label>{t("Løbsdato")}<input type="date" value={p.raceDate} min={p.startDate} onChange={set("raceDate")} /></label>
              <label>{t("Distance (km)")}<input type="number" value={p.raceKm} onChange={set("raceKm")} /></label>
              <label>{t("Højdemeter")}<input type="number" value={p.raceVert} onChange={set("raceVert")} /></label>
            </div>
          </details>

          <details className="panel acc">
            <summary><h2>{t("Din hverdag")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            <div className="row2">
              <label>{t("Familie")}<select value={p.family} onChange={(e) => setP({ ...p, family: e.target.value, altWeeks: e.target.value === "kids" ? p.altWeeks : false })}>{FAMILY_T.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>{t("Løbedage om ugen (inkl. lang tur)")}<select value={p.maxRunDays} onChange={(e) => setP({ ...p, maxRunDays: +e.target.value })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{t("{n} dage", { n })}</option>)}</select></label>
            </div>
            {p.family === "kids" && (
              <div style={{ marginTop: 8 }}>
                <label className="check"><input type="checkbox" checked={!!p.altWeeks} onChange={(e) => setP({ ...p, altWeeks: e.target.checked })} /> {t("Deleordning – ugerne skifter (uge A / uge B)")}</label>
                {p.altWeeks && <label style={{ marginTop: 6 }}>{t("Første uge A starter mandag")}<input type="date" value={p.altStart} onChange={(e) => { if (e.target.value) setP({ ...p, altStart: ymd(mondayOf(parseLocal(e.target.value))) }); }} /></label>}
              </div>
            )}
            {p.altWeeks && <div className="tabs" style={{ margin: "10px 0 6px" }}>{["A", "B"].map((k) => <button key={k} className={schedTab === k ? "on" : ""} onClick={() => setSchedTab(k)}>{t("Uge {k}", { k })}{k === curSchedLabel ? ` · ${t("nu")}` : ""}</button>)}</div>}
            <div className="muted" style={{ margin: "8px 0 4px" }}>{t("Hvor meget tid har du hver dag, og hvad skal der ellers ske?")}</div>
            <div className="sched">
              {DAYS.map((d, i) => {
                const row = sched[i] || day("none");
                return (
                  <div key={d} className={`sched-row ${row.avail === "none" ? "off" : ""}`}>
                    <b>{d}</b>
                    <select value={row.avail} onChange={(e) => setDay(i, { avail: e.target.value })}>{AVAIL_T.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <select value={row.time} onChange={(e) => setDay(i, { time: e.target.value })} disabled={row.avail === "none"}>{TIMES_T.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <input value={row.note} placeholder={i === 2 ? t("fx hente børn 15.30") : i === 5 ? t("fx børn hos den anden") : t("note")} maxLength={40} onChange={(e) => setDay(i, { note: e.target.value })} />
                  </div>
                );
              })}
            </div>
            <label>{t("Styrkedage")}</label>
            <div className="days">{DAYS.map((d, i) => <button key={d} className={p.liftDays.includes(i) ? "on" : ""} onClick={() => toggle("liftDays", i)}>{d}</button>)}</div>
            <div className="row2">
              <label>{t("Hård dag (ønsket)")}<select value={p.qualityDay} onChange={(e) => setP({ ...p, qualityDay: +e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i} disabled={(AV[sched[i]?.avail] ?? 0) < 2}>{d}</option>)}</select></label>
              <label>{t("Lang tur (ønsket)")}<select value={p.longDay} onChange={(e) => setP({ ...p, longDay: +e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i} disabled={(AV[sched[i]?.avail] ?? 0) < 3}>{d}</option>)}</select></label>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>{t('Planen lægger kun løb på dage med tid. Korte dage får max 8 km, den lange tur lander på en dag med "Lang", og back-to-back-turen dagen efter i ultra-prep kommer oveni. Har ugen ikke plads til alle km, får du besked i stedet for et umuligt program.')}</div>
          </details>
          <details className="panel acc" open={openMore === "strength"}>
            <summary><h2>{t("Styrke")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            {!plan.coach && (
              <>
                <label>{t("Hvad vil du med kroppen?")}</label>
                <div className="chips" style={{ marginTop: 6 }}>{BODY.map(([k, n]) => <button key={k} type="button" className={(p.body || "keep") === k ? "on" : ""} onClick={() => setP({ ...p, body: k })}>{t(n)}</button>)}</div>
                <div className="muted" style={{ margin: "6px 0 10px" }}>{t(BODY.find(([k]) => k === (p.body || "keep"))?.[2])}</div>
                <div className="row2">
                  <label>{t("Udstyr")}<select value={p.gear || "home"} onChange={(e) => setP({ ...p, gear: e.target.value })}>{GEAR.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}</select></label>
                  <label>{t("Styrkedage")}<div className="muted" style={{ marginTop: 10 }}>{liftDays.length ? liftDays.map((i) => DAYS[i]).join(", ") : t("ingen")} · {t('ret under "Din hverdag"')}</div></label>
                </div>
              </>
            )}
            <p className="muted">{strengthPlan.note}{!plan.coach ? ` ${t("Dosis følger fasen: nu {phase}{deload}.", { phase: t(cur.phase).toLowerCase(), deload: cur.deload ? `, ${t("let uge")}` : "" })}` : ""}</p>
            {strengthPlan.sessions.map((x, i) => <StrengthSession key={x.key} session={{ ...x, name: `${x.name}${liftDays[i] != null ? " · " + dayLow(liftDays[i]) : ""}` }} rest={x.rest} />)}
            <div className="tips"><div><b>{t("Ankel · hver dag")}</b><span>{strengthPlan.daily.join(" · ")}</span></div></div>
            {plan.coach && <div className="muted" style={{ marginBottom: 14 }}>{t("Mål:")} {Object.entries(coachPlan.race.goals).map(([k, v]) => `${k} ${v}`).join(" · ")} · {t("spænde {target}.", { target: coachPlan.race.target })}</div>}
          </details>
          <details className="panel acc">
            <summary><h2>{t("Nulstil")}</h2><span className="chev" aria-hidden="true">›</span></summary>
            <div className="reset-list">
              <div><b>{t("Svar på spørgsmålene igen")}</b><span>{t("Dine nuværende svar er udfyldt på forhånd. Log og ture bevares.")}</span><button className="btn ghost" type="button" onClick={() => setP({ ...p, onboarded: false, rerun: true })}>{t("Kør spørgeskemaet igen")}</button></div>
              <div><b>{t("Nulstil indstillinger")}</b><span>{t("Profil, løb, hverdag og kost slettes, og du starter forfra i spørgeskemaet. Log og ture bevares.")}</span><button className="btn ghost" type="button" onClick={() => { if (confirm(t("Nulstil alle indstillinger? Din log og dine ture bevares."))) setP({ ...DEFAULT, v: PROFILE_VERSION, onboarded: false }); }}>{t("Nulstil indstillinger")}</button></div>
              <div><b>{t("Slet alt")}</b><span>{t("Indstillinger, log og alle ture slettes, også i skyen, hvis du er logget ind. Kan ikke fortrydes.")}</span><button className="btn ghost danger" type="button" onClick={() => { if (confirm(t("Slet ALT – indstillinger, log og ture? Kan ikke fortrydes."))) { saveActs({}); saveLog({}); setP({ ...DEFAULT, v: PROFILE_VERSION, onboarded: false }); } }}>{t("Slet alt")}</button></div>
            </div>
          </details>
        </aside>
        )}

        {view === "overblik" && <Dashboard plan={plan} cur={cur} log={log} acts={acts} p={p} acwrFor={acwrFor} insights={insights} liftDays={liftDays} todayKey={todayKey} includeHikes={!!p.includeHikes} fitness={fitness} streak={streak} onShare={doShareWeek} shareMsg={shareMsg} onGo={(v) => setView(v)} />}
        <section className="stack">
          {view === "plan" && (<>
          <h1 className="screen-title">{t("Plan")}</h1>
          <div className="panel">
            <h2>{t("Uge {i} af {n}", { i: cur.i, n: plan.weeks })} · {fmt(cur.wkStart)}–{fmt(addDays(cur.wkStart, 6))} · {t(cur.phase)}{cur.deload && cur.phase !== "Nedtrapning" ? ` · ${t("let uge")}` : ""}{plan.coach ? ` · ${t("trænerplan")}` : ""}{cur.schedLabel ? ` · ${t("skema {k}", { k: cur.schedLabel })}` : ""}</h2>
            {coachOfferBox}
            {adjRow && (
              <div className="adj-badge">
                <span>{showOriginal ? t("Original plan · {km} km", { km: curBase.km }) : t("Justeret af trænerråd ({reason})", { reason: adjRow.adjusted.reason })}</span>
                <button type="button" className="btn ghost" onClick={() => setShowOriginal((s) => !s)}>{showOriginal ? t("Vis justeret") : t("Vis original")}</button>
              </div>
            )}
            <div className="thisweek">
              {cur.days.map((v, i) => {
                const hard = i === cur.qDay && v > 0; const long = i === cur.longDay && v > 0; const lift = liftDays.includes(i);
                const b2b = cur.sun > 0 && i === (cur.longDay + 1) % 7 && v > 0;
                const d = cur.sched[i] || {};
                const other = otherByDay[ymd(addDays(parseLocal(cur.key), i))] || [];
                return (
                  <div key={i} role="button" tabIndex={0} title={t("Tryk for at logge en tur eller et pas")} onClick={() => openDay(cur.key, i, v > 0 ? "Run" : lift ? "Strength" : "Run")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDay(cur.key, i); } }}
                    className={`${long ? "long" : hard ? "hard" : lift && !v ? "lift" : ""} ${dayKm[i] || other.length ? "done" : ""} ${isEditing(cur.key, i) ? "edit" : ""}`}>
                    <small>{DAYS[i]}{d.time && v > 0 ? ` ${TIME_ICON[d.time]}` : ""}</small>
                    <b>{v || (lift ? "S" : "–")}</b>
                    <small>{v ? (long ? t("lang") : hard ? t("hård") : b2b ? "B2B" : t("rolig")) : lift ? liftName(i) : t("Hvile")}</small>
                    {v > 0 && lift && <small style={{ display: "block", color: "var(--violet)" }}>{t("+ styrke")}</small>}
                    {dayKm[i] > 0 && <small className="ran">✓ {dayKm[i]} km</small>}
                    {other.length > 0 && <small className="ran">✓ {otherText(other)}</small>}
                    {d.note && <small className="note">{d.note}</small>}
                  </div>
                );
              })}
            </div>
            {dayEdit?.key === cur.key && renderDayForm(cur.days[dayEdit.i])}
            {renderGuide(cur)}
            {curLog.auto && curLog.km > 0
              ? <div className="muted" style={{ marginTop: 10 }}>{t("Løbet indtil nu i denne uge:")} <b style={{ color: "var(--text)" }}>{curLog.km} km</b> {t("på {runs} af {plan} km planlagt. Tryk på en dag for at logge en tur.", { runs: tn(curLog.n, "{n} tur", "{n} ture"), plan: cur.km })}</div>
              : <div className="muted" style={{ marginTop: 10 }}>{t("Tryk på en dag for at logge en tur – så passer ugens tal, også før ugen er slut.")}</div>}
            <div className={`advice ${warn ? "warn" : ""}`}>{advice}</div>
          </div>

          <div className="panel">
            <h2>{t("Hele planen")}</h2>
            <div className="ribbon">
              {planRows.map((r) => (
                <div key={r.i} className={r.i === cur.i ? "cur" : ""} title={t("Uge {i} · plan {km} km", { i: r.i, km: r.km }) + (log[r.key]?.km ? ` · ${t("løbet {km} km", { km: log[r.key].km })}` : "")}
                  style={{ height: `${(r.km / maxKm) * 100}%`, background: PH[r.phase], opacity: r.deload ? 0.5 : 1 }}>
                  {log[r.key]?.km > 0 && <i className="actual" style={{ height: `${Math.min(100, (log[r.key].km / Math.max(1, r.km)) * 100)}%` }} />}
                  {r.isRace && <span className="star">★</span>}
                </div>
              ))}
            </div>
            <div className="legend">{Object.entries(PH).map(([k, c]) => <span key={k}><i style={{ background: c }} />{t(k)}</span>)}<span><i style={{ background: "var(--muted)", opacity: .5 }} />● {t("let uge")}</span><span><i style={{ background: "rgba(255,255,255,.45)" }} />{t("løbet")}</span></div>
            <div className="import-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost" onClick={exportICS}>{t("Læg planen i din kalender (.ics)")}</button>
              <span className="muted">{t("Én heldagsaftale pr. løbetur, styrkepas og løbet. Åbn filen i Google/Apple/Outlook-kalenderen.")}</span>
            </div>
          </div>

          <details className="panel acc" open={openRace} onToggle={(e) => setOpenRace(e.target.open)}>
            <summary><h2>{t("Løbsdag")} <span className="muted">· {t("pacing, mad og pakkeliste")}</span></h2><span className="chev" aria-hidden="true">›</span></summary>
            <RaceDay p={p} easyPace={insights.summary.easyPace} onGoal={(v) => setP({ ...p, raceGoal: v })} />
          </details>
          </>)}

          <div className="stack">
            {view === "plan" && (
              <div className="panel">
                <h2>{t("Alle uger")}</h2>
                <p className="muted" style={{ marginTop: -4 }}>{t("Tryk på en uge for at se dagene, den hårde session, tempo og den lange tur.")}</p>
                <div className="weeklist">
                  {[...preRows.filter((r) => log[r.key]?.km > 0), ...planRows].map((r) => {
                    const ran = log[r.key]?.km; const km = dayKmFor(r.key);
                    const ranCls = !ran ? "" : r.pre ? "" : ran >= r.km * 0.9 ? "ok" : r.key < todayKey ? "low" : "";
                    const openP = openPlanWeek === r.key;
                    const isCur = !r.pre && r.i === cur.i;
                    const line2 = r.pre ? t("Før planen. Tallene er fra dit ur eller det, du har tastet.")
                      : r.isRace ? `★ ${p.raceName || t("Løbet")} · ${p.raceKm || r.lng} km`
                      : [r.qDay != null && r.days[r.qDay] > 0 ? `${t(r.quality)} ${dayLow(r.qDay)}` : t("Kun roligt"), r.longDay != null && r.lng > 0 ? t("lang tur {km} km {day}", { km: r.lng, day: dayLow(r.longDay) }) : null, r.sun > 0 ? t("back-to-back {km} km", { km: r.sun }) : null].filter(Boolean).join(" · ");
                    return (
                      <div key={r.key} className={`wkcard ${openP ? "open" : ""} ${isCur ? "cur" : ""} ${r.pre ? "pre" : ""} ${r.key < todayKey && !isCur ? "past" : ""}`}>
                        <button type="button" className="wkhead" onClick={() => setOpenPlanWeek(openP ? null : r.key)} aria-expanded={openP}>
                          <span className="wknum">{r.pre ? <small>{t("{n} uger før", { n: -r.i })}</small> : <><b>{r.i}</b>{r.deload && !r.isRace ? <i title={t("let uge")}>●</i> : ""}{r.isRace ? <i className="star">★</i> : ""}</>}</span>
                          <span className="wkmain">
                            <span className="wktitle">{fmt(r.wkStart)}–{fmt(addDays(r.wkStart, 6))}{r.pre ? "" : <> · <i className="phase-dot" style={{ background: PH[r.phase] }} />{t(r.phase)}{r.deload && !r.isRace && r.phase !== "Nedtrapning" ? ` · ${t("let uge")}` : ""}{isCur ? ` · ${t("nu")}` : ""}</>}</span>
                            <span className="wksub">{line2}</span>
                            {!r.pre && <span className="wkdays hide-phone">{DAYS.map((d, i) => { const v = r.days[i]; return <span key={i} className={v ? (i === r.longDay ? "long" : i === r.qDay ? "hard" : "run") : liftDays.includes(i) ? "lift" : ""}><small>{d}</small>{v || (liftDays.includes(i) ? "S" : "–")}{km[i] > 0 && <em className={v && km[i] >= v * 0.9 ? "ok" : ""}>{km[i]}</em>}</span>; })}</span>}
                          </span>
                          <span className="wkkm">
                            {!r.pre && <b style={r.unplaced >= 3 ? { color: "var(--amber)" } : undefined} title={r.unplaced >= 3 ? t("Planen ville gerne {target} km – hverdagen giver plads til {km}", { target: r.target, km: r.km }) : undefined}>{r.km}<small> km</small></b>}
                            {ran > 0 && <span className={`ran ${ranCls}`}>✓ {ran} km</span>}
                          </span>
                          <span className="chev" aria-hidden="true">›</span>
                        </button>
                        {openP && (
                          <div className="wkbody">
                            {!r.pre && <div className="muted" style={{ marginBottom: 8 }}>{t(r.focus)}</div>}
                            {renderDayGrid(r)}
                            {dayEdit?.key === r.key && renderDayForm(r.pre ? null : r.days[dayEdit.i])}
                            {!r.pre && renderGuide(r)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === "more" && (
              <details className="panel acc">
                <summary><h2>{t("Pulszoner")}</h2><span className="chev" aria-hidden="true">›</span></summary>
                <p>{t("Makspuls brugt:")} <b>{maxHR}</b>{!p.maxHR && ` ${t("(estimat – skriv din målte ind)")}`}. {t("Hvilepuls {hr}.", { hr: p.restHR })}</p>
                <table><tbody>{zones.map(([n, lo, hi, txt]) => <tr key={n}><td><b>{n}</b></td><td className="num" style={{ whiteSpace: "nowrap" }}>{Math.round(maxHR * lo)}–{Math.round(maxHR * hi)}</td><td className="muted">{txt}</td></tr>)}</tbody></table>
                <p className="muted">{t("Rolige ture under {hr}. Det føles for langsomt. Det er meningen.", { hr: Math.round(maxHR * 0.7) })}</p>
              </details>
            )}

            {view === "more" && (
              <details className="panel acc">
                <summary><h2>{t("Kost")}</h2><span className="chev" aria-hidden="true">›</span></summary>
                <p>{t("Hvilestofskifte ≈")} <b>{bmr} kcal</b>. {t("Protein")} <b>{proteinG(p.weight, p.body)} g</b> {t("hver dag. Kulhydrat følger arbejdet.")} {t(BODY.find(([k]) => k === (p.body || "keep"))?.[2])}{p.goal === "perform" ? ` ${t("Mål: tid, lidt ekstra på kvalitetsdage.")}` : ""}</p>
                <div className="chips" style={{ marginTop: 0 }}>{BODY.map(([k, n]) => <button key={k} type="button" className={(p.body || "keep") === k ? "on" : ""} onClick={() => setP({ ...p, body: k })}>{t(n)}</button>)}</div>
                <div className="scroll" style={{ marginTop: 10 }}><table className="macro-table"><thead><tr><th>{t("Dag")}</th><th className="num">kcal</th><th className="num">{t("Protein")}</th><th className="num">{t("Kulhydrat")}</th><th className="num">{t("Fedt")}</th></tr></thead><tbody>{macroRows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num"><b>{r.kcal}</b></td><td className="num">{r.protein} g</td><td className="num">{r.carbs} g</td><td className="num">{r.fat} g</td></tr>)}</tbody></table></div>
                <p className="muted">{t('Dagens tal og fire måltidsforslag står på "I dag" og skifter med dagens type. Tallene er et estimat: vægten og energien i hverdagen afgør, om de passer.')}</p>
                {(() => { const tips = dietTips(p.diet || "all", p.intol || []); return (
                  <div className="tips">
                    <div><b>{t("Protein fra")}</b><span>{tips.protein.join(" · ")}</span></div>
                    <div><b>{t("På lange ture")}</b><span>{tips.fuel.join(" · ")}</span></div>
                    {tips.swaps.length > 0 && <div><b>{t("Bytte-tips")}</b><span>{tips.swaps.join(" ")}</span></div>}
                  </div>); })()}
                <div className="row2" style={{ marginTop: 10 }}>
                  <label>{t("Kost")}<select value={p.diet || "all"} onChange={(e) => setP({ ...p, diet: e.target.value })}>{DIETS.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}</select></label>
                  <label>{t("Tåler ikke")}<div className="chips" style={{ marginTop: 6 }}>{INTOL.map((x) => <button key={x} type="button" className={(p.intol || []).includes(x) ? "on" : ""} onClick={() => setP({ ...p, intol: (p.intol || []).includes(x) ? p.intol.filter((y) => y !== x) : [...(p.intol || []), x] })}>{t(x)}</button>)}</div></label>
                </div>
                <p className="muted">{t("Under ture over 90 min: 40 g kulhydrat/t i starten, 60–90 g/t i ultra-prep. Max 0,5 kg vægttab/uge – ellers spis mere.")}</p>
              </details>
            )}

            {view === "log" && (
              <div className="panel scroll">
                <h1 className="screen-title" style={{ marginTop: 0 }}>{t("Log")}</h1>
                {nActs === 0 && !Object.values(log).some((l) => l?.km) && (
                  <div className="empty">
                    <b>{t("Ingen ture endnu")}</b>
                    <span>{t("Log dagens tur på forsiden, eller hent dine ture fra Strava eller Garmin herunder. Så passer ugens tal og belastningen fra første dag.")}</span>
                    <button className="btn" type="button" onClick={() => setView("today")}>{t("Gå til i dag")}</button>
                  </div>
                )}
                <details className="import strava" open={!strava.connected || !!strava.msg}>
                  <summary><h3>Strava{strava.connected ? ` · ${strava.athlete || t("forbundet")}${strava.lastSync ? ` · ${t("synk")} ${new Date(strava.lastSync).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}` : ""}</h3></summary>
                  {!syncEnabled ? <p className="muted">{t("Strava kræver login, og login er ikke sat op i denne udgave.")}</p>
                    : !user ? <p className="muted">{t("Forbind Strava, så henter appen dine ture selv, hver gang du åbner den. Garmin sender automatisk til Strava, når de er koblet sammen i Garmin Connect. Log ind under Mere → Konto først.")}</p>
                    : strava.connected ? (
                      <>
                        <p className="muted">{t("Nye ture hentes, hver gang du åbner appen. Løb tæller i km, styrke og HIIT i minutter. Søvn, hvilepuls, HRV og VO2 max har Strava ikke, dem henter du som rapporter herunder.")}</p>
                        <div className="import-row">
                          <button className="btn" type="button" disabled={strava.busy} onClick={() => runStravaSync()}>{strava.busy ? t("Henter…") : t("Hent nu")}</button>
                          <button className="btn ghost" type="button" disabled={strava.busy} onClick={disconnectStrava}>{t("Afbryd Strava")}</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="muted">{t("Forbind Strava, så henter appen dine ture selv, hver gang du åbner den: løb, styrke, HIIT og cykling fra de sidste 120 dage og alt nyt fremover. Garmin sender automatisk til Strava, når de er koblet sammen i Garmin Connect (Indstillinger → Tilsluttede apps).")}</p>
                        <button className="btn strava-btn" type="button" disabled={strava.busy || strava.connected === null} onClick={connectStrava}>{strava.busy ? t("Et øjeblik…") : t("Forbind Strava")}</button>
                      </>
                    )}
                  {strava.msg && <div className={`advice ${strava.msg.warn ? "warn" : ""}`}>{strava.msg.text}</div>}
                </details>
                <details className="import" open={nActs === 0 || !!importMsg}>
                  <summary><h3>{t("Hent fra filer (Garmin, Strava, Excel)")}{nActs > 0 ? ` · ${t("{n} aktiviteter", { n: nActs })}` : ""}</h3></summary>
                  <p className="muted">{t('Vælg en eller flere filer på én gang: CSV, Excel (.xlsx), GPX, TCX eller Stravas zip. Et regneark med kolonnerne Dato, Km og gerne Tid og RPE virker også. Løb lægges sammen pr. uge i kolonnen "Løbet km", og RPE gættes ud fra din puls, hvis feltet er tomt. Garmins rapporter (Sleep.csv, hvilepuls, vægt, VO2 max, HRV, stress, endurance score) lægges i loggen pr. uge og bruges af trænerrådet og AI-træneren. Rapporter om tempo, distance og tid springes over, for det kommer fra turene. Du kan altid rette tallene bagefter.')}</p>
                  <div className="import-row">
                    <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xlsm,.xls,.gpx,.tcx,.zip,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFiles} disabled={importing} />
                    {importing && <span className="muted">{t("Læser…")}</span>}
                    <label className="check"><input type="checkbox" checked={!!p.includeHikes} onChange={(e) => setHikes(e.target.checked)} /> {t("Tæl vandring og gang med")}</label>
                  </div>
                  {importMsg && <div className={`advice ${importMsg.warn ? "warn" : ""}`}>{importMsg.text}</div>}
                  {nActs > 0 && (
                    <div className="import-row muted">
                      <span>{t("{n} aktiviteter gemt på telefonen", { n: nActs })}{recentAvg != null ? ` · ${t("snit sidste 4 uger {km} km/uge", { km: recentAvg })}` : ""}</span>
                      {recentAvg != null && recentAvg !== p.currentKm && <button className="btn ghost" onClick={() => setP({ ...p, currentKm: recentAvg })}>{t("Brug {km} som km/uge nu", { km: recentAvg })}</button>}
                      <button className="btn ghost" onClick={clearImports}>{t("Fjern importerede")}</button>
                    </div>
                  )}
                  <div className="muted" style={{ margin: "6px 0 10px" }}>
                    {t("Baseline til ACWR: {n} af de 4 uger før planstart har rigtige tal{rest}.", { n: preLogged, rest: preLogged < 4 ? t("; resten antages til {km} km × RPE 5", { km: p.currentKm }) : "" })}
                    {preLogged < 4 && ` ${t("Hent dit Strava-arkiv eller Garmins CSV med de sidste uger, så bliver de første ACWR-tal ægte.")}`}
                  </div>
                  {nActs > 0 && (
                    <details className="actlist">
                      <summary>{t("Se de importerede ture ({n}) – tjek dem mod Garmin/Strava", { n: nActs })}</summary>
                      <div className="scroll">
                        <table>
                          <thead><tr><th>{t("Dato")}</th><th>{t("Type")}</th><th className="num">Km</th><th className="num">Min</th><th className="num">{t("Puls")}</th><th>{t("Tæller i uge")}</th><th>{t("Kilde")}</th><th></th></tr></thead>
                          <tbody>
                            {actList.slice(0, 300).map((x) => {
                              const k = kind(x.type); const counts = k === "run" || (k === "hike" && p.includeHikes);
                              const wk = ymd(mondayOf(parseLocal(x.day)));
                              return (
                                <tr key={x.id} style={counts ? undefined : { opacity: .45 }}>
                                  <td style={{ whiteSpace: "nowrap" }}>{fmt(parseLocal(x.day))} <span className="muted">{new Date(x.date).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</span></td>
                                  <td>{x.type || "–"}{x.name ? <span className="muted"> · {x.name.slice(0, 30)}</span> : ""}</td>
                                  <td className="num">{x.km}</td><td className="num">{x.min ?? ""}</td><td className="num">{x.hr ?? ""}</td>
                                  <td style={{ whiteSpace: "nowrap" }}>{counts ? t("uge fra {date}", { date: fmt(parseLocal(wk)) }) : k === "hike" ? t("nej (vandring slået fra)") : x.min > 0 ? t("som {type} · min × RPE", { type: xLabel(x.type).toLowerCase() }) : t("nej (ingen minutter)")}</td>
                                  <td className="muted">{t(x.source)}</td>
                                  <td><button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => removeActivity(x.id)}>{t("Slet")}</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {actList.length > 300 && <p className="muted">{t("Viser de 300 nyeste af {n}.", { n: actList.length })}</p>}
                      </div>
                    </details>
                  )}
                  <details>
                    <summary>{t("Sådan finder du filerne")}</summary>
                    <ul>
                      <li><b>{t("Strava, alle ture på én gang:")}</b> {t('strava.com → Settings → My Account → "Download or Delete Your Account" → Request archive. Du får en zip på mail; pak den ud og vælg')} <code>activities.csv</code>.</li>
                      <li><b>{t("Strava, én tur:")}</b> {t("åbn turen → ⋯ → Export GPX.")}</li>
                      <li><b>{t("Garmin Connect, mange ture:")}</b> {t('connect.garmin.com → Aktiviteter → filtrér på løb → "Eksportér CSV" øverst til højre.')}</li>
                      <li><b>{t("Garmin Connect, én tur:")}</b> {t("åbn turen → tandhjul → Eksportér til GPX eller TCX. FIT-filer kan ikke læses.")}</li>
                      <li><b>{t("Garmin Connect, søvn:")}</b> {t('Rapporter → Søvn → vælg 1 år → Eksportér (Sleep.csv). Ugerne får "Søvn t" udfyldt.')}</li>
                      <li><b>{t("Garmin Connect, rapporter:")}</b> {t("Rapporter → vælg fx VO2 Max, HRV Status, Average Heart Rate (hvilepuls) eller vægt → 1 år → Eksportér. Daglige, ugentlige og månedlige rækker forstås alle; tallene lægges i loggen pr. uge.")}</li>
                      <li><b>{t("Hvilepuls fra en tabel:")}</b> {t('en CSV med en dato-kolonne og en kolonne "Resting" virker også.')}</li>
                    </ul>
                  </details>
                </details>
                {preRows.length > 0 && <button type="button" className="btn ghost" style={{ marginBottom: 8 }} onClick={() => setShowPre((v) => !v)}>{showPre ? t("Skjul ugerne før planen") : t("Vis {n} uger før planen", { n: preRows.length })}</button>}
                <table>
                  <thead><tr><th>{t("Uge")}</th><th className="num">{t("Plan")}</th><th>{t("Løbet km")}</th><th className="hide-phone">RPE</th><th className="hide-phone">{t("Hvilepuls")}</th><th className="hide-phone">{t("Vægt")}</th><th className="hide-phone">{t("Søvn t")}</th><th className="num hide-phone">{t("Belastning")}</th><th className="num">ACWR</th></tr></thead>
                  <tbody>
                    {[...(showPre ? preRows : []), ...planRows].map((r) => {
                      const l = log[r.key] || {};
                      const a = acwrFor(r.key); const ld = loadOf(l);
                      const cell = (k) => (
                        <span className="cellwrap">
                          <input type="number" min={k === "rpe" ? 1 : 0} max={k === "rpe" ? 10 : undefined} step={k === "km" || k === "sleep" ? 0.1 : 1} value={l[k] ?? ""} title={k === "km" && l.auto ? t("Fra dit ur ({n} ture)", { n: l.n }) : k === "rpe" && l.rpeAuto ? t("Gættet ud fra puls – ret gerne") : l[`${k}Auto`] ? t("Fra dit ur") : undefined}
                            onChange={(e) => saveLog({ ...log, [r.key]: { ...l, [k]: e.target.value === "" ? "" : +e.target.value, ...(k === "rpe" ? { rpeAuto: false } : {}), ...(k === "km" ? { auto: false } : { [`${k}Auto`]: false }) } })} />
                          {((k === "km" && l.auto) || (k !== "km" && l[`${k}Auto`])) && <i className="tag" aria-label={t("importeret")}>⌚</i>}
                        </span>
                      );
                      const open = openWeek === r.key;
                      return (
                        <Fragment key={r.key}>
                        <tr className={r.pre ? "pre" : ""} style={!r.pre && r.i === cur.i ? { background: "#1c1c1c" } : undefined}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button type="button" className={`wk ${open ? "on" : ""}`} onClick={() => setOpenWeek(open ? null : r.key)} title={t("Vis dagene i ugen")} aria-expanded={open}>
                              <span className="chev">{open ? "▾" : "▸"}</span>{r.pre ? <span className="muted">{t("{n} uger før", { n: -r.i })}</span> : <b>{r.i}</b>} <span className="muted">{fmt(r.wkStart)}</span>
                            </button>
                            {r.key === todayKey && <> <span className="pill l" title={t("Ugen er ikke slut – tallene er foreløbige")}>{t("i gang")}</span></>}
                          </td>
                          <td className="num">{r.pre ? (ld == null && baseline ? <span className="muted" title={t("Antaget: km/uge nu × RPE 5")}>~{p.currentKm}</span> : "") : r.km}</td>
                          <td>{cell("km")}</td><td className="hide-phone">{cell("rpe")}</td><td className="hide-phone">{cell("hr")}</td><td className="hide-phone">{cell("wt")}</td><td className="hide-phone">{cell("sleep")}</td>
                          <td className="num hide-phone">{ld ?? (r.pre && baseline ? <span className="muted" title={t("Antaget belastning")}>~{baseline}</span> : "")}</td>
                          <td className="num"><span className={`pill ${cls(a?.v)}`} title={a?.est ? t("Bygger delvist på estimater (antaget baseline eller RPE fra puls)") : undefined}>{a ? (a.est ? "~" : "") + a.v.toFixed(2) : "–"}</span></td>
                        </tr>
                        {open && (
                          <tr className="dayrow"><td colSpan={9}>
                            <div className="phone-only weekfields">
                              <label>RPE{cell("rpe")}</label><label>{t("Hvilepuls")}{cell("hr")}</label><label>{t("Vægt")}{cell("wt")}</label><label>{t("Søvn t")}{cell("sleep")}</label>
                              <div className="muted" style={{ gridColumn: "1 / -1" }}>{t("Belastning {load} = km × RPE", { load: ld ?? (r.pre && baseline ? `~${baseline}` : "–") })}</div>
                            </div>
                            <div className="muted" style={{ marginBottom: 6 }}>{t("{week} fra {date} dag for dag · øverst det du løb, nederst planen. Tryk på en dag for at logge eller rette.", { week: r.pre ? t("Ugen") : t("Uge {i}", { i: r.i }), date: fmt(r.wkStart) })}</div>
                            {renderDayGrid(r)}
                            {log[r.key]?.xmin > 0 && <div className="muted" style={{ marginTop: 6 }}>{t("Andre pas: {n} · {min} min · tæller {load} i belastningen (min × RPE ÷ 12).", { n: log[r.key].xn, min: log[r.key].xmin, load: Math.round(log[r.key].xload / 12) })}</div>}
                            {dayEdit?.key === r.key && renderDayForm(r.pre ? null : r.days[dayEdit.i])}
                          </td></tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <p className="foot">{t("ACWR = ugens belastning (km × RPE) ÷ gennemsnittet af de 4 foregående uger. Grøn 0,8–1,3 · gul til 1,5 · rød over 1,5 = skær ned. ⌚ = tal fra dit ur · ~ = bygger på estimat. Alt gemmes på din telefon.")}</p>
                <button className="btn ghost" onClick={() => { if (confirm(t("Slet hele loggen?"))) saveLog({}); }}>{t("Nulstil log")}</button>
              </div>
            )}
          </div>
          {view === "more" && <p className="foot">{t("Planens tal er et loft, ikke et gulv. Ikke lægefaglig rådgivning.")}<br /><span style={{ opacity: .7 }}>Ultraplan {__APP_VERSION__}</span></p>}
        </section>
      </main>

    </>
  );
}
