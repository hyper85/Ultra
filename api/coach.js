import Anthropic from "@anthropic-ai/sdk";

/* AI coach – a Vercel serverless function. The browser posts the runner's numbers (no name, no e-mail) and a
   question; Claude answers as Ultraplan's coach. Without a key the app shows a friendly "not set up" message.

   Two providers, chosen by which key is set in Vercel → Settings → Environment Variables:
   - ANTHROPIC_API_KEY  → Anthropic directly (default model claude-opus-5).
   - OPENCODE_API_KEY   → OpenCode Zen (https://opencode.ai/zen), an AI gateway with an Anthropic-compatible
                          /v1/messages endpoint and pay-as-you-go billing (default model claude-sonnet-4-6).
   COACH_PROVIDER=anthropic|opencode forces one when both keys exist; COACH_MODEL overrides the model. */

export const config = { maxDuration: 60 };

const PROVIDERS = {
  anthropic: { key: "ANTHROPIC_API_KEY", model: "claude-opus-5", baseURL: undefined, beta: true },
  opencode: { key: "OPENCODE_API_KEY", model: "claude-sonnet-4-6", baseURL: "https://opencode.ai/zen", beta: false },
};
const pickProvider = () => {
  const forced = String(process.env.COACH_PROVIDER || "").toLowerCase();
  const name = PROVIDERS[forced] ? forced : process.env.OPENCODE_API_KEY ? "opencode" : "anthropic";
  const cfg = PROVIDERS[name];
  const apiKey = process.env[cfg.key];
  return apiKey ? { name, apiKey, model: process.env.COACH_MODEL || cfg.model, baseURL: cfg.baseURL, beta: cfg.beta } : null;
};
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
  const provider = pickProvider();
  if (!provider) return json(res, 503, { error: "AI-træneren er ikke sat op endnu. Sæt ANTHROPIC_API_KEY (Anthropic) eller OPENCODE_API_KEY (OpenCode Zen) i Vercel → Settings → Environment Variables og redeploy." });

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

  // OpenCode Zen reads the key from x-api-key like Anthropic; the Bearer header is sent too, as its docs use that form.
  const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseURL, maxRetries: 1, timeout: 55_000,
    ...(provider.name === "opencode" ? { defaultHeaders: { Authorization: `Bearer ${provider.apiKey}` } } : {}) });
  const request = { model: provider.model, max_tokens: 1200, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], messages };
  try {
    // Anthropic directly: server-side refusal fallbacks and an effort level. Through a gateway only the plain Messages API is assumed.
    const response = provider.beta
      ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } })
      : await client.messages.create(request);
    if (response.stop_reason === "refusal") return json(res, 200, { text: "Det kan jeg ikke hjælpe med her. Spørg om din træning, kost eller restitution." });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return json(res, 200, { text: text || "Jeg fik ikke noget svar. Prøv at spørge igen.", model: response.model, provider: provider.name });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(res, 503, { error: `API-nøglen til AI-træneren (${provider.name === "opencode" ? "OpenCode Zen" : "Anthropic"}) er ugyldig.` });
    if (err instanceof Anthropic.NotFoundError) return json(res, 502, { error: `Modellen "${provider.model}" findes ikke hos ${provider.name === "opencode" ? "OpenCode Zen" : "Anthropic"}. Sæt COACH_MODEL til en model, der findes.` });
    if (err instanceof Anthropic.RateLimitError) return json(res, 429, { error: "AI-træneren har travlt. Prøv igen om lidt." });
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: `AI-træneren svarede ikke (${err.status}).` });
    return json(res, 502, { error: "AI-træneren svarede ikke. Prøv igen om lidt." });
  }
}
