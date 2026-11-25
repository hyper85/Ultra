/* Client for the AI coach (api/coach.js). The chat lives only on this device (localStorage), never in the cloud. */
import { t, getLang } from "./i18n.js";
import { supabase } from "./sync.js";

// The coach answers only a logged-in runner (api/coach.js checks the session): send it when there is one.
const authHeader = async () => { try { const { data } = (await supabase?.auth.getSession()) || {}; const tok = data?.session?.access_token; return tok ? { Authorization: `Bearer ${tok}` } : {}; } catch { return {}; } };
const loginError = (data) => { const e = new CoachError(data?.error || t("Log ind under Mere → Konto for at bruge AI-træneren.")); e.login = true; return e; };

export const COACH_KEY = "ultraplan-coach";

export const loadChat = () => { try { const v = localStorage.getItem(COACH_KEY); return v ? JSON.parse(v) : []; } catch { return []; } };
export const saveChat = (turns) => { try { localStorage.setItem(COACH_KEY, JSON.stringify(turns.slice(-20))); } catch { /* ignore */ } };

export class CoachError extends Error { constructor(message, setup = false) { super(message); this.setup = setup; } }

export async function askCoach({ question, history, context }) {
  let r;
  try {
    r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ question, history, context, lang: getLang() }) });
  } catch { throw new CoachError(t("Kunne ikke kontakte AI-træneren. Tjek din internetforbindelse.")); }
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (r.status === 404) throw new CoachError(t("AI-træneren findes kun i den udgave, der kører på Vercel."), true);
  if (r.status === 401) throw loginError(data);
  if (!r.ok) throw new CoachError(data?.error || t("AI-træneren svarede ikke ({status}).", { status: r.status }), r.status === 503);
  if (typeof data?.text !== "string") throw new CoachError(t("AI-træneren svarede ikke som forventet. Prøv igen om lidt."));
  return data.text;
}

// Ask the coach for plan parameters (top, level, run days, long-run day) from the runner's numbers. Returns { proposal, text }.
export async function proposePlan({ context }) {
  let r;
  try {
    r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ mode: "plan", question: "Foreslå planparametre", context, lang: getLang() }) });
  } catch { throw new CoachError(t("Kunne ikke kontakte AI-træneren. Tjek din internetforbindelse.")); }
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (r.status === 404) throw new CoachError(t("AI-træneren findes kun i den udgave, der kører på Vercel."), true);
  if (r.status === 401) throw loginError(data);
  if (!r.ok) throw new CoachError(data?.error || t("AI-træneren svarede ikke ({status}).", { status: r.status }), r.status === 503);
  if (!data?.proposal) throw new CoachError(t("Træneren gav ikke et brugbart forslag. Prøv igen."));
  return data;
}

// Danish; the screen renders each with t().
// One list per training mode, so a strength-only user is not asked about the long run.
export const SUGGESTED = {
  race: ["Hvordan griber jeg denne uge an?", "Hvad skal jeg spise før og under den lange tur?", "Jeg er øm efter sidste tur – hvad gør jeg?", "Passer planen til min form lige nu?"],
  hybrid: ["Hvordan griber jeg denne uge an?", "Hvordan kombinerer jeg styrke og løb på samme dag?", "Hvad skal jeg spise på en styrkedag?", "Passer planen til min form lige nu?"],
  strength: ["Hvordan griber jeg denne uge an?", "Hvornår skal jeg lægge vægt på?", "Hvad skal jeg spise for at bygge muskler?", "Jeg er øm efter sidste pas – hvad gør jeg?"],
  fitness: ["Hvordan griber jeg denne uge an?", "Hvordan bliver jeg hurtigere uden et løb at træne mod?", "Jeg er øm efter sidste tur – hvad gør jeg?", "Passer planen til min form lige nu?"],
};
