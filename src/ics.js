/* The plan as a calendar file (.ics): one all-day event per run, strength session, event and the race, so the plan sits in
   the runner's own calendar next to work and family. Made on the device, nothing is uploaded. */
import { t } from "./i18n.js";

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = (line) => { const out = []; let s = line; while (s.length > 70) { out.push(s.slice(0, 70)); s = " " + s.slice(70); } out.push(s); return out.join("\r\n"); };
const dt = (ymd) => ymd.replace(/-/g, "");
const next = (ymd) => { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const hours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };

/* planToICS({ rows, liftDays, liftName, race, dayFor }) -> string.
   rows: plan weeks ({ key, i, phase, days[], longDay, qDay, sun, quality, focus, isRace, deload, events, recovery,
   adjusted }); the week in progress is passed as the app shows it, so a week the coach advice has cut is exported cut.
   dayFor(key, i) -> "YYYY-MM-DD".
   One event per day with a fixed UID (the date), and SEQUENCE/LAST-MODIFIED from the export time, so importing a new
   file updates the days already in the calendar instead of adding them twice. A day the coach advice has turned into
   rest is exported as rest, so the old run does not linger. Days are "busy" (TRANSP:OPAQUE + the Outlook flag): Outlook mobile
   draws a free all-day event as a thin bar without its title, so the plan is only readable as busy. */
export function planToICS({ rows, liftDays = [], liftName = () => t("Styrke"), race = {}, dayFor }) {
  const ev = [];
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const seq = Math.floor(now.getTime() / 60000); // minutes since 1970: a later export always has a higher sequence
  const add = (day, summary, desc) => ev.push(["BEGIN:VEVENT", `UID:ultraplan-${dt(day)}@ultraplan`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`, `DTSTART;VALUE=DATE:${dt(day)}`, `DTEND;VALUE=DATE:${dt(next(day))}`, `SUMMARY:${esc(summary)}`, desc ? `DESCRIPTION:${esc(desc)}` : null, "TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:BUSY", "END:VEVENT"].filter(Boolean).map(fold).join("\r\n"));
  for (const r of rows) {
    const week = t("Uge {i} af {n} · {phase}", { i: r.i, n: rows.length, phase: t(r.phase) }) + (r.recovery ? ` · ${t("restitution")}` : r.deload ? ` · ${t("let uge")}` : "");
    const notes = [
      r.adjusted ? t("Justeret af trænerråd ({reason}).", { reason: r.adjusted.reason }) : null,
      r.recovery ? t("Restitution efter {name}", { name: r.recovery.after }) : null,
      r.focus ? t(r.focus) : null,
    ].filter(Boolean).join("\n");
    const desc = (extra) => [week, extra, notes].filter(Boolean).join("\n");
    for (let i = 0; i < 7; i++) {
      const day = dayFor(r.key, i); const v = r.days[i] || 0; const lift = liftDays.includes(i) && !r.isRace;
      const was = r.adjusted && r.adjusted.original[i] !== v ? r.adjusted.original[i] || 0 : null;
      const orig = was != null ? `${t("Original:")} ${was ? `${was} km` : t("hvile")}` : null;
      const e = r.events?.[i];
      if (e) {
        const meta = [e.kind === "walk" ? t("Gang") : t("Løb"), e.start ? t("start {time}", { time: e.start }) : null, e.hours ? `${e.hoursEst ? "~" : ""}${t("{h} timer", { h: hours(e.hours) })}` : null].filter(Boolean).join(" · ");
        add(day, `★ ${e.name}${e.km ? ` · ${e.km} km` : ""}`, desc([meta, e.result ? `✓ ${t("Gennemført")}: ${[e.result.km ? `${e.result.km} km` : null, e.result.total || null, e.result.ascent ? `${e.result.ascent} m+` : null].filter(Boolean).join(" · ")}` : null, e.note || t("Eventet erstatter planens dag.")].filter(Boolean).join("\n")));
        continue;
      }
      if (r.isRace && i === r.longDay && v > 0) { add(day, `🏁 ${race.name || t("Løbet")} · ${race.km || v} km`, desc()); continue; }
      if (v > 0) {
        const kind = i === r.longDay ? t("Lang tur") : i === r.qDay ? t("Hård session") : r.sun > 0 && i === (r.longDay + 1) % 7 ? t("Back-to-back") : t("Rolig tur");
        add(day, `${kind} ${v} km${i === r.qDay ? ` · ${t(r.quality)}` : ""}${lift ? ` + ${liftName(i)}` : ""}`, desc(orig));
      } else if (lift) add(day, liftName(i), desc(orig));
      else if (was) add(day, `${t("Hvile")} · ${t("Trænerråd")}`, desc(orig));
    }
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ultraplan//Plan//DA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc("Ultraplan")}`, ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

export function downloadICS(text, name = "ultraplan.ics") {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
