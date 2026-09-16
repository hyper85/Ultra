import { createClient } from "@supabase/supabase-js";

/* Invite a friend – a Vercel serverless function. A logged-in user posts an e-mail; Supabase sends the branded
   "Invite user" mail (supabase/email-invite.html) and the friend gets an account with one tap.
   Needs SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables (a secret: never in the browser),
   plus the VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app already uses. Only signed-in users can invite. */

const json = (res, status, body) => { res.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Brug POST." });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return json(res, 503, { error: "Login er ikke sat op (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mangler)." });
  if (!service) return json(res, 503, { error: "Invitationer er ikke sat op endnu. Sæt SUPABASE_SERVICE_ROLE_KEY i Vercel → Settings → Environment Variables og redeploy." });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(res, 401, { error: "Log ind for at invitere." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return json(res, 400, { error: "Ugyldig JSON." }); } }
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: "Skriv en gyldig e-mail." });

  // Who is inviting? Verify the caller's session with the anon client before touching the admin API.
  const asUser = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me, error: meErr } = await asUser.auth.getUser(token);
  if (meErr || !me?.user) return json(res, 401, { error: "Din session er udløbet. Log ind igen." });
  if (me.user.email && me.user.email.toLowerCase() === email) return json(res, 400, { error: "Det er din egen e-mail." });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const redirectTo = process.env.SITE_URL || (req.headers.origin ? String(req.headers.origin) : undefined);
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { invited_by: me.user.id } });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) return json(res, 409, { error: `${email} har allerede en konto. Bed dem logge ind med en kode.` });
    if (/rate|too many/i.test(error.message)) return json(res, 429, { error: "For mange invitationer lige nu. Supabases indbyggede afsender sender højst 2 mails i timen; egen SMTP (Authentication → SMTP Settings) fjerner grænsen." });
    // Supabase's built-in mail sender only delivers to the project's own team members.
    if (/not authorized|authorized/i.test(error.message)) return json(res, 403, { error: `${email} kan ikke inviteres: Supabases indbyggede afsender må kun sende til projektets egne medlemmer. Sæt egen SMTP op i Supabase (Authentication → SMTP Settings, fx Brevo), så kan du invitere alle.` });
    if (/signups? not allowed|disabled/i.test(error.message)) return json(res, 403, { error: "Nye brugere er slået fra i Supabase. Slå \"Allow new users to sign up\" til under Authentication → Providers → Email." });
    if (/smtp|mail|send/i.test(error.message)) return json(res, 502, { error: `Mailen kunne ikke sendes (${error.message}). Tjek SMTP-indstillingerne i Supabase under Authentication → SMTP Settings.` });
    return json(res, 502, { error: `Invitationen kunne ikke sendes: ${error.message}` });
  }
  return json(res, 200, { ok: true, email });
}
