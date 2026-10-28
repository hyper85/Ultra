import { createClient } from "@supabase/supabase-js";

/* Garmin Connect Personal API – one Vercel function, four operations (POST { op }):
     status      → { connected, lastSync }
     connect     → { ok }  body { key }   (the runner's own Personal API key, checked at Garmin, stored server-side)
     sync        → { days, lastSync, found, fields? }   (resting HR, sleep and HRV day by day since the last sync)
     disconnect  → { ok }                 (the key is deleted here; revoke it at connect.garmin.com too)
   A Personal API key opens ONE Garmin account, so it is stored per app user in the garmin_keys table (only the service
   role can read it, supabase/garmin.sql) and never sent back to the browser. Identity is the caller's Supabase session.
   The key is exchanged for a ~24 h access token (POST …/personal-api-key/token, "Authorization: ApiKey <key>", the
   answer is the token itself, a JWT); data calls use "Authorization: Bearer <token>". Garmin's field names are not
   documented the same way everywhere, so the parsing looks for them a few levels deep; when a list arrives but nothing
   is recognised, the reply names the fields (names only, no values) so the parser can be fixed. */

const json = (res, status, body) => { res.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
export const GARMIN = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
export const KEY_PAGE = "https://connect.garmin.com/app/settings/personalApiToken";
const FIRST_DAYS = 120; // first sync; later syncs go back to two days before the last one
const DAY = 86400000;
const ymdUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

// Garmin's answer is the token itself; some clients see JSON. Expiry from the JWT's exp claim (seconds).
export const parseToken = (text) => {
  let tok = String(text || "").trim();
  if (tok.startsWith("{")) { try { const j = JSON.parse(tok); tok = j.access_token || j.accessToken || j.token || ""; } catch { tok = ""; } }
  tok = tok.replace(/^"|"$/g, "");
  let exp = 0;
  try { exp = JSON.parse(Buffer.from(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).exp * 1000 || 0; } catch { /* not a JWT */ }
  return tok ? { token: tok, exp: exp || Date.now() + 20 * 3600000 } : null;
};
export const exchangeKey = async (key, fetchImpl = fetch) => {
  const r = await fetchImpl(`${GARMIN}${TOKEN_PATH}`, { method: "POST", headers: { Accept: "*/*", Authorization: `ApiKey ${key}` }, signal: AbortSignal.timeout(15_000) });
  const body = await r.text();
  if (r.status === 401 || r.status === 403) { const e = new Error(`Garmin afviste nøglen. Den kan være forkert, udløbet eller slettet. Lav en ny på ${KEY_PAGE}.`); e.status = 401; throw e; }
  if (!r.ok) { const e = new Error(`Garmin svarede ${r.status}. Prøv igen om lidt.`); e.status = 502; throw e; }
  const t = parseToken(body);
  if (!t) { const e = new Error("Garmin sendte ikke en adgangsbillet tilbage."); e.status = 502; throw e; }
  return t;
};

/* ---- parsing: a list of day objects from whatever wrapper Garmin uses ---- */
const listOf = (x) => {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== "object") return [];
  for (const k of ["data", "hrvSummaries", "dailySleepSummaries", "sleepSummaries", "summaries", "items"]) if (Array.isArray(x[k])) return x[k];
  if (x.calendarDate || x.dailySleepDTO) return [x]; // one day (e.g. dailyHeartRate, whose heartRateValues are samples)
  return Object.values(x).find((v) => Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) || [];
};
const deep = (o, keys, test, depth = 3) => {
  if (!o || typeof o !== "object" || depth < 0) return null;
  for (const k of keys) if (k in o && test(o[k])) return o[k];
  for (const v of Object.values(o)) if (v && typeof v === "object" && !Array.isArray(v)) { const r = deep(v, keys, test, depth - 1); if (r != null) return r; }
  return null;
};
const isNum = (v) => typeof v === "number" && isFinite(v);
// A number as Garmin may send it: 52, "52", or wrapped ({ value: 52, unit: "bpm" }).
export const num = (v) => {
  if (isNum(v)) return v;
  if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) return +v;
  if (v && typeof v === "object" && !Array.isArray(v)) { for (const k of ["value", "bpm", "beatsPerMinute", "average", "avg"]) { const n = num(v[k]); if (n != null) return n; } }
  return null;
};
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const dateOf = (o) => { const d = deep(o, ["calendarDate", "sleepDate", "date", "summaryDate"], isDate); return d ? d.slice(0, 10) : null; };
const RHR = ["restingHeartRate", "restingHeartRateInBeatsPerMinute", "restingHr", "restingHR"];
const SLEEP_S = ["sleepTimeSeconds", "totalSleepTimeInSeconds", "sleepTimeInSeconds", "totalSleepSeconds", "durationInSeconds"];
const HRV = ["lastNightAvg", "lastNightAverage", "hrvLastNightAvg"];
const fieldNames = (list) => [...new Set(list.slice(0, 3).flatMap((o) => Object.keys(o || {})))].slice(0, 25);
// Resting HR: the known names first, then any name with "resting" in it – but ONLY at the top of the day and in its
// heartRate section. Other sections (stress, respiration, body battery) have "resting…" numbers that are not a pulse.
// 7-day averages, timestamps, durations and zones are not today's value. Returns { v, path } so the reply can say
// which field the number came from.
const NOT_TODAY = /seven|avg|average|timestamp|time|date|zone|trend|baseline|duration|stress|percent/i;
export const restingOf = (o) => {
  if (!o || typeof o !== "object") return null;
  const scopes = [["", o], ["heartRate.", o.heartRate && typeof o.heartRate === "object" ? o.heartRate : null]].filter(([, x]) => x);
  for (const [pre, x] of scopes) for (const k of RHR) if (num(x[k]) != null) return { v: num(x[k]), path: pre + k };
  for (const [pre, x] of scopes) for (const [k, v] of Object.entries(x)) if (/resting/i.test(k) && !NOT_TODAY.test(k) && num(v) != null) return { v: num(v), path: pre + k };
  return null;
};
// The fields one level inside the heartRate section with their TYPE, for the "not recognised" message: names and
// shapes only, never values ("restingValue: tom", "restingValue: {value, unit}", "minValue: tal").
export const shapeOf = (v) => v == null ? "tom" : Array.isArray(v) ? `liste(${v.length})` : typeof v === "object" ? `{${Object.keys(v).slice(0, 6).join(", ")}}` : typeof v === "number" ? "tal" : typeof v === "string" ? (/^\s*\d/.test(v) ? "tal som tekst" : "tekst") : typeof v;
const heartRateNames = (list) => {
  const hs = list.map((o) => o?.heartRate).filter((x) => x && typeof x === "object"); if (!hs.length) return null;
  // the most informative day: one where the resting field is not empty, if any
  const h = hs.find((x) => Object.entries(x).some(([k, v]) => /resting/i.test(k) && v != null)) || hs[0];
  return Object.entries(h).slice(0, 25).map(([k, v]) => `${k}: ${shapeOf(v)}`);
};

/* garminDays({ summaries, sleeps, hrvs }) → { days: { "YYYY-MM-DD": { hr?, sleep?, hrv? } }, found, fields }.
   Sleep in hours (one decimal), resting HR and HRV whole numbers; values outside a human range are dropped. */
export const garminDays = ({ summaries, sleeps, hrvs, heartDays } = {}) => {
  const days = {}; const found = { hr: 0, sleep: 0, hrv: 0 }; const fields = {}; const paths = {};
  const put = (d, k, v) => { (days[d] ||= {})[k] = v; found[k]++; };
  const S = listOf(summaries), Z = listOf(sleeps), H = listOf(hrvs);
  const hrFrom = (o, pre) => { const r = restingOf(o); if (r && r.v >= 25 && r.v <= 120) { paths[pre + r.path] = (paths[pre + r.path] || 0) + 1; return r.v; } return null; };
  for (const o of S) { const d = dateOf(o), v = hrFrom(o, "dagsoversigt."); if (d && v != null) put(d, "hr", Math.round(v)); }
  // Fallback: the one-day heart-rate endpoint, for the days the summaries gave no resting HR.
  const D = listOf(heartDays);
  for (const o of D) { const d = dateOf(o); if (!d || days[d]?.hr) continue; const v = hrFrom(o, "dagspuls."); if (v != null) put(d, "hr", Math.round(v)); }
  for (const o of Z) { const d = dateOf(o), s = deep(o, SLEEP_S, isNum); if (d && s / 3600 >= 1 && s / 3600 <= 16) put(d, "sleep", Math.round((s / 3600) * 10) / 10); }
  for (const o of H) { const d = dateOf(o), v = deep(o, HRV, isNum); if (d && v >= 10 && v <= 250) put(d, "hrv", Math.round(v)); }
  if (S.length && !found.hr) { fields.dagsoversigt = fieldNames(S); const h = heartRateNames(S); if (h) fields["dagsoversigt.heartRate"] = h; }
  if (D.length && !found.hr) fields.dagspuls = fieldNames(D);
  if (!D.length && heartDays?.probe && !found.hr) fields.dagspuls = heartDays.probe;
  if (Z.length && !found.sleep) fields.søvn = fieldNames(Z);
  if (H.length && !found.hrv) fields.hrv = fieldNames(H);
  const source = Object.keys(paths).length ? { hr: Object.entries(paths).sort((a, b) => b[1] - a[1])[0][0] } : {};
  return { days, found, fields, source };
};

// Date ranges split into chunks Garmin accepts (sleep 31 days, HRV 180, daily summaries 365).
const chunks = (start, end, size) => { const out = []; for (let a = Date.parse(start); a <= Date.parse(end); a += size * DAY) out.push([ymdUTC(a), ymdUTC(Math.min(Date.parse(end), a + (size - 1) * DAY))]); return out; };
/* garminFetch({ token, start, end }) → { summaries, sleeps, hrvs } (raw lists). A part Garmin refuses (404 for an
   endpoint this key does not cover) comes back empty and is named in `missing`, so the rest still arrives. */
export const garminFetch = async ({ token, start, end, fetchImpl = fetch }) => {
  const missing = []; const probes = {};
  const get = async (path, q, name) => {
    const r = await fetchImpl(`${GARMIN}${path}${q ? `?${new URLSearchParams(q)}` : ""}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 401) { const e = new Error("Garmin afviste adgangsbilletten."); e.status = 401; throw e; }
    if (!r.ok) { missing.push(`${name} (${r.status})`); return []; }
    let j; try { j = await r.json(); } catch { return []; }
    const list = listOf(j);
    if (!list.length && j != null) probes[name] ||= Array.isArray(j) ? [`liste(${j.length})`] : typeof j === "object" ? Object.keys(j).slice(0, 25) : [shapeOf(j)];
    return list;
  };
  const all = (size, name, call) => Promise.all(chunks(start, end, size).map(([a, b]) => call(a, b))).then((p) => p.flat());
  const [summaries, sleeps, hrvs] = await Promise.all([
    all(365, "dagsoversigt", (a, b) => get("/usersummary-service/v2/dailysummaries", { startDate: a, endDate: b }, "dagsoversigt")),
    all(31, "søvn", (a, b) => get("/sleep-service/sleep/dailySleepSummariesByDate", { startDate: a, endDate: b }, "søvn")),
    all(180, "hrv", (a, b) => get(`/hrv-service/hrv/daily/${a}/${b}`, null, "hrv")), // HRV takes the dates in the path
  ]);
  // No resting HR in the summaries: ask the one-day heart-rate endpoint for the last 7 days of the range.
  let heartDays = [];
  if (!summaries.some((o) => restingOf(o)?.v > 0)) {
    const last = Array.from({ length: 7 }, (_, i) => ymdUTC(Date.parse(end) - i * DAY)).filter((d) => d >= start);
    heartDays = (await Promise.all(last.map((d) => get("/wellness-service/wellness/dailyHeartRate", { date: d }, "dagspuls").then((x) => (x.length ? x : [])).catch(() => [])))).flat();
  }
  if (!heartDays.length && probes.dagspuls) heartDays.probe = probes.dagspuls; // what the one-day endpoint answered instead
  return { summaries, sleeps, hrvs, heartDays, missing: [...new Set(missing)] };
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Brug POST." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return json(res, 400, { error: "Ugyldig JSON." }); } }
  const op = String(body?.op || "");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return json(res, 503, { error: "Garmin kræver login: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY og SUPABASE_SERVICE_ROLE_KEY skal være sat i Vercel." });
  const session = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!session) return json(res, 401, { error: "Log ind for at forbinde Garmin." });
  const asUser = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me, error: meErr } = await asUser.auth.getUser(session);
  if (meErr || !me?.user) return json(res, 401, { error: "Din session er udløbet. Log ind igen." });
  const uid = me.user.id;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const load = async () => { const { data, error } = await admin.from("garmin_keys").select("*").eq("user_id", uid).maybeSingle(); if (error) throw Object.assign(new Error(`Databasen svarede: ${error.message}. Kør supabase/garmin.sql i Supabase → SQL Editor.`), { status: 502 }); return data; };

  try {
    if (op === "status") { const row = await load(); return json(res, 200, { connected: !!row, lastSync: row?.last_sync || null }); }
    if (op === "connect") {
      const key = String(body?.key || "").trim();
      if (key.length < 20 || /\s/.test(key)) return json(res, 400, { error: "Det ligner ikke en Garmin-nøgle. Kopiér hele nøglen fra Garmin Connect." });
      const tok = await exchangeKey(key); // proves the key works before it is stored
      const { error } = await admin.from("garmin_keys").upsert({ user_id: uid, api_key: key, access_token: tok.token, token_expires: tok.exp, last_sync: null }, { onConflict: "user_id" });
      if (error) return json(res, 502, { error: `Kunne ikke gemme nøglen: ${error.message}. Kør supabase/garmin.sql i Supabase.` });
      return json(res, 200, { ok: true });
    }
    if (op === "disconnect") { await admin.from("garmin_keys").delete().eq("user_id", uid); return json(res, 200, { ok: true }); }
    if (op === "sync") {
      const row = await load();
      if (!row) return json(res, 404, { error: "Garmin er ikke forbundet.", connected: false });
      let token = row.access_token, exp = +row.token_expires || 0;
      const renew = async () => { const t = await exchangeKey(row.api_key); token = t.token; exp = t.exp; await admin.from("garmin_keys").update({ access_token: token, token_expires: exp }).eq("user_id", uid); };
      if (!token || exp - Date.now() < 3600000) await renew();
      const now = Date.now();
      // `full` (the app asks once after a parser fix) fetches the whole first range again.
      const from = row.last_sync && !body?.full ? Math.max(Date.parse(row.last_sync) - 2 * DAY, now - 365 * DAY) : now - FIRST_DAYS * DAY;
      const range = { start: ymdUTC(from), end: ymdUTC(now) };
      let raw;
      try { raw = await garminFetch({ token, ...range, }); }
      catch (e) { if (e.status !== 401) throw e; await renew(); raw = await garminFetch({ token, ...range, }); }
      const out = garminDays(raw);
      // The next sync starts from here only when something arrived; an empty answer keeps the full range for next time.
      const got = out.found.hr + out.found.sleep + out.found.hrv;
      const lastSync = got ? new Date(now).toISOString() : row.last_sync || null;
      if (got) await admin.from("garmin_keys").update({ last_sync: lastSync }).eq("user_id", uid);
      return json(res, 200, { days: out.days, found: out.found, source: out.source, range, full: !!body?.full, lastSync, ...(Object.keys(out.fields).length ? { fields: out.fields } : {}), ...(raw.missing.length ? { missing: raw.missing } : {}) });
    }
    return json(res, 400, { error: "Ukendt handling." });
  } catch (e) {
    if (e.status === 401 && op === "sync") return json(res, 401, { error: e.message, connected: true, keyRejected: true });
    return json(res, e.status && e.status < 600 ? e.status : 500, { error: e.message || "Garmin-forbindelsen fejlede." });
  }
}
