/* ================= dates ================= */
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseLocal = (str) => { const [y, m, d] = String(str).split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; };
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

/* ================= activity classification ================= */
const RUN = /run|løb|jog|trail/i;
const NOT_RUN = /ride|cykl|cycl|bike|swim|svøm|ski|row|kajak|kayak|yoga|strength|styrke|workout|elliptical|stair/i;
const HIKE = /hike|hiking|walk|vandr|gang|gåtur|trek/i;
// Strava GPX exports carry a numeric <type>: 9 = run, 4 = hike, 10 = walk.
const STRAVA_TYPES = { 9: "Run", 4: "Hike", 10: "Walk", 1: "Ride", 5: "Swim" };

export const kind = (type) => {
  const t = STRAVA_TYPES[String(type).trim()] || String(type || "");
  if (HIKE.test(t) && !RUN.test(t)) return "hike";
  if (RUN.test(t) && !NOT_RUN.test(t)) return "run";
  return "other";
};

/* ================= number / date parsing ================= */
const parseNum = (s) => {
  if (s == null) return NaN;
  let t = String(s).trim().replace(/[^\d,.\-]/g, "");
  if (!t) return NaN;
  const hasComma = t.includes(","), hasDot = t.includes(".");
  if (hasComma && hasDot) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (hasComma) t = t.replace(",", ".");
  return parseFloat(t);
};

// "1:02:33", "45:30", "3612" (seconds) -> minutes
const parseMinutes = (s) => {
  if (s == null) return NaN;
  const t = String(s).trim();
  if (!t) return NaN;
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    if (parts.some(isNaN)) return NaN;
    const [h, m, sec] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
    return h * 60 + m + sec / 60;
  }
  const n = parseNum(t);
  return isNaN(n) ? NaN : n / 60;
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11 };

// Returns a Date or null. Strava's CSV is in UTC; Garmin's CSV is local time.
export const parseDate = (s, { utc = false } = {}) => {
  if (!s) return null;
  const t = String(s).trim();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
    const [, y, mo, d, h = 0, mi = 0, sec = 0] = m.map(Number);
    return utc ? new Date(Date.UTC(y, mo - 1, d, h, mi, sec)) : new Date(y, mo - 1, d, h, mi, sec);
  }
  if ((m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/))) {
    const [, d, mo, y, h = 0, mi = 0, sec = 0] = m.map(Number);
    return new Date(y, mo - 1, d, h, mi, sec);
  }
  if ((m = t.match(/^([A-Za-z]{3})[A-Za-z.]*\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i))) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo == null) return null;
    let h = +(m[4] || 0);
    const ap = (m[7] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    const d = +m[2], y = +m[3], mi = +(m[5] || 0), sec = +(m[6] || 0);
    return utc ? new Date(Date.UTC(y, mo, d, h, mi, sec)) : new Date(y, mo, d, h, mi, sec);
  }
  const fallback = new Date(t);
  return isNaN(fallback) ? null : fallback;
};

/* ================= CSV ================= */
export const parseCSV = (text) => {
  const src = text.replace(/^﻿/, "");
  const head = src.slice(0, src.indexOf("\n") < 0 ? undefined : src.indexOf("\n"));
  const delim = [",", ";", "\t"].map((d) => [d, (head.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = ""; if (row.some((x) => x !== "")) rows.push(row); row = [];
    } else field += c;
  }
  row.push(field); if (row.some((x) => x !== "")) rows.push(row);
  return rows;
};

const norm = (h) => String(h).toLowerCase().replace(/[^a-zæøå0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const findCol = (headers, tests) => { for (const t of tests) { const i = headers.findIndex((h) => t.test(h)); if (i >= 0) return i; } return -1; };

export const activitiesFromCSV = (text, fileName = "csv") => {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(norm);
  const isStrava = headers.includes("activity date");
  const cDate = findCol(headers, [/^activity date$/, /^start time$/, /^starttid/, /^date$/, /^dato$/, /^tidspunkt/, /date|dato/]);
  const cType = findCol(headers, [/^activity type$/, /^aktivitetstype$/, /^sport$/, /type/]);
  const cName = findCol(headers, [/^activity name$/, /^title$/, /^titel$/, /^name$/, /^navn$/]);
  const cTime = findCol(headers, [/^moving time$/, /^bevægelsestid$/, /^elapsed time$/, /^time$/, /^tid$/, /^duration$/, /^varighed$/, /time|tid/]);
  const cHR = findCol(headers, [/^average heart rate$/, /^avg hr$/, /^gns puls$/, /gennemsnitlig puls/, /^average hr$/, /avg.*(hr|heart)|gns.*puls|puls.*gns/]);
  const distCols = headers.map((h, i) => (/^distance$|^afstand$|^distance km$/.test(h) ? i : -1)).filter((i) => i >= 0);
  if (cDate < 0 || !distCols.length) return [];
  const out = [];
  for (const r of rows.slice(1)) {
    const date = parseDate(r[cDate], { utc: isStrava });
    if (!date) continue;
    let km;
    if (distCols.length > 1) km = parseNum(r[distCols[distCols.length - 1]]) / 1000; // Strava: later column is metres
    else { const v = parseNum(r[distCols[0]]); km = v > 1500 ? v / 1000 : v; }
    if (!(km > 0)) continue;
    const min = cTime >= 0 ? parseMinutes(r[cTime]) : NaN;
    const hr = cHR >= 0 ? parseNum(r[cHR]) : NaN;
    out.push(mk({ date, km, min: min > 0 ? min : null, hr: hr > 40 ? Math.round(hr) : null, type: cType >= 0 ? r[cType] : "Run", name: cName >= 0 ? r[cName] : "", source: isStrava ? "Strava CSV" : "CSV", file: fileName }));
  }
  return out;
};

/* ================= GPX / TCX ================= */
const xml = (text) => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
};
const txt = (el, tag) => { const n = el?.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ""; };
const hav = (a, b) => {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

export const activitiesFromGPX = (text, fileName = "gpx") => {
  const doc = xml(text);
  if (!doc) return [];
  const out = [];
  for (const trk of Array.from(doc.getElementsByTagName("trk"))) {
    const pts = Array.from(trk.getElementsByTagName("trkpt")).map((p) => ({
      lat: +p.getAttribute("lat"), lon: +p.getAttribute("lon"),
      time: txt(p, "time") ? new Date(txt(p, "time")) : null,
      hr: (() => { const h = p.getElementsByTagNameNS("*", "hr")[0]; return h ? +h.textContent : null; })(),
    }));
    if (pts.length < 2) continue;
    let km = 0; for (let i = 1; i < pts.length; i++) km += hav(pts[i - 1], pts[i]);
    const times = pts.map((p) => p.time).filter((t) => t && !isNaN(t));
    const date = times[0] || (txt(doc, "time") ? new Date(txt(doc, "time")) : null);
    if (!date || isNaN(date)) continue;
    const min = times.length > 1 ? (times[times.length - 1] - times[0]) / 60000 : null;
    const hrs = pts.map((p) => p.hr).filter((h) => h > 40);
    const hr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
    out.push(mk({ date, km, min, hr, type: txt(trk, "type") || "Run", name: txt(trk, "name"), source: "GPX", file: fileName }));
  }
  return out;
};

export const activitiesFromTCX = (text, fileName = "tcx") => {
  const doc = xml(text);
  if (!doc) return [];
  const out = [];
  for (const act of Array.from(doc.getElementsByTagName("Activity"))) {
    const laps = Array.from(act.getElementsByTagName("Lap"));
    let m = 0, sec = 0, hrW = 0, hrT = 0;
    for (const lap of laps) {
      const d = +txt(lap, "DistanceMeters") || 0, t = +txt(lap, "TotalTimeSeconds") || 0;
      m += d; sec += t;
      const h = +txt(lap.getElementsByTagName("AverageHeartRateBpm")[0], "Value");
      if (h > 40 && t > 0) { hrW += h * t; hrT += t; }
    }
    if (!hrT) {
      const hrs = Array.from(act.getElementsByTagName("Trackpoint")).map((p) => +txt(p.getElementsByTagName("HeartRateBpm")[0], "Value")).filter((h) => h > 40);
      if (hrs.length) { hrW = hrs.reduce((a, b) => a + b, 0); hrT = hrs.length; }
    }
    const date = new Date(txt(act, "Id") || (laps[0] && laps[0].getAttribute("StartTime")));
    if (isNaN(date) || !(m > 0)) continue;
    out.push(mk({ date, km: m / 1000, min: sec > 0 ? sec / 60 : null, hr: hrT ? Math.round(hrW / hrT) : null, type: act.getAttribute("Sport") || "Running", name: txt(act, "Name"), source: "TCX", file: fileName }));
  }
  return out;
};

/* ================= common ================= */
const mk = (a) => {
  const km = Math.round(a.km * 100) / 100;
  const slot = Math.round((a.date.getHours() * 60 + a.date.getMinutes()) / 5); // 5-minute start slot for dedupe
  return { id: `${ymd(a.date)}-${slot}-${Math.round(km)}`, date: a.date.toISOString(), day: ymd(a.date), km, min: a.min ? Math.round(a.min) : null, hr: a.hr || null, type: String(a.type || "").trim(), kind: kind(a.type), name: a.name || "", source: a.source, file: a.file };
};

export const parseFile = async (file) => {
  const text = await file.text();
  const n = file.name.toLowerCase();
  if (n.endsWith(".gpx") || /<gpx[\s>]/i.test(text.slice(0, 2000))) return activitiesFromGPX(text, file.name);
  if (n.endsWith(".tcx") || /<TrainingCenterDatabase/i.test(text.slice(0, 2000))) return activitiesFromTCX(text, file.name);
  if (n.endsWith(".csv") || n.endsWith(".txt")) return activitiesFromCSV(text, file.name);
  if (n.endsWith(".fit")) throw new Error(`${file.name}: FIT-filer understøttes ikke – vælg GPX eller TCX ved eksport.`);
  if (n.endsWith(".zip")) throw new Error(`${file.name}: pak zip-filen ud og vælg activities.csv (Strava) eller de enkelte GPX/TCX-filer.`);
  throw new Error(`${file.name}: ukendt filtype.`);
};

// RPE estimate (Foster scale) from average heart rate as a share of max.
export const rpeFromHR = (hr, maxHR) => {
  if (!hr || !maxHR) return null;
  const pct = hr / maxHR;
  return pct < 0.65 ? 3 : pct < 0.72 ? 4 : pct < 0.78 ? 5 : pct < 0.84 ? 6 : pct < 0.9 ? 7 : 8;
};

// Group counted activities by the Monday of their week.
export const weeklyTotals = (acts, { includeHikes = false, maxHR } = {}) => {
  const weeks = {};
  for (const a of Object.values(acts)) {
    if (!(a.kind === "run" || (includeHikes && a.kind === "hike"))) continue;
    const key = ymd(mondayOf(parseLocal(a.day)));
    const w = weeks[key] || (weeks[key] = { km: 0, min: 0, n: 0, rpeW: 0, rpeT: 0 });
    w.km += a.km; w.n++; w.min += a.min || 0;
    const rpe = rpeFromHR(a.hr, maxHR);
    if (rpe) { const wgt = a.min || a.km * 6; w.rpeW += rpe * wgt; w.rpeT += wgt; }
  }
  for (const w of Object.values(weeks)) { w.km = Math.round(w.km * 10) / 10; w.rpe = w.rpeT ? Math.round(w.rpeW / w.rpeT) : null; }
  return weeks;
};
