import Figure from "./figures.jsx";
import { dayTypeLabel } from "./nutrition.js";
import { t } from "./i18n.js";

/* One strength session: figure, name, sets × reps, and the one-line technique behind a tap. */
export function StrengthSession({ session, rest, showHow = true, compact = false }) {
  if (!session) return null;
  return (
    <div className={`ex-session ${compact ? "compact" : ""}`}>
      {!compact && <div className="ex-head"><b>{session.name}</b><span className="muted"> · {session.focus}{session.minutes ? ` · ${t("ca. {n} min", { n: session.minutes })}` : ""}{rest ? ` · ${t("pause {rest}", { rest })}` : ""}</span></div>}
      <div className="ex-list">
        {session.exercises.map((e, i) => (
          <div className="ex" key={i}>
            <Figure pattern={e.pattern} name={e.name} size={compact ? 40 : 52} />
            <div>
              <b>{e.label || e.name}</b>{e.sets ? <span className="ex-dose"> {e.sets}×{e.reps}</span> : null}
              {showHow && e.how && <details className="ex-how"><summary>{t("Sådan")}</summary><p>{e.how}</p></details>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Today's nutrition: the numbers, the reason, and the day's meals behind a tap. The ideas rotate with the date; the meal
   before and after the session are tagged, long runs get a line for what to take along, and "Andre forslag" rolls new ones. */
export function NutritionCard({ targets, meals, title = t("Dagens kost"), open = false, onMore }) {
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
