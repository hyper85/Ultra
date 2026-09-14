import Anthropic from "@anthropic-ai/sdk";

/* AI coach – a Vercel serverless function. The browser posts the runner's numbers (no name, no e-mail) and a
   question; Claude answers as Ultraplan's coach. Needs ANTHROPIC_API_KEY in Vercel → Settings → Environment
   Variables. Without it the app shows a friendly "not set up" message instead of a broken chat. */

export const config = { maxDuration: 60 };

const MODEL = "claude-opus-5";
const SYSTEM = `Du er træneren i Ultraplan, en dansk app til ultra- og trailløbere med et almindeligt liv (job, familie, begrænset tid).
Du får løberens tal fra appen som JSON: profil, løbet, planen for denne uge, de seneste uger i loggen, og de mønstre appen har fundet.

Sådan svarer du:
- Kort og konkret. Giv tallet, reglen bag og hvad løberen skal gøre i denne uge. Typisk 60–120 ord; mere kun hvis der bedes om en hel plan.
- Du-form, dansk (svar på det sprog brugeren skriver). Ingen overskrifter, ingen punktlister med mere end 4 punkter, ingen markdown-fed.
- Brug kun tal fra konteksten. Mangler et tal, så sig det i stedet for at gætte.
- Appens principper gælder: planens tal er et loft, ikke et gulv. Trænerrådet i appen (ACWR over 1,5, mere end 140 % af planen, eller hvilepuls 7+ over normal) overstyrer planen: så skæres ugen ned og hårde pas droppes. Anbefal aldrig at springe en let uge (deload) eller nedtrapningen over.
- Rolige ture under 70 % af makspuls. Kulhydrat 40 g/t tidligt i planen, 60–90 g/t i ultra-prep på ture over 90 min. Protein 2 g/kg (2,2 ved vægttab).
- Smerte, der ændrer skridtet: stop. Smerte over 2 uger: fysioterapeut. Ved smerte eller sygdom siger du kort, at du ikke er læge.
- Er brugerens spørgsmål ikke om løb, træning, kost eller restitution, så svar venligt at det ligger uden for din rolle.
- Ingen indledning, ingen afsluttende opsummering. Bare svaret.`;

const json = (res, status, body) => { res.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Brug POST." });
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: "AI-træneren er ikke sat op endnu. Sæt ANTHROPIC_API_KEY i Vercel → Settings → Environment Variables og redeploy." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return json(res, 400, { error: "Ugyldig JSON." }); } }
  const question = String(body?.question || "").trim().slice(0, 800);
  const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];
  const context = body?.context && typeof body.context === "object" ? body.context : null;
  if (!question) return json(res, 400, { error: "Skriv et spørgsmål." });
  const ctxText = JSON.stringify(context || {});
  if (ctxText.length > 30000) return json(res, 413, { error: "For meget kontekst." });

  const messages = [];
  for (const h of history) {
    if ((h?.role === "user" || h?.role === "assistant") && typeof h.text === "string" && h.text.trim()) messages.push({ role: h.role, content: h.text.slice(0, 2000) });
  }
  if (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: `Løberens tal fra appen (JSON):\n${ctxText}\n\nSpørgsmål: ${question}` });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1200,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    });
    if (response.stop_reason === "refusal") return json(res, 200, { text: "Det kan jeg ikke hjælpe med her. Spørg om din træning, kost eller restitution." });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return json(res, 200, { text: text || "Jeg fik ikke noget svar. Prøv at spørge igen.", model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(res, 503, { error: "API-nøglen til AI-træneren er ugyldig." });
    if (err instanceof Anthropic.RateLimitError) return json(res, 429, { error: "AI-træneren har travlt. Prøv igen om lidt." });
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: `AI-træneren svarede ikke (${err.status}).` });
    return json(res, 502, { error: "AI-træneren svarede ikke. Prøv igen om lidt." });
  }
}
