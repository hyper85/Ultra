/* How to run each session. The plan names a session ("6×2 min tærskel", "Bakker 8×90 s", "Løbstempo 2×15 min");
   this turns the name into a short, concrete instruction with the runner's own heart-rate numbers. Pure and
   deterministic, like the rest of the engine. */

const fmtHR = (maxHR, lo, hi) => (maxHR ? ` (${Math.round(maxHR * lo)}–${Math.round(maxHR * hi)})` : "");
const reps = (q) => { const m = String(q).match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(min|s)/i); return m ? { n: +m[1], d: +m[2].replace(",", "."), unit: m[3].toLowerCase() } : null; };
const dur = (r) => (r ? `${r.d} ${r.unit === "s" ? "s" : "min"}` : "");
const restFor = (r) => (!r ? "" : r.unit === "s" ? "60–90 s gang" : r.d <= 2 ? "1 min rolig jog" : r.d <= 5 ? "2 min rolig jog" : "3 min rolig jog");

export function describeSession(quality, { maxHR, easyPace } = {}) {
  const q = String(quality || "").trim(); const ql = q.toLowerCase(); const r = reps(q);
  const cap = maxHR ? Math.round(maxHR * 0.7) : null;
  const easy = `Rolige ture under ${cap ?? "70 % af makspuls"} i puls${easyPace ? ` – dit rolige tempo ligger typisk omkring ${easyPace}/km` : ""}.`;
  if (!q || /kun roligt/.test(ql)) return { kind: "easy", zone: "Z2", text: `Ingen hård session i denne uge. ${easy}` };
  if (/gå\/løb/.test(ql)) {
    const m = q.match(/(\d+)\s*×\s*\((\d+)\s*min løb\s*\/\s*(\d+)\s*min gang\)/i);
    return { kind: "walkrun", zone: "Z1–Z2", text: `Gå/løb: ${m ? `${m[1]} × (${m[2]} min løb / ${m[3]} min gang)` : q}. Løb i snakketempo, og gangen er en del af passet, ikke en pause. Blødt underlag. Gør det ondt på en måde, der ændrer dit skridt, så stop.` };
  }
  if (/rolig tempo/.test(ql)) return { kind: "steady", zone: "Z2–Z3", text: `${q}: jævn, rolig fart, hvor du kan sige hele sætninger, puls under 80 %${fmtHR(maxHR, 0.7, 0.8)}. Ingen bakker, ingen spurter. 10 min rolig før og efter.` };
  if (/^rolig \d+ min/.test(ql)) return { kind: "easy", zone: "Z2", text: `${q}. Puls under ${cap ?? "70 %"}. Stigninger til sidst er 15 s glidende fart, ikke sprint. Stop ved smerte, der ændrer skridtet.` };
  if (/tærskel/.test(ql)) {
    const hills = /bakke/.test(ql);
    return { kind: "threshold", zone: "Z4 · 80–90 %", text: `Tærskel er den fart, du kan holde i cirka en time: puls 80–90 % af maks${fmtHR(maxHR, 0.8, 0.9)}, "behageligt hårdt", du kan sige korte sætninger. ${r ? `${r.n} × ${dur(r)} med ${restFor(r)} imellem.` : q + "."}${hills ? " Løb dem op ad en jævn stigning: korte skridt, kraft fra hoften, jog ned som pause." : ""} 15 min rolig opvarmning, 10 min nedjog. Første interval skal føles for let.` };
  }
  if (/løbstempo/.test(ql)) return { kind: "racepace", zone: "Z2–Z3 · 70–78 %", text: `Løbstempo er den fart, du kan holde hele løbet: puls 70–78 %${fmtHR(maxHR, 0.7, 0.78)}, gå stigningerne som på løbsdagen. ${r ? `${r.n} × ${dur(r)} med 5 min rolig imellem` : q}, helst på trail i de sko, du skal løbe i. Øv at spise og drikke undervejs.` };
  if (/åbnere/.test(ql)) return { kind: "openers", zone: "Z3–Z4", text: `Åbnere vækker benene uden at trætte dem: ${r ? `${r.n} × ${dur(r)}` : q} lidt hurtigere end løbstempo, 2 min rolig jog imellem. Kort opvarmning, resten af turen helt rolig.` };
  if (/^stigninger\s*\+/.test(ql)) {
    const t = q.match(/\+\s*(.+)$/)?.[1] || "tempo";
    return { kind: "strides-tempo", zone: "Z3–Z4", text: `Start med 4–6 stigninger à 20 s (glidende fart op til cirka 90 % af sprint, gang tilbage). Derefter ${t}: jævn fart lige under tærskel, puls 75–85 %${fmtHR(maxHR, 0.75, 0.85)}. 10 min nedjog.` };
  }
  if (/stigninger/.test(ql)) return { kind: "strides", zone: "teknik", text: `Stigninger er ${r ? `${r.n} × ${dur(r)}` : "20 s"}, hvor du øger farten glidende til cirka 90 % af sprint og holder den let og høj i kadence, med 60–90 s gang imellem. Pulsen når ikke at komme op – det træner frekvens og teknik. Læg dem sidst i en rolig tur.` };
  if (/bakker/.test(ql)) return { kind: "hills", zone: "Z4–Z5", text: `Find en bakke på 5–8 %. ${r ? `${r.n} × ${dur(r)}` : q} op i hård, kontrolleret fart, så pulsen ender omkring 90 %${fmtHR(maxHR, 0.88, 0.92)}. Jog eller gå ned som pause. Korte skridt, høj kadence, kig 10 m frem. 15 min opvarmning, 10 min nedjog.` };
  if (/tempo/.test(ql)) return { kind: "tempo", zone: "Z3–Z4 · 75–85 %", text: `Tempo er jævn fart lige under tærskel: puls 75–85 %${fmtHR(maxHR, 0.75, 0.85)}, du kan sige en sætning, ikke to. ${r ? `${r.n} × ${dur(r)} med 3 min rolig jog imellem` : q + " i ét stræk"}. 15 min opvarmning, 10 min nedjog. Den typiske fejl er at starte for hurtigt.` };
  return { kind: "hard", zone: "Z4", text: `${q}. 15 min rolig opvarmning, selve passet i puls 80–90 %${fmtHR(maxHR, 0.8, 0.9)}, 10 min nedjog.` };
}

// Guidance for the two other kinds of days the plan has.
export const describeLong = ({ km, carbs, maxHR, phase }) => `Lang tur på ${km} km: puls under ${maxHR ? Math.round(maxHR * 0.75) : "75 %"} det meste af vejen, gå stigningerne, ${carbs} g kulhydrat i timen fra minut 30.${phase === "Ultra-prep" ? " Test kit, lygte og mad som på løbsdagen." : ""}`;
export const describeEasy = ({ km, maxHR, easyPace }) => `${km} km i snakketempo, puls under ${maxHR ? Math.round(maxHR * 0.7) : "70 %"}${easyPace ? ` – for dig typisk omkring ${easyPace}/km` : ""}. Det føles for langsomt. Det er meningen.`;
export const fmtPace = (minKm) => { if (!(minKm > 0)) return null; const m = Math.floor(minKm), s = Math.round((minKm - m) * 60); return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}`; };
