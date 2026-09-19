/* Client for the AI coach (api/coach.js). The chat lives only on this device (localStorage), never in the cloud. */
import { t, getLang } from "./i18n.js";

export const COACH_KEY = "ultraplan-coach";

export const loadChat = () => { try { const v = localStorage.getItem(COACH_KEY); return v ? JSON.parse(v) : []; } catch { return []; } };
export const saveChat = (turns) => { try { localStorage.setItem(COACH_KEY, JSON.stringify(turns.slice(-20))); } catch { /* ignore */ } };

export class CoachError extends Error { constructor(message, setup = false) { super(message); this.setup = setup; } }

export async function askCoach({ question, history, context }) {
  let r;
  try {
    r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history, context, lang: getLang() }) });
  } catch { throw new CoachError(t("Kunne ikke kontakte AI-træneren. Tjek din internetforbindelse.")); }
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (r.status === 404) throw new CoachError(t("AI-træneren findes kun i den udgave, der kører på Vercel."), true);
  if (!r.ok) throw new CoachError(data?.error || t("AI-træneren svarede ikke ({status}).", { status: r.status }), r.status === 503);
  return data.text;
}

// Ask the coach for plan parameters (top, level, run days, long-run day) from the runner's numbers. Returns { proposal, text }.
export async function proposePlan({ context }) {
  let r;
  try {
    r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "plan", question: "Foreslå planparametre", context, lang: getLang() }) });
  } catch { throw new CoachError(t("Kunne ikke kontakte AI-træneren. Tjek din internetforbindelse.")); }
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (r.status === 404) throw new CoachError(t("AI-træneren findes kun i den udgave, der kører på Vercel."), true);
  if (!r.ok) throw new CoachError(data?.error || t("AI-træneren svarede ikke ({status}).", { status: r.status }), r.status === 503);
  if (!data?.proposal) throw new CoachError(t("Træneren gav ikke et brugbart forslag. Prøv igen."));
  return data;
}

// Danish; the screen renders each with t().
export const SUGGESTED = [
  "Hvordan griber jeg denne uge an?",
  "Hvad skal jeg spise før og under den lange tur?",
  "Jeg er øm efter sidste tur – hvad gør jeg?",
  "Passer planen til min form lige nu?",
];
