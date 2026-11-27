import Figure from "./figures.jsx";
import { dayTypeLabel } from "./nutrition.js";
import { t, getLang } from "./i18n.js";
import { liftInfo } from "./lifts.js";

// Patterns done with body weight, a band or a jump: no kilo field there.
const NO_KG = new Set(["core", "hop", "hip", "back"]);
export const fmtKg = (kg) => String(kg).replace(".", getLang() === "da" ? "," : ".");

/* One strength session: figure, name, sets × reps, and the one-line technique behind a tap. */
/* With `onLift` every weighted exercise gets a kilo field: it shows last time's weight, suggests the next step once the
   same weight was lifted twice in a row, and marks a record. `lifts` is p.lifts, `day` the day being logged. */
export function StrengthSession({ session, rest, showHow = true, compact = false, lifts, day, onLift }) {
  if (!session) return null;
  return (
    <div className={`ex-session ${compact ? "compact" : ""}`}>
      {!compact && <div className="ex-head"><b>{session.name}</b><span className="muted"> · {session.focus}{session.minutes ? ` · ${t("ca. {n} min", { n: session.minutes })}` : ""}{rest ? ` · ${t("pause {rest}", { rest })}` : ""}</span></div>}
      <div className="ex-list">
        {session.exercises.map((e, i) => (
          <div className="ex" key={i}>
            <Figure pattern={e.pattern} name={e.name} size={compact ? 40 : 52} />
            <div>
              <b>{e.label || e.name}</b>{e.sets && !(e.label || "").includes(`${e.sets}×`) ? <span className="ex-dose"> {e.sets}×{e.reps}</span> : null}
              {showHow && e.how && <details className="ex-how"><summary>{t("Sådan")}</summary><p>{e.how}</p></details>}
              {onLift && !NO_KG.has(e.pattern) && (() => { const li = liftInfo(lifts, e.name, day); return (
                <div className="ex-kg">
                  <input type="text" inputMode="decimal" key={`${day}-${li.today ?? ""}`} defaultValue={li.today != null ? fmtKg(li.today) : ""} placeholder={li.next ? fmtKg(li.next) : li.last ? fmtKg(li.last[1]) : "–"} aria-label={t("Kg i {name}", { name: e.label || e.name })}
                    onBlur={(ev) => { if (ev.target.value.trim() !== (li.today != null ? fmtKg(li.today) : "")) onLift(e.name, ev.target.value); }} onKeyDown={(ev) => { if (ev.key === "Enter") ev.target.blur(); }} />
                  <span className="ex-kg-unit">kg</span>
                  {li.record ? <span className="ex-pr">{t("Ny rekord")}</span>
                    : li.today != null ? (li.last ? <span className="muted">{t("sidst {kg}", { kg: fmtKg(li.last[1]) })}</span> : null)
                    : li.next ? <span className="ex-next">{t("samme vægt to gange: prøv {kg}", { kg: fmtKg(li.next) })}</span>
                    : li.last ? <span className="muted">{t("sidst {kg}", { kg: fmtKg(li.last[1]) })}</span> : null}
                </div>); })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Today's nutrition: the numbers, the reason, and the day's meals behind a tap. The ideas rotate with the date; the meal
   before and after the session are tagged, long runs get a line for what to take along, and "Andre forslag" rolls new ones. */
export function NutritionCard({ targets, meals, title = t("Dagens kost"), open = false, onMore, onSetup }) {
  // Without weight, height and age there is no energy to compute (it read "10 kcal · 0 g protein"): ask for them.
  if (onSetup) return (
    <section className="panel kost">
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p className="muted" style={{ margin: "8px 0 0" }}>{t("Skriv din vægt, højde og alder under Mere → Dig, så regner appen dagens kost ud.")} <button type="button" className="linkbtn" onClick={onSetup}>{t("Udfyld Dig")}</button></p>
    </section>
  );
  if (!targets) return null;
  return (
    <section className="panel kost">
      <div className="row-between"><h2 style={{ margin: 0 }}>{title}</h2><span className="muted">{dayTypeLabel(targets.dayType)} · {targets.kcal} kcal · {targets.protein} g {t("protein")}</span></div>
      {meals && (
        <details className="meals" open={open}>
          <summary>{t("Forslag til dagens måltider")}</summary>
          <p className="muted" style={{ margin: "8px 0 0" }}>{targets.kcal} kcal · {targets.protein} g {t("protein")} · {targets.carbs} g {t("kulhydrat")} · {targets.fat} g {t("fedt")}. {targets.note}</p>
          <ul>{meals.rows.map((m) => <li key={m.meal} className={m.tag ? "tagged" : ""}><b>{m.meal}{m.tag ? <em> · {m.tag}</em> : null}<small>~{m.protein} g {t("protein")}</small></b><span>{m.text}</span></li>)}</ul>
          {(meals.fuel || meals.after) && <p className="fuel">{[meals.fuel, meals.after].filter(Boolean).join(" ")}</p>}
          <p className="muted season">{meals.season}</p>
          {onMore && <div className="panel-foot"><button type="button" className="linkbtn" onClick={onMore}>{t("Andre forslag")}</button></div>}
          <p className="muted">{meals.hint} {t("Tallene er et estimat. Vægten og energien i hverdagen afgør, om de passer.")}</p>
        </details>
      )}
    </section>
  );
}
