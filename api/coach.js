import Anthropic from "@anthropic-ai/sdk";

/* AI coach – a Vercel serverless function. The browser posts the runner's numbers (no name, no e-mail) and a
   question; Claude answers as Ultraplan's coach. Without a key the app shows a friendly "not set up" message.

   Providers, chosen by which key is set in Vercel → Settings → Environment Variables:
   - ANTHROPIC_API_KEY  → Anthropic directly (default model claude-opus-5).
   - OPENCODE_API_KEY   → OpenCode Zen (https://opencode.ai/zen), an AI gateway with pay-as-you-go billing. Claude
                          models go through its Anthropic-compatible /v1/messages, everything else (GLM, Kimi,
                          MiniMax, Qwen …) through its OpenAI-compatible /v1/chat/completions. Default glm-5.3-flash.
   - ZAI_API_KEY        → Z.ai directly (https://api.z.ai/api/paas/v4, OpenAI-compatible). Default glm-5.3-flash.
   COACH_PROVIDER=anthropic|opencode|zai forces one when several keys exist; COACH_MODEL overrides the model.
   The wire format follows the model: ids starting with "claude" use the Messages API, all others chat completions. */

export const config = { maxDuration: 60 };

const PROVIDERS = {
  anthropic: { key: "ANTHROPIC_API_KEY", label: "Anthropic", model: "claude-opus-5", anthropicURL: undefined, chatURL: null, beta: true },
  opencode: { key: "OPENCODE_API_KEY", label: "OpenCode Zen", model: "glm-5.3-flash", anthropicURL: "https://opencode.ai/zen", chatURL: "https://opencode.ai/zen/v1/chat/completions", beta: false },
  zai: { key: "ZAI_API_KEY", label: "Z.ai", model: "glm-5.3-flash", anthropicURL: "https://api.z.ai/api/anthropic", chatURL: "https://api.z.ai/api/paas/v4/chat/completions", beta: false },
};
const pickProvider = () => {
  const forced = String(process.env.COACH_PROVIDER || "").toLowerCase();
  const name = PROVIDERS[forced] ? forced : ["opencode", "zai", "anthropic"].find((n) => process.env[PROVIDERS[n].key]) || "anthropic";
  const cfg = PROVIDERS[name];
  const apiKey = process.env[cfg.key];
  if (!apiKey) return null;
  const model = process.env.COACH_MODEL || cfg.model;
  const format = /^claude/i.test(model) || !cfg.chatURL ? "anthropic" : "chat";
  return { name, label: cfg.label, apiKey, model, format, anthropicURL: cfg.anthropicURL, chatURL: cfg.chatURL, beta: cfg.beta };
};

// OpenAI-compatible chat completions (GLM, Kimi, MiniMax, Qwen … on OpenCode Zen and Z.ai). Plain fetch: no extra SDK.
const chatCompletion = async (provider, messages) => {
  const r = await fetch(provider.chatURL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: provider.model, max_tokens: 1200, temperature: 0.4, messages: [{ role: "system", content: SYSTEM }, ...messages] }),
    signal: AbortSignal.timeout(55_000),
  });
  let data = null; try { data = await r.json(); } catch { /* not json */ }
  if (!r.ok) { const e = new Error(data?.error?.message || data?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
  const msg = data?.choices?.[0]?.message;
  const content = typeof msg?.content === "string" ? msg.content : Array.isArray(msg?.content) ? msg.content.map((c) => c?.text || "").join("") : "";
  return { text: content.trim(), model: data?.model || provider.model };
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

/* Plan mode: the coach proposes parameters for the deterministic plan engine. The engine builds the plan and the
   runner applies it with one tap – the model never writes the plan itself. */
const PLAN_PROMPT = `Opgave: Foreslå parametre til løberens plan ud fra tallene, især "fra_uret_12_uger" (Garmin/Strava) og "seneste_uger".
Svar KUN med ét JSON-objekt, ingen tekst udenom, på denne form:
{"peakScale": 1.0, "level": 2, "maxRunDays": 4, "longDay": 5, "currentKm": 35, "note": "2–4 sætninger på dansk om hvorfor"}
Regler:
- peakScale skalerer planens top (0.6–1.4). 1.0 = appens standard (ca. 0,95 × løbets km, aldrig under 1,2 × nuværende volumen, loft efter niveau). Sænk den, hvis uret viser lav eller ustabil volumen, skader eller høj puls på rolige ture; hæv kun ved stabil høj volumen og grøn ACWR.
- level: 1 begynder (< 1 år), 2 motionist, 3 erfaren (maraton/ultra), 4 konkurrence. Bedøm ud fra volumen, længste ture og stabilitet – ikke ud fra ønsker.
- maxRunDays: det antal dage løberen faktisk løber ifølge uret (2–7), ikke flere.
- longDay: den ugedag (0 = mandag … 6 = søndag) hvor de længste ture faktisk ligger, hvis hverdagen tillader det.
- currentKm: gennemsnit af de sidste 4 uger fra uret, afrundet. Mangler urdata, så behold det nuværende tal.
- Ingen andre felter. Ingen markdown.`;
const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const parseProposal = (text, ctx) => {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch { return null; }
  const cur = ctx?.plan || {};
  return {
    peakScale: Math.round(clampNum(o.peakScale, 0.6, 1.4, cur.top_skala ?? 1) * 20) / 20,
    level: Math.round(clampNum(o.level, 1, 4, cur.niveau ?? 2)),
    maxRunDays: Math.round(clampNum(o.maxRunDays, 2, 7, cur.løbedage ?? 4)),
    longDay: Math.round(clampNum(o.longDay, 0, 6, cur.lang_tur_dag ?? 5)),
    currentKm: Math.round(clampNum(o.currentKm, 0, 300, cur.nuværende_base_km_uge ?? 0)),
    note: String(o.note || "").slice(0, 600),
  };
};

const json = (res, status, body) => { res.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Brug POST." });
  const provider = pickProvider();
  if (!provider) return json(res, 503, { error: "AI-træneren er ikke sat op endnu. Sæt OPENCODE_API_KEY (OpenCode Zen), ZAI_API_KEY (Z.ai) eller ANTHROPIC_API_KEY (Anthropic) i Vercel → Settings → Environment Variables og redeploy." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return json(res, 400, { error: "Ugyldig JSON." }); } }
  const mode = body?.mode === "plan" ? "plan" : "chat";
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
  if (mode === "plan") messages.length = 0; // a proposal is a fresh, single turn
  messages.push({ role: "user", content: mode === "plan" ? `Løberens tal fra appen (JSON):\n${ctxText}\n\n${PLAN_PROMPT}` : `Løberens tal fra appen (JSON):\n${ctxText}\n\nSpørgsmål: ${question}` });

  const badKey = () => json(res, 503, { error: `API-nøglen til AI-træneren (${provider.label}) er ugyldig.` });
  const noModel = () => json(res, 502, { error: `Modellen "${provider.model}" findes ikke hos ${provider.label}. Sæt COACH_MODEL til en model, der findes.` });
  const busy = () => json(res, 429, { error: "AI-træneren har travlt. Prøv igen om lidt." });
  const ok = (text, model) => {
    if (mode === "plan") {
      const proposal = parseProposal(text, context);
      if (!proposal) return json(res, 502, { error: "Træneren gav ikke et brugbart forslag. Prøv igen." });
      return json(res, 200, { proposal, text: proposal.note, model, provider: provider.name });
    }
    return json(res, 200, { text: text || "Jeg fik ikke noget svar. Prøv at spørge igen.", model, provider: provider.name });
  };

  if (provider.format === "chat") {
    try { const { text, model } = await chatCompletion(provider, messages); return ok(text, model); }
    catch (err) {
      if (err.status === 401 || err.status === 403) return badKey();
      if (err.status === 404) return noModel();
      if (err.status === 429) return busy();
      return json(res, 502, { error: `AI-træneren (${provider.label}) svarede ikke${err.status ? ` (${err.status})` : ""}. ${/abort|timeout/i.test(err.name || "") ? "Den brugte for lang tid." : ""}`.trim() });
    }
  }

  // Anthropic Messages API: directly, or through a gateway's Anthropic-compatible endpoint. Gateways read the key from
  // x-api-key like Anthropic; the Bearer header is sent too, as their docs use that form.
  const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.anthropicURL, maxRetries: 1, timeout: 55_000,
    ...(provider.name !== "anthropic" ? { defaultHeaders: { Authorization: `Bearer ${provider.apiKey}` } } : {}) });
  const request = { model: provider.model, max_tokens: 1200, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], messages };
  try {
    // Anthropic directly: server-side refusal fallbacks and an effort level. Through a gateway only the plain Messages API is assumed.
    const response = provider.beta
      ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } })
      : await client.messages.create(request);
    if (response.stop_reason === "refusal") return ok("Det kan jeg ikke hjælpe med her. Spørg om din træning, kost eller restitution.", response.model);
    return ok(response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(), response.model);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return badKey();
    if (err instanceof Anthropic.NotFoundError) return noModel();
    if (err instanceof Anthropic.RateLimitError) return busy();
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: `AI-træneren (${provider.label}) svarede ikke (${err.status}).` });
    return json(res, 502, { error: "AI-træneren svarede ikke. Prøv igen om lidt." });
  }
}
