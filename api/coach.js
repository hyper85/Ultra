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
const chatCompletion = async (provider, messages, { extras = true, nudged = false } = {}) => {
  // Z.ai's own API accepts a `thinking` switch for GLM; gateways like OpenCode Zen reject unknown fields with 400,
  // so extras are only sent to Z.ai, and any 400 is retried once with the plain, minimal body.
  // Thinking models (GLM, Kimi …) reason before they answer; the budget must hold both, or the answer never comes.
  const body = { model: provider.model, max_tokens: 8000, messages: [{ role: "system", content: SYSTEM }, ...messages] };
  if (extras) { body.temperature = 0.4; if (provider.name === "zai" && /^glm/i.test(provider.model)) body.thinking = { type: "disabled" }; }
  const r = await fetch(provider.chatURL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });
  let data = null; try { data = await r.json(); } catch { /* not json */ }
  if (!r.ok) {
    if (r.status === 400 && extras) return chatCompletion(provider, messages, { extras: false });
    const e = new Error(data?.error?.message || data?.message || data?.error || `HTTP ${r.status}`); e.status = r.status; throw e;
  }
  const choice = data?.choices?.[0]; const msg = choice?.message;
  const asText = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text || "").join("") : "");
  let content = asText(msg?.content).trim();
  const reasoning = asText(msg?.reasoning_content || msg?.reasoning).trim();
  // Only reasoning, no answer: the model spent its budget thinking. Its thinking is English scratch work and must never
  // be shown as the reply. Ask once more, telling it to answer directly; then give up with a clear message.
  if (!content && reasoning) {
    if (!nudged) {
      const last = messages[messages.length - 1];
      const nudge = { ...last, content: `${asText(last.content) || last.content}\n\n(Svar direkte og kort på dansk til løberen. Ingen lange overvejelser først.)` };
      return chatCompletion(provider, [...messages.slice(0, -1), nudge], { extras, nudged: true });
    }
    const e = new Error("Modellen brugte hele sit budget på at tænke og skrev intet svar. Prøv igen med et kortere spørgsmål, eller vælg en anden model i COACH_MODEL."); e.status = 502; throw e;
  }
  return { text: content, model: data?.model || provider.model, finish: choice?.finish_reason || null };
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
- Ingen andre felter. Ingen markdown, ingen kodehegn, ingen forklaring før eller efter. Første tegn i svaret er { og sidste er }.`;
const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
// Find the first balanced {...} in a reply (models wrap JSON in fences or prose) and parse it leniently.
const extractJSON = (text) => {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  for (let i = t.indexOf("{"); i >= 0; i = t.indexOf("{", i + 1)) {
    let depth = 0, inStr = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (inStr) { if (ch === "\\") j++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) {
        const raw = t.slice(i, j + 1);
        try { return JSON.parse(raw); } catch { try { return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"')); } catch { break; } }
      } }
    }
  }
  return null;
};
const parseProposal = (text, ctx) => {
  const o = extractJSON(text);
  if (!o || typeof o !== "object") return null;
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
  const ok = (text, model, finish = null) => {
    if (mode === "plan") {
      const proposal = parseProposal(text, context);
      if (!proposal) {
        const why = finish === "length" ? "Svaret blev afbrudt, før JSON'en var færdig." : text ? `Modellen svarede: "${text.slice(0, 160)}${text.length > 160 ? "…" : ""}"` : "Modellen svarede tomt.";
        return json(res, 502, { error: `Træneren (${provider.label}, ${provider.model}) gav ikke et brugbart forslag. ${why} Prøv igen, eller sæt COACH_MODEL til en anden model.` });
      }
      return json(res, 200, { proposal, text: proposal.note, model, provider: provider.name });
    }
    return json(res, 200, { text: text || "Jeg fik ikke noget svar. Prøv at spørge igen.", model, provider: provider.name });
  };

  if (provider.format === "chat") {
    try { const { text, model, finish } = await chatCompletion(provider, messages); return ok(text, model, finish); }
    catch (err) {
      if (err.status === 401 || err.status === 403) return badKey();
      if (err.status === 404) return noModel();
      if (err.status === 429) return busy();
      const detail = /abort|timeout/i.test(err.name || "") ? "Den brugte for lang tid." : err.message && !/^HTTP \d+$/.test(err.message) ? `Svar fra ${provider.label}: ${String(err.message).slice(0, 200)}` : "";
      return json(res, 502, { error: `AI-træneren (${provider.label}, ${provider.model}) svarede ikke${err.status ? ` (${err.status})` : ""}. ${detail}`.trim() });
    }
  }

  // Anthropic Messages API: directly, or through a gateway's Anthropic-compatible endpoint. Gateways read the key from
  // x-api-key like Anthropic; the Bearer header is sent too, as their docs use that form.
  const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.anthropicURL, maxRetries: 1, timeout: 55_000,
    ...(provider.name !== "anthropic" ? { defaultHeaders: { Authorization: `Bearer ${provider.apiKey}` } } : {}) });
  const request = { model: provider.model, max_tokens: 2000, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], messages };
  try {
    // Anthropic directly: server-side refusal fallbacks and an effort level. Through a gateway only the plain Messages API is assumed.
    const response = provider.beta
      ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } })
      : await client.messages.create(request);
    if (response.stop_reason === "refusal") return ok("Det kan jeg ikke hjælpe med her. Spørg om din træning, kost eller restitution.", response.model);
    return ok(response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(), response.model, response.stop_reason === "max_tokens" ? "length" : null);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return badKey();
    if (err instanceof Anthropic.NotFoundError) return noModel();
    if (err instanceof Anthropic.RateLimitError) return busy();
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: `AI-træneren (${provider.label}) svarede ikke (${err.status}).` });
    return json(res, 502, { error: "AI-træneren svarede ikke. Prøv igen om lidt." });
  }
}
