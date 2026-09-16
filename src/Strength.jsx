import Figure from "./figures.jsx";
import { dayTypeLabel } from "./nutrition.js";

/* One strength session: figure, name, sets × reps, and the one-line technique behind a tap. */
export function StrengthSession({ session, rest, showHow = true, compact = false }) {
  if (!session) return null;
  return (
    <div className={`ex-session ${compact ? "compact" : ""}`}>
      {!compact && <div className="ex-head"><b>{session.name}</b><span className="muted"> · {session.focus}{session.minutes ? ` · ca. ${session.minutes} min` : ""}{rest ? ` · pause ${rest}` : ""}</span></div>}
      <div className="ex-list">
        {session.exercises.map((e, i) => (
          <div className="ex" key={i}>
            <Figure pattern={e.pattern} name={e.name} size={compact ? 40 : 52} />
            <div>
              <b>{e.name}</b>{e.sets ? <span className="ex-dose"> {e.sets}×{e.reps}</span> : null}
              {showHow && e.how && <details className="ex-how"><summary>Sådan</summary><p>{e.how}</p></details>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Today's nutrition: the numbers, the reason, and four meal ideas behind a tap. */
export function NutritionCard({ targets, meals, title = "Dagens kost", open = false }) {
  if (!targets) return null;
  return (
    <section className="panel kost">
      <div className="row-between"><h2 style={{ margin: 0 }}>{title}</h2><span className="muted">{dayTypeLabel(targets.dayType)}</span></div>
      <div className="macros">
        <div><b>{targets.kcal}</b><small>kcal</small></div>
        <div><b>{targets.protein} g</b><small>protein</small></div>
        <div><b>{targets.carbs} g</b><small>kulhydrat</small></div>
        <div><b>{targets.fat} g</b><small>fedt</small></div>
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>{targets.note}</p>
      {meals && (
        <details className="meals" open={open}>
          <summary>Forslag til dagens måltider</summary>
          <ul>{meals.rows.map((m) => <li key={m.meal}><b>{m.meal}</b><span>{m.text}</span></li>)}</ul>
          <p className="muted">{meals.hint} Tallene er et estimat. Vægten og energien i hverdagen afgør, om de passer.</p>
        </details>
      )}
    </section>
  );
}
