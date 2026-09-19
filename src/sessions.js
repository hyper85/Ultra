/* How to run each session. The plan names a session ("6×2 min tærskel", "Bakker 8×90 s", "Løbstempo 2×15 min");
   this turns the name into a short, concrete instruction with the runner's own heart-rate numbers. Pure and
   deterministic, like the rest of the engine. The session names are Danish (that is what the plan stores); the
   matching stays Danish and every returned string goes through t(). */
import { t, getLang } from "./i18n.js";

const fmtHR = (maxHR, lo, hi) => (maxHR ? ` (${Math.round(maxHR * lo)}–${Math.round(maxHR * hi)})` : "");
const reps = (q) => { const m = String(q).match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(min|s)/i); return m ? { n: +m[1], d: +m[2].replace(",", "."), unit: m[3].toLowerCase() } : null; };
const dur = (r) => (r ? `${r.d} ${r.unit === "s" ? "s" : "min"}` : "");
const restFor = (r) => (!r ? "" : r.unit === "s" ? t("60–90 s gang") : r.d <= 2 ? t("1 min rolig jog") : r.d <= 5 ? t("2 min rolig jog") : t("3 min rolig jog"));

// The words a session name is built from, longest first so "Rolig tempo" is not split into "Rolig" + "tempo".
const NAME_WORDS = ["gå/løb", "min løb", "min gang", "kun hvis smertefri", "kun roligt", "rolig tempo", "løbstempo", "stigninger", "tærskel", "på bakker", "bakker", "åbnere", "rolig"];
const NAME_RE = new RegExp(NAME_WORDS.map((w) => w.replace(/[/]/g, "\\/")).join("|"), "gi");
/* sessionName("8×2 min tærskel") -> "8×2 min threshold" in English, unchanged in Danish. */
export const sessionName = (q) => {
  const s = String(q || "");
  if (getLang() === "da") return s;
  return s.replace(NAME_RE, (m) => { const w = t(m.toLowerCase()); return m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w; });
};

export function describeSession(quality, { maxHR, easyPace } = {}) {
  const q = String(quality || "").trim(); const ql = q.toLowerCase(); const r = reps(q);
  const cap = maxHR ? Math.round(maxHR * 0.7) : null;
  const easy = t("Rolige ture under {cap} i puls{pace}.", { cap: cap ?? t("70 % af makspuls"), pace: easyPace ? t(" – dit rolige tempo ligger typisk omkring {pace}/km", { pace: easyPace }) : "" });
  if (!q || /kun roligt/.test(ql)) return { kind: "easy", zone: "Z2", text: t("Ingen hård session i denne uge. {easy}", { easy }) };
  if (/gå\/løb/.test(ql)) {
    const m = q.match(/(\d+)\s*×\s*\((\d+)\s*min løb\s*\/\s*(\d+)\s*min gang\)/i);
    const spec = m ? t("{n} × ({run} min løb / {walk} min gang)", { n: m[1], run: m[2], walk: m[3] }) : sessionName(q);
    return { kind: "walkrun", zone: "Z1–Z2", text: t("Gå/løb: {spec}. Løb i snakketempo, og gangen er en del af passet, ikke en pause. Blødt underlag. Gør det ondt på en måde, der ændrer dit skridt, så stop.", { spec }) };
  }
  if (/rolig tempo/.test(ql)) return { kind: "steady", zone: "Z2–Z3", text: t("{q}: jævn, rolig fart, hvor du kan sige hele sætninger, puls under 80 %{hr}. Ingen bakker, ingen spurter. 10 min rolig før og efter.", { q: sessionName(q), hr: fmtHR(maxHR, 0.7, 0.8) }) };
  if (/^rolig \d+ min/.test(ql)) return { kind: "easy", zone: "Z2", text: t("{q}. Puls under {cap}. Stigninger til sidst er 15 s glidende fart, ikke sprint. Stop ved smerte, der ændrer skridtet.", { q: sessionName(q), cap: cap ?? "70 %" }) };
  if (/tærskel/.test(ql)) {
    const hills = /bakke/.test(ql);
    const set = r ? t("{n} × {dur} med {rest} imellem.", { n: r.n, dur: dur(r), rest: restFor(r) }) : sessionName(q) + ".";
    return { kind: "threshold", zone: "Z4 · 80–90 %", text: t(`Tærskel er den fart, du kan holde i cirka en time: puls 80–90 % af maks{hr}, "behageligt hårdt", du kan sige korte sætninger. {set}{hills} 15 min rolig opvarmning, 10 min nedjog. Første interval skal føles for let.`, { hr: fmtHR(maxHR, 0.8, 0.9), set, hills: hills ? t(" Løb dem op ad en jævn stigning: korte skridt, kraft fra hoften, jog ned som pause.") : "" }) };
  }
  if (/løbstempo/.test(ql)) return { kind: "racepace", zone: "Z2–Z3 · 70–78 %", text: t("Løbstempo er den fart, du kan holde hele løbet: puls 70–78 %{hr}, gå stigningerne som på løbsdagen. {set}, helst på trail i de sko, du skal løbe i. Øv at spise og drikke undervejs.", { hr: fmtHR(maxHR, 0.7, 0.78), set: r ? t("{n} × {dur} med 5 min rolig imellem", { n: r.n, dur: dur(r) }) : sessionName(q) }) };
  if (/åbnere/.test(ql)) return { kind: "openers", zone: "Z3–Z4", text: t("Åbnere vækker benene uden at trætte dem: {set} lidt hurtigere end løbstempo, 2 min rolig jog imellem. Kort opvarmning, resten af turen helt rolig.", { set: r ? `${r.n} × ${dur(r)}` : sessionName(q) }) };
  if (/^stigninger\s*\+/.test(ql)) {
    const after = q.match(/\+\s*(.+)$/)?.[1] || "tempo";
    return { kind: "strides-tempo", zone: "Z3–Z4", text: t("Start med 4–6 stigninger à 20 s (glidende fart op til cirka 90 % af sprint, gang tilbage). Derefter {after}: jævn fart lige under tærskel, puls 75–85 %{hr}. 10 min nedjog.", { after: sessionName(after), hr: fmtHR(maxHR, 0.75, 0.85) }) };
  }
  if (/stigninger/.test(ql)) return { kind: "strides", zone: t("teknik"), text: t("Stigninger er {set}, hvor du øger farten glidende til cirka 90 % af sprint og holder den let og høj i kadence, med 60–90 s gang imellem. Pulsen når ikke at komme op – det træner frekvens og teknik. Læg dem sidst i en rolig tur.", { set: r ? `${r.n} × ${dur(r)}` : "20 s" }) };
  if (/bakker/.test(ql)) return { kind: "hills", zone: "Z4–Z5", text: t("Find en bakke på 5–8 %. {set} op i hård, kontrolleret fart, så pulsen ender omkring 90 %{hr}. Jog eller gå ned som pause. Korte skridt, høj kadence, kig 10 m frem. 15 min opvarmning, 10 min nedjog.", { set: r ? `${r.n} × ${dur(r)}` : sessionName(q), hr: fmtHR(maxHR, 0.88, 0.92) }) };
  if (/tempo/.test(ql)) return { kind: "tempo", zone: "Z3–Z4 · 75–85 %", text: t("Tempo er jævn fart lige under tærskel: puls 75–85 %{hr}, du kan sige en sætning, ikke to. {set}. 15 min opvarmning, 10 min nedjog. Den typiske fejl er at starte for hurtigt.", { hr: fmtHR(maxHR, 0.75, 0.85), set: r ? t("{n} × {dur} med 3 min rolig jog imellem", { n: r.n, dur: dur(r) }) : t("{q} i ét stræk", { q: sessionName(q) }) }) };
  return { kind: "hard", zone: "Z4", text: t("{q}. 15 min rolig opvarmning, selve passet i puls 80–90 %{hr}, 10 min nedjog.", { q: sessionName(q), hr: fmtHR(maxHR, 0.8, 0.9) }) };
}

// Guidance for the two other kinds of days the plan has.
export const describeLong = ({ km, carbs, maxHR, phase }) => t("Lang tur på {km} km: puls under {hr} det meste af vejen, gå stigningerne, {carbs} g kulhydrat i timen fra minut 30.{kit}", { km, hr: maxHR ? Math.round(maxHR * 0.75) : "75 %", carbs, kit: phase === "Ultra-prep" ? t(" Test kit, lygte og mad som på løbsdagen.") : "" });
export const describeEasy = ({ km, maxHR, easyPace }) => t("{km} km i snakketempo, puls under {hr}{pace}. Det føles for langsomt. Det er meningen.", { km, hr: maxHR ? Math.round(maxHR * 0.7) : "70 %", pace: easyPace ? t(" – for dig typisk omkring {pace}/km", { pace: easyPace }) : "" });
export const fmtPace = (minKm) => { if (!(minKm > 0)) return null; const m = Math.floor(minKm), s = Math.round((minKm - m) * 60); return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}`; };
