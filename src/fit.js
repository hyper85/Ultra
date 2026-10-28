/* FIT (Garmin's binary activity file) → the app's activities. No library: the format is a 12/14-byte header with
   ".FIT" at bytes 8–11, then records. A definition record says which fields (number, size, base type) a local message
   type carries and in which byte order; data records then follow that layout; a compressed-timestamp header reuses a
   definition. Only what the app uses is read:
     file_id (0) · sport (12: sport, sub_sport) · session (18) · event (21: timer start/stop) · record (20: timestamp,
     distance, heart rate, altitude) · workout (26: name).
   A finished activity has a session with the totals. A file the watch never closed (it shows in the day's totals but
   will not open or sync) has only records: then the run is rebuilt from them – distance from the last record, moving
   time from the timer start/stop events (or from record gaps), heart rate as the mean of the samples, climb from the
   smoothed altitude. Timestamps are seconds since 1989-12-31 00:00 UTC. */

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z in Unix seconds
export const isFIT = (u8) => u8 && u8.length >= 14 && (u8[0] === 12 || u8[0] === 14) && u8[8] === 0x2e && u8[9] === 0x46 && u8[10] === 0x49 && u8[11] === 0x54;

const INVALID = { 0: 0xff, 1: 0x7f, 2: 0xff, 3: 0x7fff, 4: 0xffff, 5: 0x7fffffff, 6: 0xffffffff, 10: 0, 11: 0, 12: 0, 13: 0xff };
const readField = (dv, u8, off, size, base, le) => {
  const t = base & 0x1f;
  if (t === 7) { let s = ""; for (let i = 0; i < size && u8[off + i]; i++) s += String.fromCharCode(u8[off + i]); try { return decodeURIComponent(escape(s)); } catch { return s; } }
  let v = null;
  if ((t === 0 || t === 2 || t === 10 || t === 13) && size >= 1) v = u8[off];
  else if (t === 1 && size >= 1) v = dv.getInt8(off);
  else if (t === 3 && size >= 2) v = dv.getInt16(off, le);
  else if ((t === 4 || t === 11) && size >= 2) v = dv.getUint16(off, le);
  else if (t === 5 && size >= 4) v = dv.getInt32(off, le);
  else if ((t === 6 || t === 12) && size >= 4) v = dv.getUint32(off, le);
  else if (t === 8 && size >= 4) v = dv.getFloat32(off, le);
  else if (t === 9 && size >= 8) v = dv.getFloat64(off, le);
  else return null;
  return INVALID[t] !== undefined && v === INVALID[t] ? null : v;
};

/* parseFIT(arrayBuffer) → { fileType, sport, subSport, workoutName, sessions: [...], records: [...], events: [...] } */
export function parseFIT(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!isFIT(u8)) throw new Error("not a FIT file");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hs = u8[0]; const end = Math.min(u8.length, hs + dv.getUint32(4, true));
  const defs = {}; const out = { fileType: null, sport: null, subSport: null, workoutName: "", sessions: [], records: [], events: [] };
  let p = hs, lastTs = 0;
  const WANT = { 0: 1, 12: 1, 18: 1, 20: 1, 21: 1, 26: 1 };
  while (p < end) {
    const h = u8[p++];
    let def, ts = null;
    if (h & 0x80) { def = defs[(h >> 5) & 3]; if (!def) break; ts = (lastTs & ~0x1f) + (h & 0x1f); if (ts < lastTs) ts += 0x20; }
    else if (h & 0x40) {
      if (p + 5 > end) break;
      p++; const le = u8[p++] === 0; const g = dv.getUint16(p, le); p += 2; const nf = u8[p++];
      const fields = []; let len = 0;
      for (let i = 0; i < nf; i++) { fields.push({ n: u8[p], s: u8[p + 1], t: u8[p + 2] }); len += u8[p + 1]; p += 3; }
      if (h & 0x20) { const nd = u8[p++]; for (let i = 0; i < nd; i++) { len += u8[p + 1]; p += 3; } } // developer fields: skipped by size
      defs[h & 0x0f] = { g, le, fields, len };
      continue;
    } else { def = defs[h & 0x0f]; if (!def) break; }
    if (p + def.len > end) break;
    if (WANT[def.g]) {
      const o = {}; let q = p;
      for (const f of def.fields) { o[f.n] = readField(dv, u8, q, f.s, f.t, def.le); q += f.s; }
      if (o[253] != null) lastTs = o[253]; else if (ts != null) { o[253] = ts; lastTs = ts; }
      if (def.g === 0) out.fileType = o[0];
      else if (def.g === 12) { out.sport ??= o[0]; out.subSport ??= o[1]; }
      else if (def.g === 18) out.sessions.push(o);
      else if (def.g === 20) out.records.push(o);
      else if (def.g === 21) out.events.push(o);
      else if (def.g === 26 && typeof o[8] === "string") out.workoutName = o[8];
    } else if (ts != null) lastTs = ts;
    else {
      // keep the running timestamp even from messages the app does not read (field 253 is first in Garmin's layouts)
      let q = p; for (const f of def.fields) { if (f.n === 253 && f.s === 4) { const v = dv.getUint32(q, def.le); if (v !== 0xffffffff) lastTs = v; } q += f.s; }
    }
    p += def.len;
  }
  return out;
}

// FIT sport / sub_sport → the type names the rest of the app already knows (Strava's sport_type words).
export const fitType = (sport, sub) => {
  if (sport === 1) return sub === 3 ? "TrailRun" : sub === 1 || sub === 45 ? "Run" : "Run";
  if (sport === 11) return "Walk";
  if (sport === 17) return "Hike";
  if (sport === 2) return sub === 6 || sub === 58 ? "VirtualRide" : "Ride";
  if (sport === 5) return "Swim";
  if (sport === 10 || sport === 4) return sub === 20 ? "WeightTraining" : sub === 26 ? "Yoga" : "Workout";
  if (sport === 62) return "HIIT";
  return "Workout";
};

const toDate = (fitTs) => new Date((fitTs + FIT_EPOCH) * 1000);
// Moving time from the timer events: sum of start→stop spans (event 0 = timer; type 0 start, 1 stop, 4 stop_all).
const timerSeconds = (events, lastTs) => {
  let t = 0, from = null;
  for (const e of events) {
    if (e[0] !== 0 || e[253] == null) continue;
    if (e[1] === 0) { if (from == null) from = e[253]; }
    else if (e[1] === 1 || e[1] === 4 || e[1] === 9) { if (from != null) { t += e[253] - from; from = null; } }
  }
  if (from != null && lastTs > from) t += lastTs - from;
  return t;
};
// Climb from altitude: a moving average over ~10 samples, then the sum of rises above 0.5 m (filters GPS/baro noise).
const climb = (alts) => {
  if (alts.length < 20) return 0;
  const w = 10, sm = alts.map((_, i) => { const a = alts.slice(Math.max(0, i - w), i + w + 1); return a.reduce((s, x) => s + x, 0) / a.length; });
  let up = 0, base = sm[0];
  for (const a of sm) { if (a > base + 0.5) { up += a - base; base = a; } else if (a < base) base = a; }
  return Math.round(up);
};

/* fitActivities(arrayBuffer) → plain activities ({ date, km, min, hr, maxHr, type, name, vert, treadmill, rebuilt })
   for the import's mk(). One per session; a file without a session gives one rebuilt from its records. */
export function fitActivities(buf) {
  const f = parseFIT(buf);
  const treadmillSub = f.subSport === 1;
  const recs = f.records.filter((r) => r[253] != null);
  const alt = (r) => (r[78] != null ? r[78] / 5 - 500 : r[2] != null ? r[2] / 5 - 500 : null);
  const outdoor = recs.some((r) => r[0] != null && r[1] != null);
  if (f.sessions.length) {
    return f.sessions.filter((s) => s[2] != null || s[253] != null).map((s) => {
      const sport = s[5] ?? f.sport, sub = s[6] ?? f.subSport;
      const km = (s[9] || 0) / 100000, min = ((s[8] ?? s[7]) || 0) / 60000;
      return { date: toDate(s[2] ?? s[253]), km, min, hr: s[16] || null, maxHr: s[17] || null, type: fitType(sport, sub), name: f.workoutName,
        vert: sub === 1 ? 0 : s[22] || 0, treadmill: sub === 1 || (sport === 1 && !outdoor && km > 0), rebuilt: false };
    });
  }
  if (!recs.length) return [];
  const first = recs[0][253], last = recs[recs.length - 1][253];
  const dists = recs.map((r) => r[5]).filter((d) => d != null);
  const km = dists.length ? Math.max(...dists) / 100000 : 0;
  let sec = timerSeconds(f.events, last);
  if (!(sec > 0)) { sec = 0; for (let i = 1; i < recs.length; i++) { const d = recs[i][253] - recs[i - 1][253]; if (d > 0 && d <= 10) sec += d; } }
  const hrs = recs.map((r) => r[3]).filter((x) => x > 30 && x < 240);
  const alts = recs.map(alt).filter((x) => x != null && x > -400 && x < 9000);
  return [{ date: toDate(first), km, min: sec / 60, hr: hrs.length ? Math.round(hrs.reduce((s, x) => s + x, 0) / hrs.length) : null, maxHr: hrs.length ? Math.max(...hrs) : null,
    type: fitType(f.sport, f.subSport), name: f.workoutName, vert: treadmillSub || !outdoor ? 0 : climb(alts), treadmill: treadmillSub || (f.sport === 1 && !outdoor && km > 0), rebuilt: true }];
}
