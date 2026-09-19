import { useMemo, useState } from "react";
import { t, tn } from "./i18n.js";
import { parseTime, fmtTime, fmtPace, paceToMin, predictFinish, splits, fuelling, kitList, loadKit, saveKit } from "./race.js";

/* Løbsdag: goal time and prediction, pacing splits, fuelling and the kit list. Shown under Plan; opens from the race
   card on I dag. The kit ticks live on the device only (they are not training data). */
export default function RaceDay({ p, easyPace, onGoal }) {
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
      <h3 className="sub">{t("Pakkeliste")} <span className="muted">· {t("{done} af {n}", { done, n: all.length })}</span></h3>
      <div className="progress"><span style={{ width: `${all.length ? Math.round((done / all.length) * 100) : 0}%` }} /></div>
      <div className="kit">
        {kit.map((s) => (
          <div key={s.key}><b>{s.title}</b>
            {s.items.map((x) => <label key={x.id} className={`check ${ticks[x.id] ? "on" : ""}`}><input type="checkbox" checked={!!ticks[x.id]} onChange={() => toggle(x.id)} /> {x.name}</label>)}
          </div>
        ))}
      </div>
      <p className="foot">{t("Skøn ud fra distance, højdemeter og dit tempo. Løbets egne krav til udstyr går altid forud.")}</p>
    </div>
  );
}
