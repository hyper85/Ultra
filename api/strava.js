import { createClient } from "@supabase/supabase-js";

/* Strava connection – one Vercel function, four operations (POST { op }):
     config      → { clientId }                         (public; the app builds the Strava authorize URL itself)
     exchange    → { athlete }  body { code }            (code from Strava → tokens, stored server-side per user)
     sync        → { activities, lastSync, athlete }     (new activities since the last sync, up to 120 days back)
     disconnect  → { ok }                                (tokens deleted here and revoked at Strava)
   Identity is the caller's Supabase session (Bearer token). Tokens live in the strava_tokens table, which only the
   service role can read (supabase/strava.sql). Secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY.
   The Strava client secret and the athlete's tokens never reach the browser. */

const json = (res, status, body) => { res.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
const STRAVA = "https://www.strava.com";
const LOOKBACK_DAYS = 120;

const stravaToken = async (params) => {
  const r = await fetch(`${STRAVA}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...params }), signal: AbortSignal.timeout(20_000) });
  let data = null; try { data = await r.json(); } catch { /* not json */ }
  if (!r.ok) { const e = new Error(data?.message || data?.errors?.[0]?.code || `Strava svarede ${r.status}`); e.status = r.status; throw e; }
  return data;
};

// A Strava activity as the app's plain shape; the app's import code turns it into a stored activity.
const mapActivity = (a) => ({
  stravaId: a.id, startLocal: a.start_date_local, km: (a.distance || 0) / 1000, min: (a.moving_time || a.elapsed_time || 0) / 60,
  hr: a.average_heartrate ? Math.round(a.average_heartrate) : null, type: a.sport_type || a.type || "Workout", name: a.name || "",
  vert: Math.round(a.total_elevation_gain || 0), treadmill: !!a.trainer,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Brug POST." });
  const clientId = process.env.STRAVA_CLIENT_ID, secret = process.env.STRAVA_CLIENT_SECRET;
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return json(res, 400, { error: "Ugyldig JSON." }); } }
  const op = String(body?.op || "");
  if (op === "config") return json(res, 200, { clientId: clientId || null, ready: !!(clientId && secret && process.env.SUPABASE_SERVICE_ROLE_KEY) });
  if (!clientId || !secret) return json(res, 503, { error: "Strava er ikke sat op endnu. Opret en API-app på strava.com/settings/api og sæt STRAVA_CLIENT_ID og STRAVA_CLIENT_SECRET i Vercel → Settings → Environment Variables. Redeploy bagefter." });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return json(res, 503, { error: "Strava kræver login: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY og SUPABASE_SERVICE_ROLE_KEY skal være sat i Vercel." });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(res, 401, { error: "Log ind for at forbinde Strava." });
  const asUser = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me, error: meErr } = await asUser.auth.getUser(token);
  if (meErr || !me?.user) return json(res, 401, { error: "Din session er udløbet. Log ind igen." });
  const uid = me.user.id;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const load = async () => { const { data, error } = await admin.from("strava_tokens").select("*").eq("user_id", uid).maybeSingle(); if (error) throw new Error(`Databasen svarede: ${error.message}. Kør supabase/strava.sql.`); return data; };

  try {
    if (op === "exchange") {
      const code = String(body?.code || "");
      if (!code) return json(res, 400, { error: "Der mangler en kode fra Strava." });
      const t = await stravaToken({ code, grant_type: "authorization_code" });
      const scope = String(body?.scope || "");
      if (scope && !/activity:read/.test(scope)) return json(res, 400, { error: "Strava gav ikke adgang til aktiviteter. Sæt hak ved \"View data about your activities\" og prøv igen." });
      const athleteName = [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ");
      const row = { user_id: uid, athlete_id: t.athlete?.id || null, athlete_name: athleteName || null, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, last_sync: null };
      const { error } = await admin.from("strava_tokens").upsert(row, { onConflict: "user_id" });
      if (error) return json(res, 502, { error: `Kunne ikke gemme forbindelsen: ${error.message}. Kør supabase/strava.sql i Supabase.` });
      return json(res, 200, { athlete: athleteName || "Strava" });
    }
    if (op === "status") {
      const row = await load();
      return json(res, 200, { connected: !!row, athlete: row?.athlete_name || null, lastSync: row?.last_sync || null });
    }
    if (op === "disconnect") {
      const row = await load();
      if (row) {
        try { await fetch(`${STRAVA}/oauth/deauthorize`, { method: "POST", headers: { Authorization: `Bearer ${row.access_token}` }, signal: AbortSignal.timeout(10_000) }); } catch { /* best effort */ }
        await admin.from("strava_tokens").delete().eq("user_id", uid);
      }
      return json(res, 200, { ok: true });
    }
    if (op === "sync") {
      let row = await load();
      if (!row) return json(res, 404, { error: "Strava er ikke forbundet.", connected: false });
      // Refresh an access token that expires within 5 minutes; Strava rotates the refresh token too.
      if (row.expires_at * 1000 < Date.now() + 5 * 60_000) {
        const t = await stravaToken({ refresh_token: row.refresh_token, grant_type: "refresh_token" });
        row = { ...row, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
        await admin.from("strava_tokens").update({ access_token: row.access_token, refresh_token: row.refresh_token, expires_at: row.expires_at }).eq("user_id", uid);
      }
      const since = Math.floor((body?.since ? new Date(body.since).getTime() : row.last_sync ? new Date(row.last_sync).getTime() - 3 * 86400_000 : Date.now() - LOOKBACK_DAYS * 86400_000) / 1000);
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const r = await fetch(`${STRAVA}/api/v3/athlete/activities?after=${since}&per_page=200&page=${page}`, { headers: { Authorization: `Bearer ${row.access_token}` }, signal: AbortSignal.timeout(20_000) });
        if (r.status === 401) return json(res, 401, { error: "Strava afviste forbindelsen. Forbind igen.", connected: false });
        if (r.status === 429) return json(res, 429, { error: "Strava har en grænse for antal kald. Prøv igen om 15 minutter." });
        if (!r.ok) return json(res, 502, { error: `Strava svarede ${r.status}.` });
        const list = await r.json();
        if (!Array.isArray(list) || !list.length) break;
        out.push(...list.map(mapActivity));
        if (list.length < 200) break;
      }
      const now = new Date().toISOString();
      await admin.from("strava_tokens").update({ last_sync: now }).eq("user_id", uid);
      return json(res, 200, { activities: out, lastSync: now, athlete: row.athlete_name || null });
    }
    return json(res, 400, { error: "Ukendt handling." });
  } catch (e) {
    return json(res, e.status === 401 ? 401 : 502, { error: e.message || "Strava svarede ikke." });
  }
}
