/* Share the week as a picture. Drawn on a canvas in the app's colours (1080 × 1350, Instagram portrait), then handed
   to the phone's share sheet when it can take a file, otherwise saved as a PNG. No server, nothing leaves the device
   unless the runner sends it. */

const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const C = { bg: "#0b0b0b", panel: "#161616", panel2: "#1f1f1f", line: "#2a2a2a", text: "#f2f2f2", muted: "#9a9a9a", orange: "#fc4c02", volt: "#d8ff3a", green: "#38b060", amber: "#e0a800", red: "#e5484d" };

const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const wrap = (g, text, x, y, maxW, lh) => { const words = String(text).split(" "); let line = ""; for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; } if (line) g.fillText(line, x, y); return y + lh; };

/* weekImage({ week, days, ran, plan, phase, streak, acwr, other, race, daysToRace, quote, name }) -> Promise<Blob> */
export async function weekImage(d) {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  try { await document.fonts?.load?.('800 80px "Barlow Condensed"'); await document.fonts?.load?.('600 40px Inter'); } catch { /* system fonts then */ }
  const disp = (w, s) => `${w} ${s}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
  const body = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  // header
  g.fillStyle = C.text; g.font = disp(800, 64); g.textBaseline = "top"; g.fillText("ULTRAPLAN", 72, 64);
  g.fillStyle = C.muted; g.font = body(500, 30); g.fillText(`Uge ${d.week.i} af ${d.week.n} · ${d.phase}${d.week.deload ? " · let uge" : ""}`, 72, 140);
  // big number
  g.fillStyle = C.volt; g.font = disp(800, 220); g.fillText(String(d.ran), 72, 190);
  const wNum = g.measureText(String(d.ran)).width;
  g.fillStyle = C.muted; g.font = disp(700, 64); g.fillText(`/ ${d.plan} km`, 72 + wNum + 24, 330);
  g.fillStyle = C.text; g.font = body(600, 34); g.fillText(d.plan ? `${Math.round((d.ran / d.plan) * 100)} % af planen` : "Uge uden plan", 72, 430);
  // day tiles
  const tw = (W - 144 - 6 * 14) / 7, ty = 510;
  d.days.forEach((day, i) => {
    const x = 72 + i * (tw + 14);
    roundRect(g, x, ty, tw, 150, 18); g.fillStyle = day.km > 0 || day.other ? C.panel2 : C.panel; g.fill();
    if (day.km > 0 || day.other) { g.strokeStyle = day.km >= (day.plan || 0) * 0.9 ? C.green : C.orange; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = C.muted; g.font = body(600, 24); g.textAlign = "center"; g.fillText(DAYS[i], x + tw / 2, ty + 18);
    g.fillStyle = C.text; g.font = disp(700, 52); g.fillText(day.km > 0 ? String(day.km) : day.other ? "✓" : day.plan ? String(day.plan) : "–", x + tw / 2, ty + 56);
    g.fillStyle = C.muted; g.font = body(500, 20); g.fillText(day.km > 0 ? "km" : day.other ? day.other : day.plan ? "plan" : day.lift ? "styrke" : "hvile", x + tw / 2, ty + 116);
    g.textAlign = "left";
  });
  // stats row
  const stats = [["Streak", d.streak > 0 ? `${d.streak} uger` : "–"], ["ACWR", d.acwr != null ? d.acwr.toFixed(2) : "–"], ["Andre pas", d.other ? `${d.other}` : "0"], ["Til løbet", d.daysToRace != null ? `${d.daysToRace} dage` : "–"]];
  const sw = (W - 144 - 3 * 14) / 4, sy = 700;
  stats.forEach(([label, val], i) => {
    const x = 72 + i * (sw + 14);
    roundRect(g, x, sy, sw, 130, 18); g.fillStyle = C.panel; g.fill();
    g.fillStyle = C.muted; g.font = body(500, 24); g.fillText(label, x + 22, sy + 20);
    g.fillStyle = label === "ACWR" && d.acwr != null ? (d.acwr > 1.5 ? C.red : d.acwr > 1.3 ? C.amber : d.acwr >= 0.8 ? C.green : C.text) : C.text;
    g.font = disp(700, 52); g.fillText(val, x + 22, sy + 56);
  });
  // race + quote
  roundRect(g, 72, 870, W - 144, 200, 22); g.fillStyle = C.panel; g.fill();
  g.fillStyle = C.muted; g.font = body(500, 26); g.fillText("Mod", 104, 900);
  g.fillStyle = C.text; g.font = disp(700, 56); g.fillText(d.race || "løbet", 104, 934);
  if (d.raceMeta) { g.fillStyle = C.muted; g.font = body(500, 28); g.fillText(d.raceMeta, 104, 1010); }
  g.fillStyle = C.muted; g.font = `italic ${body(500, 30)}`; wrap(g, `“${d.quote}”`, 72, 1120, W - 144, 42);
  g.fillStyle = C.orange; g.font = body(600, 26); g.fillText("ultra-lime-nu.vercel.app", 72, H - 90);
  return new Promise((ok) => cv.toBlob((b) => ok(b), "image/png"));
}

/* shareWeek(data) -> "shared" | "saved" | "copied". Uses the share sheet when it accepts files, else a download. */
export async function shareWeek(data) {
  const blob = await weekImage(data);
  const file = new File([blob], `ultraplan-uge-${data.week.i}.png`, { type: "image/png" });
  const text = `Uge ${data.week.i} af ${data.week.n}: ${data.ran} af ${data.plan} km${data.streak > 1 ? ` · ${data.streak} uger i træk` : ""}. Mod ${data.race || "løbet"}${data.daysToRace != null ? ` om ${data.daysToRace} dage` : ""}.`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Ultraplan", text }); return "shared"; } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
