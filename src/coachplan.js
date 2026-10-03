/* The coach's plan (trænerplan): the bundled src/data/coach-plan.json, or a plan the runner imported (JSON or Excel)
   under Mere → Trænerplan. An import replaces only the plan – weeks, days, sessions, focus, events – and is kept in
   the profile as p.coachPlan = { data, importedAt, fileName }. It never touches the log: km, RPE, resting HR, sleep,
   weight and the watch data stay as they are.

   Files come in more than one shape: the bundled one ({ n, iso, session, focus }), the coach's export
   ({ week, isoWeek, quality: "Threshold (Wed): 6 reps of 2 min …   free text" }) and v4 with planVersion and events[].
   normalizeCoachPlan() turns any of them into one shape, so the rest of the app reads one thing. */
import bundled from "./data/coach-plan.json";
import { parseCSV, readExcel, decodeText, parseLocal, addDays, ymd } from "./import.js";
import { t } from "./i18n.js";

export const BUNDLED = bundled;

// "Threshold (Wed): 6 reps of 2 min at threshold (Zone 4), 2 min jog.   Back at your old baseline." → short Danish
// session name the session guide understands ("6×2 min tærskel"), and the rest as the week's focus.
const reps = (s, unit) => { const m = new RegExp(`(\\d+)\\s*(?:reps?|x|×)\\s*(?:of\\s*)?(\\d+)\\s*${unit}`, "i").exec(s); return m ? [m[1], m[2]] : null; };
export const shortSession = (text) => {
  const s = String(text || "").trim();
  if (!s) return "";
  if (/easy (running )?only|no hard session|no (quality|threshold)|kun roligt/i.test(s)) return "Kun roligt";
  const strides = /strides?/i.test(s), body = s.replace(/^[^:]{0,40}:\s*/, "");
  let r;
  if (/opener/i.test(s) && (r = reps(body, "min"))) return `Åbnere ${r[0]}×${r[1]} min`;
  if (/race.?pace|løbstempo/i.test(s) && (r = reps(body, "min"))) return `Løbstempo ${r[0]}×${r[1]} min`;
  if (/hill|bakke/i.test(s) && !/threshold|tærskel/i.test(s) && (r = reps(body, "(?:sec|s\\b)"))) return `Bakker ${r[0]}×${r[1]}s`;
  if (/threshold|tærskel/i.test(s) && (r = reps(body, "min"))) return `${r[0]}×${r[1]} min tærskel${/hill|bakke/i.test(s) ? " på bakker" : ""}`;
  if (/tempo/i.test(s)) { r = reps(body, "min"); const one = /(\d+)\s*min\s*tempo/i.exec(body); const core = r ? `${r[0]}×${r[1]} min tempo` : one ? `${one[1]} min tempo` : "Tempo"; return strides ? `Stigninger + ${core}` : core; }
  if (strides && (r = reps(body, "(?:sec|s\\b)"))) return `Stigninger ${r[0]}×${r[1]}s`;
  return s.split(/\s{3,}|\.\s/)[0].slice(0, 60);
};
const splitQuality = (q) => { const [head, ...rest] = String(q || "").split(/\s{3,}/); return { session: shortSession(head), focus: rest.join(" ").trim() }; };

// "11:00", "11h", 660 (minutes) → hours
const hoursOf = (e) => {
  if (+e.hours > 0) return +e.hours;
  if (+e.durationH > 0) return +e.durationH;
  if (+e.minutes > 0) return +e.minutes / 60;
  const d = String(e.duration || e.time || e.expectedTime || "").trim();
  const m = /^(\d{1,2})[:h.](\d{2})/.exec(d); if (m) return +m[1] + +m[2] / 60;
  if (/^\d+(\.\d+)?\s*h/.test(d)) return parseFloat(d);
  return null;
};
const WALK = /walk|march|gang|vandr|hike|marsch|trek/i;
export const normalizeEvent = (e) => {
  const date = String(e.date || e.day || e.dato || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const name = String(e.name || e.title || e.navn || "Event");
  const km = +(e.km ?? e.distance ?? e.distanceKm ?? e.distance_km ?? 0) || 0;
  const kind = WALK.test(`${e.type || e.kind || e.sport || ""} ${name}`) ? "walk" : "race";
  // Expected duration: given, else estimated (walking 5 km/t, trail racing 7.5 km/t) and marked as an estimate.
  const given = hoursOf(e);
  const hours = given ?? (km ? Math.round((km / (kind === "walk" ? 5 : 7.5)) * 10) / 10 : null);
  return { date, name, km, kind, hours, hoursEst: given == null && hours != null, vert: +(e.vert ?? e.elevation ?? 0) || 0, start: e.start || e.startTime || "", note: e.note || e.notes || e.focus || "", url: e.url || "" };
};

// Hammer Trail Winter: 4 laps of 21.2 km. Targets for sub-12 include a 5-minute stop budget per lap; the cutoff
// (16:00) applies to starting the last lap. Used when the plan file has no lap plan of its own.
export const HAMMER_LAPS = { start: "06:00", laps: [{ km: 21.2, target: "2:40" }, { km: 21.2, target: "2:50" }, { km: 21.2, target: "3:10" }, { km: 21.2, target: "3:20" }], stopMin: 5, cutoff: "16:00", cutoffAfterLap: 3 };

export function normalizeCoachPlan(raw) {
  const r = raw && typeof raw === "object" ? raw : bundled;
  const W = { ...bundled.week, ...(r.week || {}) };
  const weeks = (r.weeks || []).map((w, i) => {
    const q = w.session || w.focus ? { session: w.session || "", focus: w.focus || "" } : splitQuality(w.quality);
    const days = Array.isArray(w.days) && w.days.length === 7 ? w.days.map((x) => +x || 0) : [0, 0, 0, 0, 0, 0, 0];
    return { n: +(w.n ?? w.week ?? i + 1), iso: +(w.iso ?? w.isoWeek ?? 0) || null, start: String(w.start || "").slice(0, 10), phase: w.phase || "Build", km: +(w.km ?? days.reduce((a, b) => a + b, 0)),
      days, session: q.session || shortSession(w.quality), focus: q.focus || w.focus || "", deload: !!w.deload, race: !!w.race, recovery: !!(w.recovery || w.restitution) };
  }).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.start));
  const st = r.strength || {};
  const pick = (re) => { const k = Object.keys(st).find((x) => re.test(x)); return k ? st[k] : null; };
  const strength = { A: pick(/^A[_-]/i) || bundled.strength.A_mon_lower, B: pick(/^B[_-]/i) || bundled.strength.B_tue_upper, daily: st.daily_ankle || bundled.strength.daily_ankle, rule: st.rule || (r === bundled ? bundled.strength.rule : "") };
  const race = { ...bundled.race, ...(r.race || {}) };
  const lapPlan = r.race?.lapPlan || r.lapPlan || (/hammer/i.test(race.name || "") ? HAMMER_LAPS : null);
  const events = (r.events || []).map(normalizeEvent).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { version: r.planVersion || r.version || null, race, week: W, weeks, strength, events, lapPlan, bundled: r === bundled };
}

// The plan the app uses for this profile.
export const activeCoachPlan = (p) => normalizeCoachPlan(p?.coachPlan?.data || bundled);

/* Does the file look like a coach plan? Returns a Danish error (translated) or null. */
export const checkCoachPlan = (raw) => {
  const cp = normalizeCoachPlan(raw);
  if (!cp.weeks.length) return t("Filen har ingen uger med startdato. Forventet: weeks[] med start, km og days (7 tal).");
  const bad = cp.weeks.find((w) => w.days.length !== 7);
  if (bad) return t("Uge {n} har ikke 7 dage.", { n: bad.n });
  return null;
};

/* Excel: the coach's workbook. Only the plan sheet is read – a sheet named "Plan" when there is one, else the first
   sheet whose header names week/uge/wk, start, km and the seven days. A "Tracker"/log sheet is never read: the app
   keeps its own log. Optional sheet "events" with dato/date, navn/name, km, timer/hours, type.
   Header cells may carry a second line ("MON\neasy", "SAT\nLONG"); the week cell may carry a deload mark ("4● · u38"). */
const DAYCOLS = [["man", "mon"], ["tir", "tue"], ["ons", "wed"], ["tor", "thu"], ["fre", "fri"], ["lør", "sat", "lor"], ["søn", "sun", "son"]];
export const NOT_PLAN_SHEET = /tracker|log|dashboard|microcycle|nutrition|kost|zones|zoner|race ?day|guide/i;
const excelDate = (v) => { const s = String(v || "").trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
const num = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(x) ? 0 : x; };
const sheetToWeeks = (text) => {
  const rows = parseCSV(text);
  const first = (c) => String(c).trim().toLowerCase().split(/\s+/)[0] || "";
  const hi = rows.findIndex((r) => r.some((c) => /^(uge|week|wk)$/.test(first(c))) && r.some((c) => /\bkm\b/i.test(c)) && DAYCOLS.every((names) => r.some((c) => names.includes(first(c)))));
  if (hi < 0) return [];
  const h = rows[hi].map((c) => String(c).trim().toLowerCase());
  const dc = DAYCOLS.map((names) => h.findIndex((c) => names.includes(first(c))));
  const at = (re) => h.findIndex((c, i) => !dc.includes(i) && re.test(c)); // a day header ("WED quality AM") is never the session column
  const ci = { n: h.findIndex((c) => /^(uge|week|wk)$/.test(first(c))), start: at(/^(start|dato|date|mandag)/), phase: at(/^(fase|phase)/), km: at(/\bkm\b/), session: at(/session|kvalitet|quality|hård/), focus: at(/^(fokus|focus|note)/), deload: at(/^(deload|let uge)/) };
  return rows.slice(hi + 1).filter((r) => parseInt(r[ci.n]) > 0 && excelDate(r[ci.start])).map((r) => {
    const days = dc.map((c) => (c >= 0 ? num(r[c]) : 0));
    const q = ci.session >= 0 ? splitQuality(r[ci.session]) : { session: "", focus: "" };
    return { n: parseInt(r[ci.n]), start: excelDate(r[ci.start]), phase: ci.phase >= 0 ? r[ci.phase] : "Build", km: ci.km >= 0 ? num(r[ci.km]) || days.reduce((a, b) => a + b, 0) : days.reduce((a, b) => a + b, 0), days,
      session: q.session, focus: ci.focus >= 0 ? r[ci.focus] : q.focus,
      deload: /●/.test(r[ci.n]) || (ci.deload >= 0 && /^(1|x|ja|yes|true|●)$/i.test(String(r[ci.deload]).trim())), race: /★/.test(r[ci.n]) || /race week|løbsuge|hammer trail winter 50/i.test(r[ci.session] || "") && num(r[dc[5]]) >= 50 };
  });
};
const sheetToEvents = (text) => {
  const rows = parseCSV(text); if (rows.length < 2) return [];
  const h = rows[0].map((c) => String(c).trim().toLowerCase());
  const col = (...n) => h.findIndex((c) => n.some((x) => c.startsWith(x)));
  const ci = { date: col("dato", "date"), name: col("navn", "name", "event"), km: col("km", "dist"), hours: col("timer", "hours", "tid"), type: col("type", "kind") };
  return rows.slice(1).map((r) => ({ date: excelDate(r[ci.date]), name: r[ci.name], km: ci.km >= 0 ? num(r[ci.km]) : 0, hours: ci.hours >= 0 ? num(r[ci.hours]) || undefined : undefined, type: ci.type >= 0 ? r[ci.type] : "" })).filter((e) => e.date && e.name);
};
// Sheet names come as "file.xlsx (Plan)" from readExcel.
const sheetName = (s) => (/\(([^)]*)\)\s*$/.exec(s.name)?.[1] || s.name).trim();

/* File → raw plan object (what is stored), or throws with a message the screen can show. An Excel plan carries only
   weeks, so the events, race, strength and lap plan of the plan in use (`current`) are kept. */
export async function coachPlanFromFile(file, current = null) {
  if (/\.json$/i.test(file.name) || file.type === "application/json") {
    let raw; try { raw = JSON.parse(decodeText(await file.arrayBuffer())); } catch { throw new Error(t("{name}: ikke gyldig JSON.", { name: file.name })); }
    const err = checkCoachPlan(raw); if (err) throw new Error(err);
    return raw;
  }
  if (/\.xlsx$|\.xlsm$/i.test(file.name)) {
    const sheets = await readExcel(file);
    const named = sheets.find((s) => /^(plan|trænerplan|weekly plan)$/i.test(sheetName(s)));
    const candidates = named ? [named] : sheets.filter((s) => !NOT_PLAN_SHEET.test(sheetName(s)) && !/event|begivenhed/i.test(sheetName(s)));
    const weeks = candidates.map((s) => sheetToWeeks(s.text)).find((w) => w.length) || [];
    const evSheets = sheets.filter((s) => /event|begivenhed/i.test(sheetName(s)));
    const base = current && typeof current === "object" ? current : bundled;
    const raw = { ...base, planVersion: `${base.planVersion ? `${base.planVersion} · ` : ""}Excel ${ymd(new Date())}`, weeks, events: evSheets.length ? evSheets.flatMap((s) => sheetToEvents(s.text)) : base.events || [] };
    const err = checkCoachPlan(raw); if (err) throw new Error(err);
    return raw;
  }
  throw new Error(t("{name}: vælg en coach-plan.json eller en Excel-fil (.xlsx).", { name: file.name }));
}

/* Events in a plan week (Monday key "YYYY-MM-DD") by weekday index. */
export const eventsInWeek = (events, key) => { const out = {}; const d0 = parseLocal(key); for (let i = 0; i < 7; i++) { const day = ymd(addDays(d0, i)); const e = events.find((x) => x.date === day); if (e) out[i] = e; } return out; };
