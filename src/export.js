/* CSV export of the log (one row per week) and the activities (one row per session), for a spreadsheet or a coach.
   Semicolon-separated with a UTF-8 BOM so Excel in Danish opens it as columns. Made on the device, nothing is uploaded. */
const cell = (v) => (v == null || v === "" ? "" : /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const lines = (head, rows) => "﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";

export const logToCSV = (log) => lines(["uge_start", "km", "rpe", "hvilepuls", "soevn_t", "vaegt_kg", "hoejdemeter", "andre_pas_min", "vo2max", "hrv", "km_fra_uret"],
  Object.keys(log).sort().map((k) => { const l = log[k] || {}; return [k, l.km, l.rpe, l.hr, l.sleep, l.wt, l.vert, l.xmin, l.vo2, l.hrv, l.auto ? "ja" : ""]; }));

export const actsToCSV = (acts) => lines(["dato", "type", "navn", "km", "min", "puls", "rpe", "hoejdemeter", "stigning_pct", "kilde"],
  Object.values(acts).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)).map((a) => [a.day, a.type, a.name, a.km, a.min, a.hr, a.rpe, a.vert, a.incline, a.source]));

export function downloadText(text, name, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
