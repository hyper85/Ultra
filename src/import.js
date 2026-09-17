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

const STRENGTH = /strength|styrke|hiit|highintensity|interval ?training|crossfit|workout|circuit|kettlebell|weight|vægt|gym|bodyweight|cardio/i;
export const kind = (type) => {
  const t = STRAVA_TYPES[String(type).trim()] || String(type || "");
  if (HIKE.test(t) && !RUN.test(t)) return "hike";
  if (RUN.test(t) && !NOT_RUN.test(t)) return "run";
  if (STRENGTH.test(t)) return "strength";
  return "other";
};
// Sessions without kilometres (strength, HIIT, cycling, swimming) count by minutes × RPE (session-RPE).
export const XTYPES = [["Strength", "Styrke"], ["HIIT", "HIIT"], ["Ride", "Cykling"], ["Workout", "Andet"]];
const STRAVA_LABELS = { weighttraining: "Styrke", highintensityintervaltraining: "HIIT", crossfit: "Crossfit", ride: "Cykling", virtualride: "Cykling", ebikeride: "Cykling", gravelride: "Cykling", mountainbikeride: "Cykling", swim: "Svømning", yoga: "Yoga", elliptical: "Crosstrainer", stairstepper: "Trappemaskine", rowing: "Roning", workout: "Andet", pilates: "Pilates", walk: "Gang", hike: "Vandring", strengthtraining: "Styrke", cardio: "Cardio" };
export const xLabel = (type) => XTYPES.find(([k]) => k === type)?.[1] || STRAVA_LABELS[String(type || "").toLowerCase().replace(/[^a-z]/g, "")] || String(type || "Andet").replace(/([a-z])([A-Z])/g, "$1 $2");

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
    const [, y, mo, d, h = 0, mi = 0, sec = 0] = m.map((x) => (x == null ? undefined : Number(x)));
    return utc ? new Date(Date.UTC(y, mo - 1, d, h, mi, sec)) : new Date(y, mo - 1, d, h, mi, sec);
  }
  if ((m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/))) {
    const [, d, mo, y, h = 0, mi = 0, sec = 0] = m.map((x) => (x == null ? undefined : Number(x)));
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

export class ImportError extends Error {}
export const activitiesFromCSV = (text, fileName = "csv") => {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new ImportError(`${fileName}: filen er tom eller har kun en overskriftslinje.`);
  const headers = rows[0].map(norm);
  const isStrava = headers.includes("activity date");
  const cDate = findCol(headers, [/^activity date$/, /^start time$/, /^starttid/, /^date$/, /^dato$/, /^tidspunkt/, /date|dato/]);
  const cType = findCol(headers, [/^activity type$/, /^aktivitetstype$/, /^sport$/, /type/]);
  const cName = findCol(headers, [/^activity name$/, /^title$/, /^titel$/, /^name$/, /^navn$/]);
  const cTime = findCol(headers, [/^moving time$/, /^bevægelsestid$/, /^elapsed time$/, /^time$/, /^tid$/, /^duration$/, /^varighed$/, /^min$|^minutter$|^minutes$/, /time|tid|minut/]);
  const timeInMinutes = cTime >= 0 && /^min|minut/.test(headers[cTime]); // a "Min" column holds minutes, not seconds
  const cRPE = findCol(headers, [/^rpe$/, /anstrengelse|effort/]);
  const cHR = findCol(headers, [/^average heart rate$/, /^avg hr$/, /^gns puls$/, /gennemsnitlig puls/, /^average hr$/, /avg.*(hr|heart)|gns.*puls|puls.*gns/]);
  let distCols = headers.map((h, i) => (/^distance$|^afstand$|^distance km$|^distance m$|^km$|^kilometer$/.test(h) ? i : -1)).filter((i) => i >= 0);
  if (!distCols.length) distCols = headers.map((h, i) => (/dist|afstand/.test(h) ? i : -1)).filter((i) => i >= 0);
  if (cDate < 0 || !distCols.length) {
    const found = rows[0].slice(0, 8).join(", ");
    throw new ImportError(`${fileName}: kunne ikke finde ${cDate < 0 ? "en dato-kolonne" : "en distance-kolonne"}. Kolonnerne i filen begynder med: ${found}${rows[0].length > 8 ? ", …" : ""}. Send gerne filen, så kan formatet blive understøttet.`);
  }
  const out = [];
  for (const r of rows.slice(1)) {
    const date = parseDate(r[cDate], { utc: isStrava });
    if (!date) continue;
    // Strava lists distance twice: first in the athlete's unit (km or miles), later in metres. Prefer the metres column
    // when it clearly is one; otherwise use the first column, treating big values as metres.
    const first = parseNum(r[distCols[0]]), last = parseNum(r[distCols[distCols.length - 1]]);
    let km;
    if (distCols.length > 1 && last > 0 && (last > 1500 || (first > 0 && last / first > 100))) km = last / 1000;
    else km = first > 1500 ? first / 1000 : first;
    const min = cTime < 0 ? NaN : timeInMinutes && !String(r[cTime] || "").includes(":") ? parseNum(r[cTime]) : parseMinutes(r[cTime]);
    const rowType = cType >= 0 ? r[cType] : "Run"; const rowKind = kind(rowType);
    // A session without distance (strength, HIIT, indoor cardio) still counts, by its minutes.
    if (!(km > 0)) { if ((rowKind === "strength" || rowKind === "other") && min > 0) km = 0; else continue; }
    if (km > 400) continue; // metres in a "km" column or a garbage row
    const hr = cHR >= 0 ? parseNum(r[cHR]) : NaN;
    const a = mk({ date, km, min: min > 0 ? min : null, hr: hr > 40 ? Math.round(hr) : null, type: rowType, name: cName >= 0 ? r[cName] : "", source: isStrava ? "Strava CSV" : /\.xls/i.test(fileName) ? "Excel" : "CSV", file: fileName });
    const rpe = cRPE >= 0 ? parseNum(r[cRPE]) : NaN;
    if (rpe >= 1 && rpe <= 10) a.rpe = Math.round(rpe);
    out.push(a);
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
  const id = km > 0 ? `${ymd(a.date)}-${slot}-${km.toFixed(1)}` : `${ymd(a.date)}-${slot}-x-${String(a.type || "x").toLowerCase().replace(/[^a-z0-9]+/g, "")}-${Math.round(a.min || 0)}`;
  return { id, date: a.date.toISOString(), day: ymd(a.date), km, min: a.min ? Math.round(a.min) : null, hr: a.hr || null, type: String(a.type || "").trim(), kind: kind(a.type), name: a.name || "", source: a.source, file: a.file };
};

// Minimal zip reader (no library): the central directory lists the entries; DecompressionStream inflates them.
const zipOpen = async (file) => {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ImportError(`${file.name}: kunne ikke læse zip-filen.`);
  const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = []; let o = cdOff;
  for (let k = 0; k < count && o + 46 <= buf.length; k++) {
    if (dv.getUint32(o, true) !== 0x02014b50) break;
    const method = dv.getUint16(o + 10, true), csize = dv.getUint32(o + 20, true), nlen = dv.getUint16(o + 28, true), elen = dv.getUint16(o + 30, true), clen = dv.getUint16(o + 32, true), loff = dv.getUint32(o + 42, true);
    entries.push({ name: dec.decode(buf.subarray(o + 46, o + 46 + nlen)), method, csize, loff });
    o += 46 + nlen + elen + clen;
  }
  return { buf, dv, entries, fileName: file.name };
};
const zipBytes = async ({ buf, dv, fileName }, e) => {
  const nlen = dv.getUint16(e.loff + 26, true), elen = dv.getUint16(e.loff + 28, true);
  const start = e.loff + 30 + nlen + elen;
  const raw = buf.subarray(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method !== 8) return null;
  if (typeof DecompressionStream === "undefined") throw new ImportError(`${fileName}: din browser kan ikke pakke zip ud – pak den ud på computeren og vælg filen inde i den.`);
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
};
// A Strava/Garmin archive: every *.csv / *.gpx / *.tcx inside it, as text.
const readZip = async (file) => {
  const z = await zipOpen(file);
  const wanted = z.entries.filter((e) => /\.(csv|gpx|tcx)$/i.test(e.name) && !/\/\./.test(e.name));
  if (!wanted.length) throw new ImportError(`${file.name}: zip-filen indeholder ingen CSV-, GPX- eller TCX-filer.`);
  const out = [];
  for (const e of wanted.slice(0, 500)) {
    const bytes = await zipBytes(z, e);
    if (bytes) out.push({ name: e.name.split("/").pop(), text: decodeText(bytes) });
  }
  return out;
};

/* ================= Excel (.xlsx) ================= */
// An .xlsx is a zip of XML files. This reads the shared strings, the cell styles (to tell dates from plain numbers) and
// every sheet, and returns each sheet as CSV text, so an Excel file goes through exactly the same parsers as a CSV
// export – whether it is Garmin's Activities.csv saved as Excel, a Garmin report, or a hand-kept log with Dato/Km/Tid.
const unxml = (t) => String(t).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&");
const attr = (attrs, name) => { const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)); return m ? unxml(m[1]) : null; };
const tTexts = (inner) => Array.from(inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (m) => unxml(m[1])).join("");
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
// Excel's built-in date formats, plus custom formats that spell out day/month/year/hour (with quoted text and [colours] removed).
const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const fmtKind = (code) => { const c = String(code || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""); return /[dy]/i.test(c) ? "date" : /[hs]/i.test(c) || /m/.test(c) ? "time" : null; };
const pad2 = (n) => String(n).padStart(2, "0");
const serialToText = (v, kind) => {
  if (kind === "time" && v < 1) { const s = Math.round(v * 86400); return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`; }
  if (kind === "time") { const s = Math.round(v * 86400); return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`; } // durations over 24 h: [h]:mm:ss
  const d = new Date(Math.round((v - 25569) * 86400) * 1000); // Excel serial day 25569 = 1970-01-01 (1900 date system)
  const day = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return v % 1 ? `${day} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}` : day;
};
const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const readExcel = async (file) => {
  const z = await zipOpen(file);
  const dec = new TextDecoder();
  const get = async (name) => { const e = z.entries.find((x) => x.name === name || x.name === name.replace(/^\//, "")); if (!e) return null; const b = await zipBytes(z, e); return b ? dec.decode(b) : null; };
  const wb = await get("xl/workbook.xml");
  if (!wb) throw new ImportError(`${file.name}: kunne ikke læse regnearket. Gem det som .xlsx i Excel og prøv igen.`);
  // Shared strings: every <si> is one string, possibly split into rich-text runs.
  const sst = Array.from(((await get("xl/sharedStrings.xml")) || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), (m) => tTexts(m[1]));
  // Styles: cellXfs index -> "date" | "time" | null, so date cells become readable text instead of serial numbers.
  const styles = (await get("xl/styles.xml")) || "";
  const custom = {}; for (const m of styles.matchAll(/<numFmt\b([^>]*)\/?>/g)) { const id = attr(m[1], "numFmtId"), code = attr(m[1], "formatCode"); if (id != null) custom[+id] = fmtKind(code); }
  const xfs = (styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "");
  const kinds = Array.from(xfs.matchAll(/<xf\b([^>]*)\/?>/g), (m) => { const id = +(attr(m[1], "numFmtId") || 0); return DATE_FMT_IDS.has(id) ? (id >= 18 && id <= 21 || id >= 45 && id <= 47 ? "time" : "date") : custom[id] || null; });
  // Sheets, in workbook order, resolved through the relationships file.
  const rels = {}; for (const m of ((await get("xl/_rels/workbook.xml.rels")) || "").matchAll(/<Relationship\b([^>]*)\/?>/g)) { const id = attr(m[1], "Id"), t = attr(m[1], "Target"); if (id && t) rels[id] = t.startsWith("/") ? t.slice(1) : t.startsWith("xl/") ? t : `xl/${t}`; }
  const sheets = Array.from(wb.matchAll(/<sheet\b([^>]*)\/?>/g), (m) => ({ name: attr(m[1], "name") || "Ark", path: rels[attr(m[1], "r:id") || attr(m[1], "id") || ""] }));
  const out = [];
  for (const [i, sh] of sheets.entries()) {
    const xmlText = sh.path ? await get(sh.path) : await get(`xl/worksheets/sheet${i + 1}.xml`);
    if (!xmlText) continue;
    const rows = [];
    for (const rm of xmlText.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = cm[1], inner = cm[2] || "";
        const ref = attr(a, "r"); const col = ref ? colIndex(ref) : cells.length;
        const t = attr(a, "t"); const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let text = "";
        if (t === "s") text = sst[+v] ?? "";
        else if (t === "inlineStr") text = tTexts(inner);
        else if (t === "b") text = v === "1" ? "true" : "false";
        else if (t === "e") text = "";
        else if (v != null) {
          text = unxml(v);
          const kind = t == null || t === "n" ? kinds[+(attr(a, "s") || 0)] : null;
          const num = Number(v);
          if (kind && Number.isFinite(num)) text = serialToText(num, kind);
        }
        while (cells.length < col) cells.push("");
        cells[col] = text;
      }
      rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
    if (!rows.some((r) => r.some((c) => c !== ""))) continue; // empty sheet
    const width = Math.max(...rows.map((r) => r.length));
    const text = rows.map((r) => { const rr = r.slice(); while (rr.length < width) rr.push(""); return rr.map(csvCell).join(","); }).join("\n");
    out.push({ name: sheets.length > 1 ? `${file.name} (${sh.name})` : file.name, text });
  }
  if (!out.length) throw new ImportError(`${file.name}: regnearket er tomt.`);
  return out;
};

// Garmin's Danish export is sometimes Windows-1252 rather than UTF-8; a strict UTF-8 decode tells us which.
export const decodeText = (buf) => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
};

const parseText = (text, name) => {
  const n = name.toLowerCase();
  if (n.endsWith(".gpx") || /<gpx[\s>]/i.test(text.slice(0, 2000))) return activitiesFromGPX(text, name);
  if (n.endsWith(".tcx") || /<TrainingCenterDatabase/i.test(text.slice(0, 2000))) return activitiesFromTCX(text, name);
  return activitiesFromCSV(text, name);
};

// An activity from the Strava API (see api/strava.js): start_date_local is the athlete's wall clock.
export const activityFromStrava = (a) => {
  const m = String(a.startLocal || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const km = +a.km || 0, min = +a.min || 0;
  if (!(km > 0) && !(min > 0)) return null;
  return mk({ date, km, min: min > 0 ? min : null, hr: a.hr || null, type: a.type || "Workout", name: a.name || "", source: "Strava", file: `strava:${a.stravaId}` });
};

// A run typed in by hand for a given day (YYYY-MM-DD). Stored like an imported activity.
export const manualActivity = ({ day, km, min, rpe, type = "Run" }) => {
  const d = parseLocal(day); d.setHours(12, 0, 0, 0);
  const a = mk({ date: d, km: +km || 0, min: min ? +min : null, hr: null, type, name: type === "Run" ? "Indtastet" : xLabel(type), source: "Manuel", file: "" });
  if (rpe) a.rpe = Math.min(10, Math.max(1, Math.round(+rpe)));
  return a;
};

export const parseFile = async (file) => {
  const n = file.name.toLowerCase();
  if (n.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
    const parts = await readZip(file);
    // Strava's archive: prefer activities.csv (one row per activity) over hundreds of GPX files that describe the same runs.
    const csvs = parts.filter((x) => /activities\.csv$/i.test(x.name));
    const use = csvs.length ? csvs : parts;
    return use.flatMap((x) => parseText(x.text, x.name));
  }
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm")) return (await readExcel(file)).flatMap((x) => activitiesFromCSV(x.text, x.name));
  if (n.endsWith(".xls") || n.endsWith(".ods") || n.endsWith(".numbers")) throw new ImportError(`${file.name}: gem regnearket som .xlsx (Filer → Gem som) eller som CSV, og vælg den fil.`);
  if (n.endsWith(".fit") || n.endsWith(".fit.gz")) throw new ImportError(`${file.name}: FIT-filer understøttes ikke – vælg GPX eller TCX ved eksport.`);
  const text = decodeText(await file.arrayBuffer());
  if (!text.trim()) throw new ImportError(`${file.name}: filen er tom.`);
  if (text.charCodeAt(0) === 0x50 && text.charCodeAt(1) === 0x4b) throw new ImportError(`${file.name}: det ligner en zip-fil – omdøb den til .zip eller pak den ud.`);
  return parseText(text, file.name); // any text file: sniff GPX/TCX, otherwise treat as CSV
};

// Same activity seen twice (e.g. Strava CSV + the GPX of the same run): same day, start within 10 minutes,
// distance within 3 % or 0.5 km. Returns the existing activity's id, or null.
export const findDuplicate = (a, existing) => {
  const t = new Date(a.date).getTime();
  const manual = a.source === "Manuel";
  for (const b of existing) {
    if (b.day !== a.day) continue;
    // A manual entry carries no exact start time: same day + similar distance is the same run.
    if (!manual && b.source !== "Manuel" && Math.abs(new Date(b.date).getTime() - t) > 10 * 60000) continue;
    // Sessions without km: same day, same kind of session, and minutes within 20 %.
    if (!(a.km > 0) || !(b.km > 0)) { if (!(a.km > 0) && !(b.km > 0) && String(a.type).toLowerCase() === String(b.type).toLowerCase() && Math.abs((a.min || 0) - (b.min || 0)) <= Math.max(5, 0.2 * Math.max(a.min || 0, b.min || 0))) return b.id; continue; }
    if (Math.abs(b.km - a.km) <= Math.max(0.5, 0.03 * Math.max(a.km, b.km))) return b.id;
  }
  return null;
};
// Merge parsed activities into the store; duplicates keep the stored copy. Returns { next, added }.
export const mergeActivities = (acts, parsed) => {
  const next = { ...acts }; let added = 0;
  for (const a of parsed) {
    if (next[a.id]) continue;
    const dup = findDuplicate(a, Object.values(next).filter((b) => b.day === a.day));
    if (dup) continue;
    next[a.id] = a; added++;
  }
  return { next, added };
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
    const k = kind(a.type); // recomputed so improved classification also applies to activities imported earlier
    const key = ymd(mondayOf(parseLocal(a.day)));
    const w = weeks[key] || (weeks[key] = { km: 0, min: 0, n: 0, rpeW: 0, rpeT: 0, xmin: 0, xn: 0, xload: 0 });
    if (k === "run" || (includeHikes && k === "hike")) {
      w.km += a.km; w.n++; w.min += a.min || 0;
      const rpe = a.rpe || rpeFromHR(a.hr, maxHR);
      if (rpe) { const wgt = a.min || a.km * 6; w.rpeW += rpe * wgt; w.rpeT += wgt; }
    } else if (k !== "hike" && a.min > 0) {
      // Strength, HIIT, cycling and other sessions: minutes × RPE (RPE 6 when none is given). Their km are not run km.
      w.xmin += a.min; w.xn++; w.xload += a.min * (a.rpe || rpeFromHR(a.hr, maxHR) || (k === "strength" ? 6 : 4));
    }
  }
  for (const [key, w] of Object.entries(weeks)) { w.km = Math.round(w.km * 10) / 10; w.rpe = w.rpeT ? Math.round(w.rpeW / w.rpeT) : null; w.xload = Math.round(w.xload); if (!w.n && !w.xn) delete weeks[key]; }
  return weeks;
};

/* ================= wellness: Garmin reports → weekly numbers =================
   Any Garmin export with a date/period column and metric columns: Sleep.csv (weekly rows "Sep 8-14", the current
   year omitted, older rows ", 2025"; "Dec 30, 2025 - Jan 5, 2026" across the year), Reports (daily, weekly or
   monthly rows like "Oct 2025"), or a pasted table with "Date" + "Resting". Known metrics are mapped to the weekly
   log; columns the app has no use for (pace, speed, distance, activity time – those come from the activities)
   are reported back so the user knows. Everything is keyed by the Monday of the week. */
const hoursOf = (s) => { // "5h 48min" | "6:42" | "6.7" | "402" (minutes)
  const t = String(s || "").trim().toLowerCase(); if (!t || t === "--") return NaN;
  const hm = t.match(/(\d+)\s*(?:h|t)\s*(\d+)?/); if (hm) return +hm[1] + (+hm[2] || 0) / 60;
  const c = t.match(/^(\d{1,2}):(\d{2})$/); if (c) return +c[1] + +c[2] / 60;
  const n = parseNum(t); return isNaN(n) ? NaN : n > 24 ? n / 60 : n;
};
// Metrics the app understands. `re` is tested against the normalised header; order matters (first match wins).
export const WELLNESS_METRICS = [
  { key: "sleep", label: "søvn", re: /avg duration|sleep duration|^duration$|varighed|søvn|sleep time|total sleep|^sleep$/, parse: hoursOf, min: 1, max: 16 },
  { key: "hr", label: "hvilepuls", re: /resting|hvilepuls|rhr/, parse: parseNum, min: 25, max: 120 },
  { key: "wt", label: "vægt", re: /^weight|^vægt|body weight|kropsvægt/, parse: parseNum, min: 30, max: 250 },
  { key: "vo2", label: "VO2 max", re: /vo2|vo max|kondital/, parse: parseNum, min: 20, max: 95 },
  { key: "hrv", label: "HRV", re: /hrv|heart rate variability|pulsvariation/, parse: parseNum, min: 10, max: 200 },
  { key: "stress", label: "stress", re: /^avg stress|^stress|stress level|stressniveau/, parse: parseNum, min: 0, max: 100 },
  { key: "endurance", label: "endurance score", re: /endurance/, parse: parseNum, min: 100, max: 20000 },
];
const NOT_WELLNESS = /activity type|aktivitetstype|activity date|activity name|^title$|^km$|^kilometer$|^rpe$|^tid$|^min$|^minutter$/; // an activity list, not a report
const SKIPPED_COLS = /pace|tempo|speed|hastighed|distance|distanc|afstand|activity time|aktivitetstid|calories|kalorier|score$|quality|kvalitet|bedtime|wake|need|status|age|alder|^ftp|max heart|makspuls|average heart|avg heart|gns puls/;
// A Garmin report: a short table whose first column is a date/period. Not an activity list (those have many columns).
export const isReportCSV = (text) => {
  const first = text.replace(/^\ufeff/, "").split(/\r?\n/)[0] || "";
  const heads = parseCSV(first)[0]?.map(norm) || [];
  return heads.length >= 2 && heads.length <= 6 && /^(date|dato|week|uge|month|måned|period)/.test(heads[0]) && !heads.some((h) => NOT_WELLNESS.test(h));
};
export const isWellnessCSV = (text) => {
  const first = text.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
  const heads = parseCSV(first)[0]?.map(norm) || [];
  if (heads.some((h) => NOT_WELLNESS.test(h))) return false;
  return heads.some((h) => WELLNESS_METRICS.some((m) => m.re.test(h))) || heads.some((h) => /sleep|søvn/.test(h));
};
// Start date of a Garmin week label; the year defaults to the current one when the label has none.
const weekLabelStart = (label, year = new Date().getFullYear()) => {
  const t = String(label).replace(/^﻿/, "").trim();
  const trailing = (t.match(/,\s*(\d{4})\s*$/) || [])[1];
  const first = t.replace(/,\s*\d{4}\s*$/, "").split(/\s*[-–]\s*/)[0].trim(); // "Sep 8" | "Jul 28" | "Dec 30, 2025"
  const m = first.match(/^([A-Za-z]{3})[A-Za-z.]*\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!m || MONTHS[m[1].toLowerCase()] == null) return null;
  const y = m[3] || trailing;
  let d = new Date(+(y || year), MONTHS[m[1].toLowerCase()], +m[2]);
  if (isNaN(d)) return null;
  if (!y && d > addDays(new Date(), 7)) d = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()); // "Dec 29 - Jan 4" without a year belongs to last year
  return d;
};
// A month label ("Oct 2025", "Oct", "oktober 2025") → the Mondays of that month.
const monthLabelWeeks = (label, year = new Date().getFullYear()) => {
  const m = String(label).trim().match(/^([A-Za-z]{3})[A-Za-z.]*\.?\s*(\d{4})?$/);
  if (!m || MONTHS[m[1].toLowerCase()] == null) return null;
  let y = m[2] ? +m[2] : year; const mo = MONTHS[m[1].toLowerCase()];
  if (!m[2] && new Date(y, mo, 1) > new Date()) y -= 1;
  const first = new Date(y, mo, 1); let d = mondayOf(first); if (d < first) d = addDays(d, 7);
  const out = []; while (d.getMonth() === mo) { out.push(ymd(d)); d = addDays(d, 7); }
  return out;
};
// Which Mondays a row's date/period covers.
const periodWeeks = (label) => {
  const w = weekLabelStart(label); if (w) return [ymd(mondayOf(w))];
  const mo = monthLabelWeeks(label); if (mo) return mo;
  const d = parseDate(label); return d ? [ymd(mondayOf(d))] : null;
};
export const wellnessFromCSV = (text, fileName = "csv") => {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new ImportError(`${fileName}: filen er tom eller har kun en overskriftslinje.`);
  const headers = rows[0].map(norm);
  const cDate = findCol(headers, [/^date$/, /^dato$/, /^week$/, /^uge$/, /^month$/, /^måned$/, /^period/, /date|dato|week|uge|month|måned|period/]);
  const cols = []; const skipped = [];
  headers.forEach((h, idx) => {
    if (idx === cDate) return;
    const m = WELLNESS_METRICS.find((x) => x.re.test(h) && !(x.key === "hrv" && /status/.test(h) && !/\d/.test(rows[1]?.[idx] || "")));
    if (m && !cols.some((c) => c.m.key === m.key)) cols.push({ idx, m });
    else if (h) skipped.push(rows[0][idx]);
  });
  if (cDate < 0) throw new ImportError(`${fileName}: fandt ingen dato-kolonne. Kolonnerne begynder med: ${rows[0].slice(0, 6).join(", ")}.`);
  if (!cols.length) throw new ImportError(`${fileName}: ingen af tallene bruges af appen (${rows[0].filter((_, k) => k !== cDate).slice(0, 4).join(", ")}). Tempo, distance, tid og kalorier kommer fra dine ture i stedet.`);
  const acc = {}; // monday -> key -> [values]
  for (const row of rows.slice(1)) {
    const r = [...row];
    while (r.length > headers.length && /^\s*\d{4}\b/.test(r[cDate + 1] || "")) r.splice(cDate, 2, `${r[cDate]}, ${r[cDate + 1].trim()}`);
    const label = r[cDate]; if (!label) continue;
    const weeks = periodWeeks(label); if (!weeks) continue;
    for (const { idx, m } of cols) {
      const v = m.parse(r[idx]);
      if (!(v >= m.min && v <= m.max)) continue;
      for (const k of weeks) ((acc[k] ||= {})[m.key] ||= []).push(v);
    }
  }
  const weeks = {}; const counts = {};
  for (const [k, byKey] of Object.entries(acc)) {
    const w = {};
    for (const [key, vals] of Object.entries(byKey)) { const avg = vals.reduce((x, y) => x + y, 0) / vals.length; w[key] = key === "hr" || key === "stress" || key === "endurance" ? Math.round(avg) : Math.round(avg * 10) / 10; counts[key] = (counts[key] || 0) + 1; }
    if (Object.keys(w).length) weeks[k] = w;
  }
  if (!Object.keys(weeks).length) throw new ImportError(`${fileName}: kunne ikke læse datoerne (fx "${rows[1]?.[cDate] || ""}").`);
  return { weeks, counts, skipped, file: fileName, labels: Object.fromEntries(WELLNESS_METRICS.map((m) => [m.key, m.label])) };
};
