import { useMemo, useState } from "react";
import { t, tn } from "./i18n.js";
import { parseTime, fmtTime, fmtPace, paceToMin, predictFinish, splits, fuelling, kitList, loadKit, saveKit } from "./race.js";

/* Løbsdag: goal time and prediction, pacing splits, fuelling and the kit list. Shown under Plan; opens from the race
   card on I dag. The kit ticks live on the device only (they are not training data). */
/* Lap plan: laps with a target time each (stop budget included), clock time at every lap from the start time,
   moving pace once the stop budget is taken out, and the margin to the cutoff. */
const clock = (startHHMM, min) => { const [h, m] = String(startHHMM || "06:00").split(":").map(Number); const tot = h * 60 + m + Math.round(min); return `${String(Math.floor(tot / 60) % 24).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`; };
function LapPlan({ lp, raceVert }) {
  let cum = 0, km = 0;
  const vPer = raceVert ? Math.round(raceVert / lp.laps.length) : null;
  const rows = lp.laps.map((l, i) => { const target = parseTime(l.target) || 0; cum += target; km += +l.km; const moving = Math.max(1, target - (lp.stopMin || 0)); return { n: i + 1, km: Math.round(km * 10) / 10, lapKm: +l.km, target, moving, pace: moving / +l.km, cum, at: clock(lp.start, cum) }; });
  const total = rows.length ? rows[rows.length - 1].cum : 0;
  const cutIdx = (lp.cutoffAfterLap || rows.length - 1) - 1;
  const cutRow = rows[cutIdx];
  const [ch, cm] = String(lp.cutoff || "").split(":").map(Number);
  const [sh, sm] = String(lp.start || "06:00").split(":").map(Number);
  const margin = cutRow && !isNaN(ch) ? ch * 60 + cm - (sh * 60 + sm + cutRow.cum) : null;
  return (
    <>
      <h3 className="sub">{t("Løbsplan · {n} omgange · {time} i mål", { n: rows.length, time: fmtTime(total) })}</h3>
      <p className="muted">{t("Start {start}. Måltiderne pr. omgang inkluderer et stopbudget på {stop} min ved depotet; løbetiden er resten.", { start: lp.start, stop: lp.stopMin || 0 })}{vPer ? ` ${t("Ca. {v} m+ pr. omgang.", { v: vPer })}` : ""} {t("min/km er tempoet i løbetiden.")}</p>
      <div className="scroll"><table className="splits laps">
        <thead><tr><th>{t("Omg.")}</th><th className="num">km</th><th className="num">{t("mål")}</th><th className="num hide-phone">{t("løbetid")}</th><th className="num">{t("min/km")}</th><th className="num">{t("klokken")}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.n} className={r.n - 1 === cutIdx ? "cut" : ""}><td><b>{r.n}</b>{vPer ? <small className="muted hide-phone"> · {vPer} m+</small> : null}</td><td className="num">{r.km.toLocaleString()}</td><td className="num"><b>{fmtTime(r.target)}</b></td><td className="num muted hide-phone">{fmtTime(r.moving)}</td><td className="num">{fmtPace(r.pace)}</td><td className="num"><b>{r.at}</b></td></tr>)}</tbody>
      </table></div>
      {margin != null && <div className={`advice ${margin < 30 ? "warn" : ""}`}>{t("Cutoff {cutoff} for at gå ud på omgang {n}. Med planen er du der {at}, {m} før cutoff.", { cutoff: lp.cutoff, n: cutIdx + 2, at: cutRow.at, m: fmtTime(Math.abs(margin)) })}{margin < 0 ? ` ${t("Det er efter cutoff – sæt tempoet op eller skær ned på stop.")}` : ""}</div>}
      <ul className="tips-list">
        <li>{t("Omgang 1 føles for let. Det skal den: 2:40 er mere end nok, selv i mørke.")}</li>
        <li>{t("Stopbudget {stop} min pr. omgang: fyld flasker, tag mad med, og gå videre. Spis mens du går.", { stop: lp.stopMin || 0 })}</li>
        <li>{t("Er du bagud efter omgang 2, så hold tempoet og skær i stoppene – ikke i maden.")}</li>
      </ul>
    </>
  );
}

export default function RaceDay({ p, easyPace, onGoal, lapPlan }) {
  const [tab, setTab] = useState(lapPlan ? "laps" : "pace");
  const km = +p.raceKm > 0 ? +p.raceKm : 0;
  const vert = +p.raceVert || 0;
  const easyPaceMinKm = paceToMin(easyPace);
  const predicted = km ? predictFinish({ km, vert, easyPaceMinKm, level: p.level || 2 }) : null;
  const goalMin = parseTime(p.raceGoal);
  const totalMin = goalMin || predicted;
  const fuel = useMemo(() => (totalMin ? fuelling({ totalMin }) : null), [totalMin]);
  const rows = useMemo(() => (totalMin && km ? splits({ km, totalMin, vert, carbsPerHour: fuel.carbsPerHour, mlPerHour: fuel.mlPerHour }) : []), [km, totalMin, vert, fuel]);
  const kit = useMemo(() => kitList({ km, vert, dateISO: p.raceDate, totalMin: totalMin || 0 }), [km, vert, p.raceDate, totalMin]);
  const [ticks, setTicks] = useState(loadKit);
  const toggle = (id) => { const n = { ...ticks, [id]: !ticks[id] }; setTicks(n); saveKit(n); };
  const all = kit.flatMap((s) => s.items); const done = all.filter((x) => ticks[x.id]).length;
  if (!km) return <p className="muted">{t("Skriv løbets distance under Mere → Løbet, så regner appen pacing, mad og pakkeliste ud.")}</p>;
  return (
    <div className="raceday">
      <div className="seg" role="tablist">
        {lapPlan && <button type="button" role="tab" aria-selected={tab === "laps"} className={tab === "laps" ? "on" : ""} onClick={() => setTab("laps")}>{t("Løbsplan")}</button>}
        <button type="button" role="tab" aria-selected={tab === "pace"} className={tab === "pace" ? "on" : ""} onClick={() => setTab("pace")}>{t("Pacing og mad")}</button>
        <button type="button" role="tab" aria-selected={tab === "kit"} className={tab === "kit" ? "on" : ""} onClick={() => setTab("kit")}>{t("Pakkeliste")}</button>
      </div>
      {tab === "laps" && lapPlan && <LapPlan lp={lapPlan} raceVert={vert} />}
      {tab === "pace" && <>
      <div className="row2">
        <label>{t("Måltid (t:mm)")}<input type="text" inputMode="numeric" placeholder={predicted ? fmtTime(predicted) : "12:30"} value={p.raceGoal || ""} onChange={(e) => onGoal(e.target.value)} /></label>
        <div className="racepred"><span className="muted">{t("Appens skøn")}</span><b>{predicted ? fmtTime(predicted) : "–"}</b><small className="muted">{easyPaceMinKm ? t("ud fra dit rolige tempo {pace}/km, {km} km og {vert} m+", { pace: easyPace, km, vert }) : t("ud fra dit niveau, {km} km og {vert} m+ (log rolige ture, så bliver skønnet dit eget)", { km, vert })}</small></div>
      </div>
      {p.raceGoal && !goalMin && <div className="advice warn">{t("Skriv tiden som timer:minutter, fx 12:30.")}</div>}
      {rows.length > 0 && (
        <>
          <h3 className="sub">{t("Pacing · {time} i mål", { time: fmtTime(totalMin) })}</h3>
          <p className="muted">{t("Kontrolleret start og et lille planlagt fald: de sidste kilometer er altid langsommere. Tempoet er inkl. gang på stigningerne.")}</p>
          <div className="scroll"><table className="splits">
            <thead><tr><th>km</th><th className="num">{t("min/km")}</th><th className="num">{t("tid")}</th><th className="num">m+</th><th className="num">{t("kulh. g")}</th><th className="num">ml</th><th></th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.km}><td><b>{r.km}</b></td><td className="num">{fmtPace(r.pace)}</td><td className="num"><b>{fmtTime(r.cum)}</b></td><td className="num muted">{r.climb || ""}</td><td className="num">{r.carbs}</td><td className="num">{r.ml}</td><td className="muted">{r.note}</td></tr>)}</tbody>
          </table></div>
          <h3 className="sub">{t("Mad og drikke undervejs")}</h3>
          <div className="tiles small">
            <div className="tile"><span>{t("Kulhydrat")}</span><b>{fuel.carbsPerHour} {t("g/t")}</b><small>{t("{n} g i alt ≈ {gels} gels (25 g)", { n: fuel.carbs, gels: fuel.gels })}</small></div>
            <div className="tile"><span>{t("Væske")}</span><b>{fuel.mlPerHour} {t("ml/t")}</b><small>{t("{n} l i alt", { n: (fuel.ml / 1000).toFixed(1) })}</small></div>
            <div className="tile"><span>{t("Natrium")}</span><b>{fuel.naPerHour} {t("mg/t")}</b><small>{t("{n} g i alt", { n: (fuel.na / 1000).toFixed(1) })}</small></div>
          </div>
          <ul className="tips-list">{fuel.tips.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      </>}
      {tab === "kit" && <>
      <h3 className="sub">{t("Pakkeliste")} <span className="muted">· {t("{done} af {n}", { done, n: all.length })}</span></h3>
      <div className="progress"><span style={{ width: `${all.length ? Math.round((done / all.length) * 100) : 0}%` }} /></div>
      <div className="kit">
        {kit.map((s) => (
          <div key={s.key}><b>{s.title}</b>
            {s.items.map((x) => <label key={x.id} className={`check ${ticks[x.id] ? "on" : ""}`}><input type="checkbox" checked={!!ticks[x.id]} onChange={() => toggle(x.id)} /> {x.name}</label>)}
          </div>
        ))}
      </div>
      </>}
      <p className="foot">{t("Skøn ud fra distance, højdemeter og dit tempo. Løbets egne krav til udstyr går altid forud.")}</p>
    </div>
  );
}
