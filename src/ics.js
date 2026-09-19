/* The plan as a calendar file (.ics): one all-day event per run, strength session and the race, so the plan sits in
   the runner's own calendar next to work and family. Made on the device, nothing is uploaded. */
import { t } from "./i18n.js";

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = (line) => { const out = []; let s = line; while (s.length > 70) { out.push(s.slice(0, 70)); s = " " + s.slice(70); } out.push(s); return out.join("\r\n"); };
const dt = (ymd) => ymd.replace(/-/g, "");
const next = (ymd) => { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* planToICS({ rows, liftDays, liftName, race, dayFor }) -> string.
   rows: plan weeks ({ key, i, phase, days[], longDay, qDay, sun, quality, focus, isRace, deload }); dayFor(key, i) -> "YYYY-MM-DD". */
export function planToICS({ rows, liftDays = [], liftName = () => t("Styrke"), race = {}, dayFor }) {
  const ev = [];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const add = (day, summary, desc) => ev.push(["BEGIN:VEVENT", `UID:ultraplan-${day}-${ev.length}@ultraplan`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dt(day)}`, `DTEND;VALUE=DATE:${dt(next(day))}`, `SUMMARY:${esc(summary)}`, desc ? `DESCRIPTION:${esc(desc)}` : null, "TRANSP:TRANSPARENT", "END:VEVENT"].filter(Boolean).map(fold).join("\r\n"));
  for (const r of rows) {
    const week = t("Uge {i} af {n} · {phase}", { i: r.i, n: rows.length, phase: t(r.phase) }) + (r.deload ? ` · ${t("let uge")}` : "");
    for (let i = 0; i < 7; i++) {
      const day = dayFor(r.key, i); const v = r.days[i] || 0; const lift = liftDays.includes(i);
      if (r.isRace && i === r.longDay && v > 0) { add(day, `🏁 ${race.name || t("Løbet")} · ${race.km || v} km`, `${week}\n${t(r.focus || "")}`); continue; }
      if (v > 0) {
        const kind = i === r.longDay ? t("Lang tur") : i === r.qDay ? t("Hård session") : r.sun > 0 && i === (r.longDay + 1) % 7 ? t("Back-to-back") : t("Rolig tur");
        add(day, `${kind} ${v} km${i === r.qDay ? ` · ${t(r.quality)}` : ""}${lift ? ` + ${liftName(i)}` : ""}`, `${week}\n${t(r.focus || "")}`);
      } else if (lift && !r.isRace) add(day, liftName(i), week);
    }
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ultraplan//Plan//DA", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc("Ultraplan")}`, ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

export function downloadICS(text, name = "ultraplan.ics") {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
