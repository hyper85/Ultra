import { createClient } from "@supabase/supabase-js";

/* Delete my account – a Vercel function. App stores (Google Play) require that a user can delete the account and its
   data from inside the app. POST { op: "delete" } with the caller's Supabase session:
     1. Strava: the tokens are revoked at Strava (best effort) and the row deleted (strava_tokens)
     2. Garmin: the stored Personal API key is deleted (garmin_keys) – the runner revokes it at Garmin too
     3. the synced profile, log and activities (ultraplan_user_data)
     4. the login itself (auth.users), with the service role
   A table that does not exist (a setup without Strava or Garmin) is skipped, not an error. The browser then wipes the
   device. Needs SUPABASE_SERVICE_ROLE_KEY (server only). */

const json = (res, status, body) => { res.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
const missingTable = (e) => e && /does not exist|relation .* not found|schema cache/i.test(e.message || "");

export async function deleteAccount({ admin, uid, fetchImpl = fetch }) {
  const done = [];
  // Strava: revoke first (needs the token), then delete the row.
  const { data: st, error: stErr } = await admin.from("strava_tokens").select("access_token").eq("user_id", uid).maybeSingle();
  if (stErr && !missingTable(stErr)) throw new Error(`Strava: ${stErr.message}`);
  if (st?.access_token) { try { await fetchImpl("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${st.access_token}` }, signal: AbortSignal.timeout(10_000) }); } catch { /* best effort */ } }
  for (const table of ["strava_tokens", "garmin_keys", "ultraplan_user_data"]) {
    const { error } = await admin.from(table).delete().eq("user_id", uid);
    if (error && !missingTable(error)) throw new Error(`${table}: ${error.message}`);
    done.push(table);
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) throw new Error(`login: ${delErr.message}`);
  done.push("auth.users");
  return done;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Brug POST." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return json(res, 400, { error: "Ugyldig JSON." }); } }
  if (body?.op !== "delete") return json(res, 400, { error: "Ukendt handling." });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return json(res, 503, { error: "Sletning af konto er ikke sat op: SUPABASE_SERVICE_ROLE_KEY mangler i Vercel." });
  const session = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!session) return json(res, 401, { error: "Log ind for at slette din konto." });
  const asUser = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me, error: meErr } = await asUser.auth.getUser(session);
  if (meErr || !me?.user) return json(res, 401, { error: "Din session er udløbet. Log ind igen og prøv igen." });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try { const deleted = await deleteAccount({ admin, uid: me.user.id }); return json(res, 200, { ok: true, deleted }); }
  catch (e) { return json(res, 502, { error: `Kontoen kunne ikke slettes helt (${e.message}). Prøv igen, eller skriv til os.` }); }
}
