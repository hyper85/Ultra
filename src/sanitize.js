import { ymd, parseLocal } from "./import.js";

/* Stored data the app did not write itself, or wrote and then lost half of (a phone killed mid-write, an old version,
   a cloud row edited by hand), must never stop the app: one null activity or an impossible date used to hang or crash
   every screen. These run where data comes IN (localStorage on start, the cloud pull) and keep what is usable:
   an activity needs a real day and a distance; log weeks need a real date key; numbers must be numbers. Everything
   else the app wrote is kept as it is. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = (d) => typeof d === "string" && DAY.test(d) && ymd(parseLocal(d)) === d;
const finite = (v) => (typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && v.trim() !== "" && Number.isFinite(+v));
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export function cleanActs(acts) {
  if (!isObj(acts)) return {};
  const out = {};
  for (const [id, a] of Object.entries(acts)) {
    if (!isObj(a)) continue;
    const date = a.date && !Number.isNaN(new Date(a.date).getTime()) ? a.date : null;
    const day = validDay(a.day) ? a.day : date ? ymd(new Date(date)) : null;
    if (!day) continue;
    const km = finite(a.km) ? +a.km : NaN;
    if (!(km >= 0 && km <= 1000)) continue;
    const c = { ...a, id: typeof a.id === "string" && a.id ? a.id : id, day, km, date: date || new Date(`${day}T12:00:00`).toISOString(), type: typeof a.type === "string" ? a.type : "Run" };
    c.min = finite(a.min) && +a.min > 0 ? +a.min : null;
    c.hr = finite(a.hr) && +a.hr > 25 && +a.hr < 250 ? +a.hr : null;
    for (const k of ["maxHr", "vert", "incline", "rpe"]) { if (k in c && !(finite(c[k]) && +c[k] > 0)) delete c[k]; else if (k in c) c[k] = +c[k]; }
    if ("rpe" in c && (c.rpe < 1 || c.rpe > 10)) delete c.rpe;
    out[c.id] = c;
  }
  return out;
}

// Weekly log: keys are the Monday of the week; the numbers the app writes are numbers, notes and flags stay as they are.
const LOG_NUM = new Set(["km", "rpe", "hr", "sleep", "wt", "vo2", "hrv", "stress", "endurance", "xmin", "xn", "xload", "vert", "ekm", "n"]);
export function cleanLog(log) {
  if (!isObj(log)) return {};
  const out = {};
  for (const [k, v] of Object.entries(log)) {
    if (!validDay(k) || !isObj(v)) continue;
    const w = {};
    for (const [f, x] of Object.entries(v)) {
      if (LOG_NUM.has(f)) { if (x === "" || x == null) { if (x === "") w[f] = ""; continue; } if (finite(x) && +x >= 0) w[f] = +x; continue; }
      w[f] = x;
    }
    out[k] = w;
  }
  return out;
}

// Profile: a field of the wrong type is dropped, so the default for it applies (migrateProfile merges DEFAULT).
const P_NUM = ["age", "height", "weight", "currentKm", "breakWeeks", "raceKm", "raceVert", "qualityDay", "longDay", "level", "maxRunDays", "peakScale", "garminV"];
export function cleanProfile(p) {
  if (!isObj(p)) return {};
  const c = { ...p };
  for (const f of P_NUM) if (f in c && c[f] !== "" && c[f] != null && !finite(c[f])) delete c[f];
  if ("maxHR" in c && !(finite(c.maxHR) && +c.maxHR >= 0 && +c.maxHR < 250)) delete c.maxHR;
  if ("restHR" in c && c.restHR !== "" && !(finite(c.restHR) && +c.restHR > 20 && +c.restHR < 150)) delete c.restHR;
  for (const f of ["startDate", "raceDate"]) if (f in c && c[f] && !validDay(c[f])) delete c[f];
  if ("liftDays" in c && !(Array.isArray(c.liftDays) && c.liftDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) delete c.liftDays;
  if ("intol" in c && !Array.isArray(c.intol)) delete c.intol;
  if ("sched" in c && !(isObj(c.sched) && Array.isArray(c.sched.A))) delete c.sched;
  if ("wellness" in c) {
    if (!isObj(c.wellness)) delete c.wellness;
    else c.wellness = Object.fromEntries(Object.entries(c.wellness).filter(([d, v]) => validDay(d) && isObj(v)));
  }
  if ("coachPlan" in c && c.coachPlan != null && !isObj(c.coachPlan)) delete c.coachPlan;
  return c;
}
